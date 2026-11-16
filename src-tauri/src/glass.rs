use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use windows::{Foundation::TypedEventHandler, UI::ViewManagement::UISettings};

#[derive(Default)]
pub struct GlassState(Mutex<Option<(UISettings, i64)>>);

impl Drop for GlassState {
    fn drop(&mut self) {
        if let Ok(Some((settings, cookie))) = self.0.get_mut() {
            let _ = settings.RemoveAdvancedEffectsEnabledChanged(*cookie);
        }
    }
}

pub fn observe(app: &AppHandle) {
    let Ok(settings) = UISettings::new() else {
        return;
    };
    let handle = app.clone();
    let handler =
        TypedEventHandler::<UISettings, windows::core::IInspectable>::new(move |sender, _| {
            if let Some(settings) = sender.as_ref() {
                let allowed = settings.AdvancedEffectsEnabled().unwrap_or(false);
                let _ = handle.emit_to("main", "island-transparency", allowed);
            }
            Ok(())
        });
    if let Ok(cookie) = settings.AdvancedEffectsEnabledChanged(&handler) {
        let state = app.state::<GlassState>();
        if let Ok(mut observer) = state.0.lock() {
            *observer = Some((settings, cookie));
        };
    }
}

#[tauri::command]
pub fn transparency_allowed() -> bool {
    UISettings::new()
        .and_then(|settings| settings.AdvancedEffectsEnabled())
        .unwrap_or(false)
}
