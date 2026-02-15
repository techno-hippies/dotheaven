use super::*;

impl ChatView {
    pub(super) fn is_scarlett_active(&self) -> bool {
        self.active_conversation_id.as_deref() == Some(SCARLETT_CONVERSATION_ID)
    }

    pub(super) fn voice_snapshot(&self) -> VoiceSnapshot {
        match self.voice_controller.lock() {
            Ok(voice) => voice.snapshot(),
            Err(poisoned) => poisoned.into_inner().snapshot(),
        }
    }

    pub(super) fn voice_call_supported(&self) -> bool {
        match self.voice_controller.lock() {
            Ok(voice) => voice.call_supported(),
            Err(poisoned) => poisoned.into_inner().call_supported(),
        }
    }

    pub(super) fn start_scarlett_call(&mut self, cx: &mut Context<Self>) {
        if !self.voice_call_supported() {
            return;
        }

        self.voice_error = None;
        cx.notify();

        let voice = self.voice_controller.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let mut voice = match voice.lock() {
                    Ok(v) => v,
                    Err(poisoned) => poisoned.into_inner(),
                };
                voice.start_call()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                if let Err(err) = result {
                    this.voice_error = Some(err);
                } else {
                    this.voice_error = None;
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn end_scarlett_call(&mut self, cx: &mut Context<Self>) {
        let voice = self.voice_controller.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let mut voice = match voice.lock() {
                    Ok(v) => v,
                    Err(poisoned) => poisoned.into_inner(),
                };
                voice.end_call()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                if let Err(err) = result {
                    this.voice_error = Some(err);
                } else {
                    this.voice_error = None;
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn toggle_scarlett_mute(&mut self, cx: &mut Context<Self>) {
        let voice = self.voice_controller.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let mut voice = match voice.lock() {
                    Ok(v) => v,
                    Err(poisoned) => poisoned.into_inner(),
                };
                voice.toggle_mute()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                if let Err(err) = result {
                    this.voice_error = Some(err);
                }
                cx.notify();
            });
        })
        .detach();
    }
}
