#[derive(Clone, Default)]
pub struct ScrobbleRefreshSignal {
    version: u64,
}

impl gpui::Global for ScrobbleRefreshSignal {}

impl ScrobbleRefreshSignal {
    pub fn bump(&mut self) {
        self.version = self.version.wrapping_add(1);
    }

    #[allow(dead_code)]
    pub fn version(&self) -> u64 {
        self.version
    }
}
