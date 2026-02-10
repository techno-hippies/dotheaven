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
            if let Err(err) = run_audio_thread(receiver, state2) {
                log::error!("audio thread failed: {err}");
            }
        });

        Self { sender, state }
    }

    pub fn play(&self, path: &str, seek: Option<f64>, artist: Option<String>, cover_path: Option<String>) {
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

            let input_refs: Vec<&[f32]> =
                self.input_buf.iter().map(|ch| &ch[..needed]).collect();

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
    Play { path: String, seek: Option<f64>, artist: Option<String>, cover_path: Option<String> },
    Pause,
    Resume,
    Stop,
    Seek { position: f64, play: bool },
    Volume { volume: f64 },
}

// =============================================================================
// Decoder + output helpers
// =============================================================================

fn first_supported_track(tracks: &[Track]) -> Option<&Track> {
    tracks
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
}

fn open_decoder(path: &str, seek: Option<f64>) -> Result<DecoderState, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Probe error: {e}"))?;

    let mut reader = probed.format;
    let track = first_supported_track(reader.tracks())
        .ok_or_else(|| "No supported audio tracks".to_string())?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let sample_rate = codec_params.sample_rate.unwrap_or(44100);
    let channels = codec_params.channels.map(|c| c.count()).unwrap_or(2);
    let duration = codec_params
        .n_frames
        .map(|frames| frames as f64 / sample_rate as f64);

    if let Some(seek_pos) = seek {
        if seek_pos > 0.0 {
            let seek_to = SeekTo::Time {
                time: Time::from(seek_pos),
                track_id: Some(track_id),
            };
            let _ = reader.seek(SeekMode::Coarse, seek_to);
        }
    }

    let decoder = get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Decoder error: {e}"))?;

    Ok(DecoderState {
        reader,
        decoder,
        track_id,
        sample_rate,
        channels,
        duration,
    })
}

fn build_output() -> Result<OutputState, String> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| "No default audio output device".to_string())?;

    let config = device
        .default_output_config()
        .map_err(|e| format!("Default output config error: {e}"))?;

    log::info!(
        "cpal output: {}Hz, {}ch, {:?}",
        config.sample_rate().0,
        config.channels(),
        config.sample_format()
    );

    let output_rate = config.sample_rate().0;
    let output_channels = config.channels();

    let frames = (output_rate as usize / 8).max(2048);
    let capacity = (frames * output_channels as usize).max(1);
    let rb = HeapRb::<f32>::new(capacity);
    let (producer, mut consumer) = rb.split();

    let err_fn = |err| eprintln!("audio stream error: {err}");
    let stream_config: cpal::StreamConfig = config.clone().into();

    macro_rules! build_stream {
        ($t:ty) => {
            device
                .build_output_stream(
                    &stream_config,
                    move |data: &mut [$t], _| fill_output(data, &mut consumer),
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Stream error: {e}"))?
        };
    }

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_stream!(f32),
        cpal::SampleFormat::F64 => build_stream!(f64),
        cpal::SampleFormat::I8 => build_stream!(i8),
        cpal::SampleFormat::I16 => build_stream!(i16),
        cpal::SampleFormat::I32 => build_stream!(i32),
        cpal::SampleFormat::I64 => build_stream!(i64),
        cpal::SampleFormat::U8 => build_stream!(u8),
        cpal::SampleFormat::U16 => build_stream!(u16),
        cpal::SampleFormat::U32 => build_stream!(u32),
        cpal::SampleFormat::U64 => build_stream!(u64),
        _ => return Err("Unsupported sample format".to_string()),
    };

    stream
        .play()
        .map_err(|e| format!("Stream play error: {e}"))?;

    Ok(OutputState {
        _stream: stream,
        producer,
        sample_rate: output_rate,
        channels: output_channels,
    })
}

fn fill_output<T: cpal::Sample + cpal::FromSample<f32>>(
    output: &mut [T],
    consumer: &mut HeapConsumer<f32>,
) {
    for sample in output.iter_mut() {
        let value = consumer.pop().unwrap_or(0.0);
        *sample = T::from_sample(value);
    }
}

fn convert_channels(samples: &[f32], in_channels: usize, out_channels: usize) -> Vec<f32> {
    if in_channels == out_channels {
        return samples.to_vec();
    }

    let frames = samples.len() / in_channels;
    let mut out = vec![0.0; frames * out_channels];

    for frame in 0..frames {
        for ch in 0..out_channels {
            let value = if in_channels == 1 {
                samples[frame]
            } else if out_channels == 1 {
                let left = samples[frame * in_channels];
                let right = samples[frame * in_channels + 1];
                (left + right) * 0.5
            } else if ch < in_channels {
                samples[frame * in_channels + ch]
            } else {
                samples[frame * in_channels]
            };
            out[frame * out_channels + ch] = value;
        }
    }

    out
}

fn decode_next(
    decoder_state: &mut DecoderState,
    resampler: &mut Option<ResamplerState>,
    output_channels: usize,
) -> Result<Option<Vec<f32>>, String> {
    loop {
        let packet = match decoder_state.reader.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(err)) => {
                if err.kind() == std::io::ErrorKind::UnexpectedEof {
                    return Ok(None);
                }
                return Err(format!("Packet error: {err}"));
            }
            Err(err) => return Err(format!("Packet error: {err}")),
        };

        if packet.track_id() != decoder_state.track_id {
            continue;
        }

        let decoded = match decoder_state.decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::ResetRequired) => {
                let track = decoder_state
                    .reader
                    .tracks()
                    .iter()
                    .find(|t| t.id == decoder_state.track_id)
                    .ok_or_else(|| "Track not found".to_string())?;
                decoder_state.decoder = get_codecs()
                    .make(&track.codec_params, &DecoderOptions::default())
                    .map_err(|e| format!("Decoder reset error: {e}"))?;
                continue;
            }
            Err(err) => return Err(format!("Decode error: {err}")),
        };

        let mut sample_buf = SampleBuffer::<f32>::new(decoded.frames() as u64, *decoded.spec());
        sample_buf.copy_interleaved_ref(decoded);
        let mut samples = sample_buf.samples().to_vec();

        if decoder_state.channels != output_channels {
            samples = convert_channels(&samples, decoder_state.channels, output_channels);
        }

        if let Some(rs) = resampler.as_mut() {
            samples = rs.process_interleaved(&samples)?;
            if samples.is_empty() {
                continue;
            }
        }

        return Ok(Some(samples));
    }
}

fn seek_decoder(decoder_state: &mut DecoderState, position: f64) -> Result<(), String> {
    let seek_to = SeekTo::Time {
        time: Time::from(position.max(0.0)),
        track_id: Some(decoder_state.track_id),
    };
    decoder_state
        .reader
        .seek(SeekMode::Coarse, seek_to)
        .map_err(|e| format!("Seek error: {e}"))?;
    decoder_state.decoder.reset();
    Ok(())
}

// =============================================================================
// Command handling
// =============================================================================

fn handle_command(
    command: Command,
    inner: &mut AudioInner,
    shared: &Arc<Mutex<PlaybackState>>,
) -> Result<(), String> {
    match command {
        Command::Play { path, seek, artist, cover_path } => {
            let decoder = open_decoder(&path, seek)?;

            if inner.output.is_none() {
                inner.output = Some(build_output()?);
            }

            let output = inner.output.as_ref().unwrap();
            let out_rate = output.sample_rate;
            let out_ch = output.channels as usize;

            if decoder.sample_rate != out_rate {
                inner.resampler =
                    Some(ResamplerState::new(decoder.sample_rate, out_rate, out_ch)?);
            } else {
                inner.resampler = None;
            }

            let duration = decoder.duration;
            inner.decoder = Some(decoder);
            inner.current_path = Some(path.clone());
            inner.paused = false;
            inner.clock = PlaybackClock::default();
            inner.pending = None;
            inner.pending_index = 0;
            if let Some(seek_pos) = seek {
                inner.clock.set_position(seek_pos);
            } else {
                inner.clock.start();
            }

            let mut s = shared.lock().unwrap();
            s.playing = true;
            s.track_path = Some(path);
            s.artist = artist;
            s.cover_path = cover_path;
            s.duration = duration;
            s.position = seek.unwrap_or(0.0);
        }
        Command::Pause => {
            inner.paused = true;
            inner.clock.pause();
            inner.pending = None;
            inner.pending_index = 0;
            inner.output = Some(build_output()?);

            shared.lock().unwrap().playing = false;
        }
        Command::Resume => {
            if inner.decoder.is_some() {
                inner.paused = false;
                inner.clock.start();
                shared.lock().unwrap().playing = true;
            }
        }
        Command::Stop => {
            inner.decoder = None;
            inner.resampler = None;
            inner.current_path = None;
            inner.paused = true;
            inner.clock = PlaybackClock::default();
            inner.pending = None;
            inner.pending_index = 0;

            let mut s = shared.lock().unwrap();
            s.playing = false;
            s.track_path = None;
            s.duration = None;
            s.position = 0.0;
        }
        Command::Seek { position, play } => {
            let path = match inner.current_path.clone() {
                Some(path) => path,
                None => return Ok(()),
            };
            if let Some(decoder) = inner.decoder.as_mut() {
                seek_decoder(decoder, position)?;
            } else {
                let decoder = open_decoder(&path, Some(position))?;
                inner.decoder = Some(decoder);
            }
            inner.output = Some(build_output()?);
            if let Some(rs) = inner.resampler.as_mut() {
                rs.reset();
            }
            inner.paused = !play;
            inner.clock = PlaybackClock::default();
            inner.clock.set_position(position);
            if !play {
                inner.clock.pause();
            }
            inner.pending = None;
            inner.pending_index = 0;

            let mut s = shared.lock().unwrap();
            s.playing = play;
            s.position = position;
        }
        Command::Volume { volume } => {
            inner.volume = volume.clamp(0.0, 1.0) as f32;
            shared.lock().unwrap().volume = volume.clamp(0.0, 1.0);
        }
    }

    Ok(())
}

// =============================================================================
// Audio thread
// =============================================================================

fn run_audio_thread(
    receiver: Receiver<Command>,
    shared: Arc<Mutex<PlaybackState>>,
) -> Result<(), String> {
    let mut inner = AudioInner {
        output: None,
        decoder: None,
        resampler: None,
        current_path: None,
        paused: true,
        volume: 1.0,
        clock: PlaybackClock::default(),
        pending: None,
        pending_index: 0,
    };

    let mut last_emit = Instant::now();

    loop {
        while let Ok(cmd) = receiver.try_recv() {
            if let Err(err) = handle_command(cmd, &mut inner, &shared) {
                log::error!("audio command error: {err}");
            }
        }

        let has_both = inner.output.is_some() && inner.decoder.is_some();
        if has_both && !inner.paused {
            let output_channels = inner.output.as_ref().unwrap().channels as usize;

            if inner.pending.is_none() {
                let decoder = inner.decoder.as_mut().unwrap();
                match decode_next(decoder, &mut inner.resampler, output_channels) {
                    Ok(Some(mut samples)) => {
                        let volume = inner.volume;
                        if (volume - 1.0).abs() > f32::EPSILON {
                            for sample in &mut samples {
                                *sample *= volume;
                            }
                        }
                        inner.pending = Some(samples);
                        inner.pending_index = 0;
                    }
                    Ok(None) => {
                        if let Some(rs) = inner.resampler.as_mut() {
                            match rs.drain() {
                                Ok(mut tail) if !tail.is_empty() => {
                                    let volume = inner.volume;
                                    if (volume - 1.0).abs() > f32::EPSILON {
                                        for sample in &mut tail {
                                            *sample *= volume;
                                        }
                                    }
                                    inner.pending = Some(tail);
                                    inner.pending_index = 0;
                                }
                                _ => {}
                            }
                        }
                        inner.decoder = None;
                        inner.resampler = None;
                        inner.paused = true;
                        inner.clock.pause();

                        let mut s = shared.lock().unwrap();
                        s.playing = false;
                    }
                    Err(err) => {
                        log::error!("decode error: {err}");
                        inner.decoder = None;
                        inner.resampler = None;
                        inner.paused = true;
                        inner.clock.pause();
                        shared.lock().unwrap().playing = false;
                    }
                }
            }

            if let (Some(samples), Some(output)) =
                (inner.pending.as_ref(), inner.output.as_mut())
            {
                let start = inner.pending_index.min(samples.len());
                let written = output.producer.push_slice(&samples[start..]);
                inner.pending_index = start + written;
                if inner.pending_index >= samples.len() {
                    inner.pending = None;
                    inner.pending_index = 0;
                }
            }
        }

        // Update shared position every 100ms
        if last_emit.elapsed() >= Duration::from_millis(100) {
            let position = inner.clock.position();
            if let Ok(mut s) = shared.try_lock() {
                s.position = position;
            }
            last_emit = Instant::now();
        }

        thread::sleep(Duration::from_millis(5));
    }
}
