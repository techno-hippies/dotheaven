use super::*;

fn first_supported_track(tracks: &[Track]) -> Option<&Track> {
    tracks
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
}

pub(super) fn open_decoder(path: &str, seek: Option<f64>) -> Result<DecoderState, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
    {
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

pub(super) fn build_output() -> Result<OutputState, String> {
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

pub(super) fn decode_next(
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

pub(super) fn seek_decoder(decoder_state: &mut DecoderState, position: f64) -> Result<(), String> {
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
