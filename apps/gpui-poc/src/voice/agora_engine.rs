#[derive(Clone, Debug)]
pub enum AgoraEngineEvent {
    BotSpeaking,
    BotSilent,
    UserJoined(u32),
    UserLeft(u32),
    Error(String),
}

#[cfg(feature = "agora-native")]
mod imp {
    use std::ffi::{c_char, CStr, CString};

    use super::AgoraEngineEvent;

    #[repr(C)]
    struct HeavenAgoraHandle {
        _private: [u8; 0],
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct HeavenAgoraEvent {
        kind: i32,
        uid: u32,
        value: i32,
        message: [c_char; 256],
    }

    const HEAVEN_AGORA_EVENT_BOT_SPEAKING: i32 = 1;
    const HEAVEN_AGORA_EVENT_BOT_SILENT: i32 = 2;
    const HEAVEN_AGORA_EVENT_USER_JOINED: i32 = 3;
    const HEAVEN_AGORA_EVENT_USER_LEFT: i32 = 4;
    const HEAVEN_AGORA_EVENT_ERROR: i32 = 5;

    unsafe extern "C" {
        fn heaven_agora_create(
            app_id: *const c_char,
            out_handle: *mut *mut HeavenAgoraHandle,
        ) -> i32;
        fn heaven_agora_destroy(handle: *mut HeavenAgoraHandle);
        fn heaven_agora_join(
            handle: *mut HeavenAgoraHandle,
            channel: *const c_char,
            token: *const c_char,
            uid: u32,
        ) -> i32;
        fn heaven_agora_leave(handle: *mut HeavenAgoraHandle) -> i32;
        fn heaven_agora_set_mic_enabled(handle: *mut HeavenAgoraHandle, enabled: bool) -> i32;
        fn heaven_agora_set_area_cn(handle: *mut HeavenAgoraHandle, enabled: bool) -> i32;
        fn heaven_agora_poll_event(
            handle: *mut HeavenAgoraHandle,
            out_event: *mut HeavenAgoraEvent,
        ) -> i32;
    }

    pub struct AgoraNativeEngine {
        handle: *mut HeavenAgoraHandle,
    }

    unsafe impl Send for AgoraNativeEngine {}

    impl AgoraNativeEngine {
        pub fn new(app_id: &str) -> Result<Self, String> {
            let app_id_c = CString::new(app_id).map_err(|_| "invalid Agora app id".to_string())?;
            let mut handle = std::ptr::null_mut();
            let rc = unsafe { heaven_agora_create(app_id_c.as_ptr(), &mut handle) };
            if rc != 0 || handle.is_null() {
                return Err(format!("agora create failed: rc={rc}"));
            }
            Ok(Self { handle })
        }

        pub fn join(&mut self, channel: &str, token: &str, uid: u32) -> Result<(), String> {
            let channel_c = CString::new(channel).map_err(|_| "invalid channel".to_string())?;
            let token_c = CString::new(token).map_err(|_| "invalid token".to_string())?;
            let rc = unsafe {
                heaven_agora_join(self.handle, channel_c.as_ptr(), token_c.as_ptr(), uid)
            };
            if rc != 0 {
                return Err(format!("agora join failed: rc={rc}"));
            }
            Ok(())
        }

        pub fn leave(&mut self) -> Result<(), String> {
            let rc = unsafe { heaven_agora_leave(self.handle) };
            if rc != 0 {
                return Err(format!("agora leave failed: rc={rc}"));
            }
            Ok(())
        }

        pub fn set_mic_enabled(&mut self, enabled: bool) -> Result<(), String> {
            let rc = unsafe { heaven_agora_set_mic_enabled(self.handle, enabled) };
            if rc != 0 {
                return Err(format!("agora mute failed: rc={rc}"));
            }
            Ok(())
        }

        pub fn set_cn_only(&mut self, enabled: bool) -> Result<(), String> {
            let rc = unsafe { heaven_agora_set_area_cn(self.handle, enabled) };
            if rc != 0 {
                return Err(format!("agora area config failed: rc={rc}"));
            }
            Ok(())
        }

        pub fn poll_events(&mut self) -> Result<Vec<AgoraEngineEvent>, String> {
            let mut out = Vec::new();
            for _ in 0..64 {
                let mut raw = HeavenAgoraEvent {
                    kind: 0,
                    uid: 0,
                    value: 0,
                    message: [0; 256],
                };
                let rc = unsafe { heaven_agora_poll_event(self.handle, &mut raw) };
                if rc == 1 {
                    break;
                }
                if rc != 0 {
                    return Err(format!("agora poll failed: rc={rc}"));
                }

                let ev = match raw.kind {
                    HEAVEN_AGORA_EVENT_BOT_SPEAKING => AgoraEngineEvent::BotSpeaking,
                    HEAVEN_AGORA_EVENT_BOT_SILENT => AgoraEngineEvent::BotSilent,
                    HEAVEN_AGORA_EVENT_USER_JOINED => AgoraEngineEvent::UserJoined(raw.uid),
                    HEAVEN_AGORA_EVENT_USER_LEFT => AgoraEngineEvent::UserLeft(raw.uid),
                    HEAVEN_AGORA_EVENT_ERROR => {
                        let msg = unsafe { CStr::from_ptr(raw.message.as_ptr()) }
                            .to_string_lossy()
                            .to_string();
                        AgoraEngineEvent::Error(if msg.is_empty() {
                            "agora error".to_string()
                        } else {
                            msg
                        })
                    }
                    _ => continue,
                };
                out.push(ev);
            }
            Ok(out)
        }
    }

    impl Drop for AgoraNativeEngine {
        fn drop(&mut self) {
            if !self.handle.is_null() {
                unsafe {
                    heaven_agora_destroy(self.handle);
                }
                self.handle = std::ptr::null_mut();
            }
        }
    }
}

#[cfg(not(feature = "agora-native"))]
mod imp {
    use super::AgoraEngineEvent;

    pub struct AgoraNativeEngine;

    impl AgoraNativeEngine {
        pub fn new(_app_id: &str) -> Result<Self, String> {
            Err(
                "Agora native voice is disabled in this build. Rebuild with --features agora-native and set AGORA_SDK_ROOT."
                    .to_string(),
            )
        }

        pub fn join(&mut self, _channel: &str, _token: &str, _uid: u32) -> Result<(), String> {
            Err("agora-native not enabled".to_string())
        }

        pub fn leave(&mut self) -> Result<(), String> {
            Ok(())
        }

        pub fn set_mic_enabled(&mut self, _enabled: bool) -> Result<(), String> {
            Ok(())
        }

        pub fn set_cn_only(&mut self, _enabled: bool) -> Result<(), String> {
            Ok(())
        }

        pub fn poll_events(&mut self) -> Result<Vec<AgoraEngineEvent>, String> {
            Ok(Vec::new())
        }
    }
}

pub use imp::AgoraNativeEngine;
