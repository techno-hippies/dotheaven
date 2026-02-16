use super::decoder_output::{build_output, decode_next, open_decoder, seek_decoder};
use super::*;

fn handle_command(
    command: Command,
    inner: &mut AudioInner,
    shared: &Arc<Mutex<PlaybackState>>,
) -> Result<(), String> {
    match command {
        Command::Play {
            path,
            seek,
            artist,
            cover_path,
        } => {
            log::info!(
                "[Audio] play command: path='{}', seek={:?}, artist={:?}",
                path,
                seek,
                artist
            );
            let decoder = open_decoder(&path, seek)?;

            if inner.output.is_none() {
                inner.output = Some(build_output()?);
            }

            let output = inner.output.as_ref().unwrap();
            let out_rate = output.sample_rate;
            let out_ch = output.channels as usize;

            if decoder.sample_rate != out_rate {
                inner.resampler = Some(ResamplerState::new(decoder.sample_rate, out_rate, out_ch)?);
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
            log::info!("[Audio] pause command");
            inner.paused = true;
            inner.clock.pause();
            inner.pending = None;
            inner.pending_index = 0;
            inner.output = Some(build_output()?);

            shared.lock().unwrap().playing = false;
        }
        Command::Resume => {
            log::info!("[Audio] resume command");
            if inner.decoder.is_some() {
                inner.paused = false;
                inner.clock.start();
                shared.lock().unwrap().playing = true;
            }
        }
        Command::Stop => {
            log::info!("[Audio] stop command");
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
            log::info!(
                "[Audio] seek command: position={:.3}s, play={}",
                position,
                play
            );
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
            log::info!("[Audio] volume command: {:.2}", volume);
            inner.volume = volume.clamp(0.0, 1.0) as f32;
            shared.lock().unwrap().volume = volume.clamp(0.0, 1.0);
        }
    }

    Ok(())
}

// =============================================================================
// Audio thread
// =============================================================================

pub(super) fn run_audio_thread(
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
                        let ended_path = shared.lock().ok().and_then(|s| s.track_path.clone());
                        log::info!("[Audio] track ended: path={:?}", ended_path);
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

            if let (Some(samples), Some(output)) = (inner.pending.as_ref(), inner.output.as_mut()) {
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

        // Sleep longer when idle (no active playback) to save CPU.
        let sleep_ms = if has_both && !inner.paused { 5 } else { 50 };
        thread::sleep(Duration::from_millis(sleep_ms));
    }
}
