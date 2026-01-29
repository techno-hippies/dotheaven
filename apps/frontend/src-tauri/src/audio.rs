use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

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

struct AudioInner {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    sink: Option<Sink>,
    current_path: Option<String>,
    duration: Option<f64>,
    volume: f32,
    paused: bool,
    clock: PlaybackClock,
}

pub struct AudioState {
    sender: Sender<Command>,
}

#[derive(Clone, Debug)]
enum Command {
    Play { path: String, seek: Option<f64> },
    Pause,
    Resume,
    Stop,
    Seek { position: f64, play: bool },
    Volume { volume: f64 },
}

#[derive(Clone, Serialize)]
struct AudioLoadedPayload {
    duration: Option<f64>,
}

#[derive(Clone, Serialize)]
struct AudioPositionPayload {
    position: f64,
}

#[derive(Clone, Serialize)]
struct AudioStatePayload {
    state: &'static str,
}

#[derive(Clone, Serialize)]
struct AudioErrorPayload {
    message: String,
}

fn build_source(
    path: &str,
    seek: Option<f64>,
) -> Result<(Box<dyn Source<Item = f32> + Send>, Option<f64>), String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
    let decoder = Decoder::new(BufReader::new(file)).map_err(|e| format!("Decode error: {e}"))?;
    let duration = decoder.total_duration().map(|d| d.as_secs_f64());
    let source = decoder.convert_samples::<f32>();
    let source: Box<dyn Source<Item = f32> + Send> = if let Some(seek_pos) = seek {
        Box::new(source.skip_duration(Duration::from_secs_f64(seek_pos)))
    } else {
        Box::new(source)
    };
    Ok((source, duration))
}

fn start_playback(
    inner: &mut AudioInner,
    path: String,
    seek: Option<f64>,
    app: &AppHandle,
) -> Result<(), String> {
    if let Some(sink) = inner.sink.take() {
        sink.stop();
    }

    let (source, duration) = build_source(&path, seek)?;
    let sink = Sink::try_new(&inner.handle).map_err(|e| format!("Sink error: {e}"))?;
    sink.set_volume(inner.volume);
    sink.append(source);
    sink.play();

    inner.duration = duration;
    inner.current_path = Some(path);
    inner.sink = Some(sink);
    inner.paused = false;
    inner.clock = PlaybackClock::default();
    if let Some(seek_pos) = seek {
        inner.clock.set_position(seek_pos);
    } else {
        inner.clock.start();
    }

    let _ = app.emit("audio:loaded", AudioLoadedPayload { duration });
    let _ = app.emit("audio:state", AudioStatePayload { state: "playing" });
    Ok(())
}

fn run_audio_thread(app: AppHandle, receiver: Receiver<Command>) -> Result<(), String> {
    let (stream, handle) =
        OutputStream::try_default().map_err(|e| format!("Output stream error: {e}"))?;
    let mut inner = AudioInner {
        _stream: stream,
        handle,
        sink: None,
        current_path: None,
        duration: None,
        volume: 1.0,
        paused: true,
        clock: PlaybackClock::default(),
    };

    loop {
        match receiver.recv_timeout(Duration::from_millis(200)) {
            Ok(command) => match command {
                Command::Play { path, seek } => {
                    if let Err(err) = start_playback(&mut inner, path, seek, &app) {
                        let _ = app.emit(
                            "audio:error",
                            AudioErrorPayload {
                                message: err.clone(),
                            },
                        );
                        let _ = app.emit("audio:state", AudioStatePayload { state: "stopped" });
                    }
                }
                Command::Pause => {
                    if let Some(sink) = inner.sink.as_ref() {
                        sink.pause();
                    }
                    inner.paused = true;
                    inner.clock.pause();
                    let _ = app.emit("audio:state", AudioStatePayload { state: "paused" });
                }
                Command::Resume => {
                    if let Some(sink) = inner.sink.as_ref() {
                        sink.play();
                    }
                    inner.paused = false;
                    inner.clock.start();
                    let _ = app.emit("audio:state", AudioStatePayload { state: "playing" });
                }
                Command::Stop => {
                    if let Some(sink) = inner.sink.take() {
                        sink.stop();
                    }
                    inner.paused = true;
                    inner.current_path = None;
                    inner.duration = None;
                    inner.clock = PlaybackClock::default();
                    let _ = app.emit("audio:state", AudioStatePayload { state: "stopped" });
                }
                Command::Seek { position, play } => {
                    let path = match inner.current_path.clone() {
                        Some(path) => path,
                        None => continue,
                    };
                    if let Err(err) = start_playback(&mut inner, path, Some(position), &app) {
                        let _ = app.emit(
                            "audio:error",
                            AudioErrorPayload {
                                message: err.clone(),
                            },
                        );
                        let _ = app.emit("audio:state", AudioStatePayload { state: "stopped" });
                    } else if !play {
                        if let Some(sink) = inner.sink.as_ref() {
                            sink.pause();
                        }
                        inner.paused = true;
                        inner.clock.pause();
                        let _ = app.emit("audio:state", AudioStatePayload { state: "paused" });
                    }
                }
                Command::Volume { volume } => {
                    let vol = volume.clamp(0.0, 1.0) as f32;
                    inner.volume = vol;
                    if let Some(sink) = inner.sink.as_ref() {
                        sink.set_volume(vol);
                    }
                }
            },
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if let Some(sink) = inner.sink.as_ref() {
            let position = inner.clock.position();
            let _ = app.emit("audio:position", AudioPositionPayload { position });
            if !inner.paused && sink.empty() {
                if let Some(sink) = inner.sink.take() {
                    sink.stop();
                }
                inner.paused = true;
                inner.clock.pause();
                let _ = app.emit("audio:ended", ());
                let _ = app.emit("audio:state", AudioStatePayload { state: "stopped" });
            }
        }
    }

    Ok(())
}

impl AudioState {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            if let Err(err) = run_audio_thread(app, receiver) {
                eprintln!("audio thread failed: {}", err);
            }
        });
        Ok(Self { sender })
    }
}

#[tauri::command]
pub fn audio_play(path: String, seek: Option<f64>, state: State<AudioState>) -> Result<(), String> {
    state
        .sender
        .send(Command::Play { path, seek })
        .map_err(|e| format!("Audio command error: {e}"))
}

#[tauri::command]
pub fn audio_pause(state: State<AudioState>) -> Result<(), String> {
    state
        .sender
        .send(Command::Pause)
        .map_err(|e| format!("Audio command error: {e}"))
}

#[tauri::command]
pub fn audio_resume(state: State<AudioState>) -> Result<(), String> {
    state
        .sender
        .send(Command::Resume)
        .map_err(|e| format!("Audio command error: {e}"))
}

#[tauri::command]
pub fn audio_stop(state: State<AudioState>) -> Result<(), String> {
    state
        .sender
        .send(Command::Stop)
        .map_err(|e| format!("Audio command error: {e}"))
}

#[tauri::command]
pub fn audio_seek(position: f64, play: bool, state: State<AudioState>) -> Result<(), String> {
    state
        .sender
        .send(Command::Seek { position, play })
        .map_err(|e| format!("Audio command error: {e}"))
}

#[tauri::command]
pub fn audio_set_volume(volume: f64, state: State<AudioState>) -> Result<(), String> {
    state
        .sender
        .send(Command::Volume { volume })
        .map_err(|e| format!("Audio command error: {e}"))
}
