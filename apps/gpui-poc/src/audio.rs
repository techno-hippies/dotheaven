//! Audio playback engine — ported from Tauri audio.rs.
//! Uses symphonia (decode) + cpal (output) + rubato (resample) + ringbuf (lock-free).
//! Runs a background thread; commands sent via mpsc channel.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::{HeapConsumer, HeapProducer, HeapRb};
use rubato::{
    Resampler, SincFixedOut, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use std::fs::File;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, Track};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;
use symphonia::default::{get_codecs, get_probe};

mod decoder_output;
mod engine;

// =============================================================================
// Public types
// =============================================================================

/// Current playback state, readable from UI thread via Arc<Mutex<>>.
#[derive(Debug, Clone)]
pub struct PlaybackState {
    pub playing: bool,
    pub track_path: Option<String>,
    pub artist: Option<String>,
    pub cover_path: Option<String>,
    pub duration: Option<f64>,
    pub position: f64,
    pub volume: f64,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            playing: false,
            track_path: None,
            artist: None,
            cover_path: None,
            duration: None,
            position: 0.0,
            volume: 1.0,
        }
    }
}

/// Handle for sending commands to the audio thread.
#[derive(Clone)]
pub struct AudioHandle {
    sender: Sender<Command>,
    pub state: Arc<Mutex<PlaybackState>>,
}

impl AudioHandle {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        let state = Arc::new(Mutex::new(PlaybackState::default()));
        let state2 = state.clone();

        thread::spawn(move || {
            if let Err(err) = engine::run_audio_thread(receiver, state2) {
                log::error!("audio thread failed: {err}");
            }
        });

        Self { sender, state }
    }

    pub fn play(
        &self,
        path: &str,
        seek: Option<f64>,
        artist: Option<String>,
        cover_path: Option<String>,
    ) {
        let _ = self.sender.send(Command::Play {
            path: path.to_string(),
            seek,
            artist,
            cover_path,
        });
    }

    pub fn pause(&self) {
        let _ = self.sender.send(Command::Pause);
    }

    pub fn resume(&self) {
        let _ = self.sender.send(Command::Resume);
    }

    pub fn stop(&self) {
        let _ = self.sender.send(Command::Stop);
    }

    pub fn seek(&self, position: f64, play: bool) {
        let _ = self.sender.send(Command::Seek { position, play });
    }

    pub fn set_volume(&self, volume: f64) {
        let _ = self.sender.send(Command::Volume { volume });
    }

    pub fn read_state(&self) -> PlaybackState {
        self.state.lock().unwrap().clone()
    }
}

// =============================================================================
// Internal types
// =============================================================================

#[derive(Default)]
struct PlaybackClock {
    base_position: f64,
    started_at: Option<Instant>,
}

impl PlaybackClock {
    fn start(&mut self) {
        self.started_at = Some(Instant::now());
    }

    fn pause(&mut self) {
        if let Some(started) = self.started_at.take() {
            self.base_position += started.elapsed().as_secs_f64();
        }
    }

    fn set_position(&mut self, position: f64) {
        self.base_position = position.max(0.0);
        self.started_at = Some(Instant::now());
    }

    fn position(&self) -> f64 {
        match self.started_at {
            Some(started) => self.base_position + started.elapsed().as_secs_f64(),
            None => self.base_position,
        }
    }
}

struct OutputState {
    _stream: cpal::Stream,
    producer: HeapProducer<f32>,
    sample_rate: u32,
    channels: u16,
}

struct DecoderState {
    reader: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    sample_rate: u32,
    channels: usize,
    duration: Option<f64>,
}

struct ResamplerState {
    resampler: SincFixedOut<f32>,
    input_buf: Vec<Vec<f32>>,
    channels: usize,
}

impl ResamplerState {
    fn new(input_rate: u32, output_rate: u32, channels: usize) -> Result<Self, String> {
        let ratio = output_rate as f64 / input_rate as f64;
        let params = SincInterpolationParameters {
            sinc_len: 128,
            f_cutoff: 0.95,
            oversampling_factor: 128,
            interpolation: SincInterpolationType::Cubic,
            window: WindowFunction::BlackmanHarris2,
        };
        let chunk_size = 1024;
        let resampler = SincFixedOut::<f32>::new(ratio, 2.0, params, chunk_size, channels)
            .map_err(|e| format!("Resampler construction error: {e}"))?;
        let input_buf = vec![Vec::new(); channels];
        log::info!(
            "rubato resampler: {}→{}Hz (ratio {:.6}), {}ch",
            input_rate,
            output_rate,
            ratio,
            channels
        );
        Ok(Self {
            resampler,
            input_buf,
            channels,
        })
    }

    fn process_interleaved(&mut self, interleaved: &[f32]) -> Result<Vec<f32>, String> {
        let channels = self.channels;
        let in_frames = interleaved.len() / channels;

        for frame in 0..in_frames {
            for ch in 0..channels {
                self.input_buf[ch].push(interleaved[frame * channels + ch]);
            }
        }

        let mut out_interleaved = Vec::new();

        loop {
            let needed = self.resampler.input_frames_next();
            if self.input_buf[0].len() < needed {
                break;
            }

            let input_refs: Vec<&[f32]> = self.input_buf.iter().map(|ch| &ch[..needed]).collect();

            let out_frames = self.resampler.output_frames_next();
            let mut output_buf: Vec<Vec<f32>> = vec![vec![0.0; out_frames]; channels];
            let mut output_refs: Vec<&mut [f32]> =
                output_buf.iter_mut().map(|ch| ch.as_mut_slice()).collect();

            let (_in_used, out_written) = self
                .resampler
                .process_into_buffer(&input_refs, &mut output_refs, None)
                .map_err(|e| format!("Resample error: {e}"))?;

            for ch_buf in &mut self.input_buf {
                ch_buf.drain(..needed);
            }

            for frame in 0..out_written {
                for ch in 0..channels {
                    out_interleaved.push(output_buf[ch][frame]);
                }
            }
        }

        Ok(out_interleaved)
    }

    fn drain(&mut self) -> Result<Vec<f32>, String> {
        let channels = self.channels;
        let remaining = self.input_buf[0].len();
        if remaining == 0 {
            return Ok(Vec::new());
        }

        let needed = self.resampler.input_frames_next();
        for ch_buf in &mut self.input_buf {
            ch_buf.resize(needed, 0.0);
        }

        let input_refs: Vec<&[f32]> = self.input_buf.iter().map(|ch| ch.as_slice()).collect();
        let out_frames = self.resampler.output_frames_next();
        let mut output_buf: Vec<Vec<f32>> = vec![vec![0.0; out_frames]; channels];
        let mut output_refs: Vec<&mut [f32]> =
            output_buf.iter_mut().map(|ch| ch.as_mut_slice()).collect();

        let (_in_used, out_written) = self
            .resampler
            .process_into_buffer(&input_refs, &mut output_refs, None)
            .map_err(|e| format!("Resample drain error: {e}"))?;

        for ch_buf in &mut self.input_buf {
            ch_buf.clear();
        }

        let ratio = self.resampler.output_frames_next() as f64 / needed as f64;
        let real_out = ((remaining as f64) * ratio).ceil() as usize;
        let capped = real_out.min(out_written);

        let mut out_interleaved = Vec::with_capacity(capped * channels);
        for frame in 0..capped {
            for ch in 0..channels {
                out_interleaved.push(output_buf[ch][frame]);
            }
        }
        Ok(out_interleaved)
    }

    fn reset(&mut self) {
        self.resampler.reset();
        for ch_buf in &mut self.input_buf {
            ch_buf.clear();
        }
    }
}

struct AudioInner {
    output: Option<OutputState>,
    decoder: Option<DecoderState>,
    resampler: Option<ResamplerState>,
    current_path: Option<String>,
    paused: bool,
    volume: f32,
    clock: PlaybackClock,
    pending: Option<Vec<f32>>,
    pending_index: usize,
}

enum Command {
    Play {
        path: String,
        seek: Option<f64>,
        artist: Option<String>,
        cover_path: Option<String>,
    },
    Pause,
    Resume,
    Stop,
    Seek {
        position: f64,
        play: bool,
    },
    Volume {
        volume: f64,
    },
}

// =============================================================================
// Decoder + output helpers
// =============================================================================
