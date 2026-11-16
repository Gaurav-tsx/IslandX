use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use windows::{
    Foundation::TypedEventHandler,
    Win32::{
        Foundation::HWND,
        Graphics::Dwm::{DwmSetWindowAttribute, DWMSBT_NONE, DWMWA_SYSTEMBACKDROP_TYPE},
    },
    UI::ViewManagement::UISettings,
};

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backdrop {
    blurred: bool,
    transparency_allowed: bool,
}

#[derive(Default)]
struct Glass {
    requested: bool,
    effect: Option<Effect>,
    settings: Option<(UISettings, Option<i64>)>,
}

enum Effect {
    Acrylic,
    ShapedBlur,
}

impl Effect {
    fn apply(window: &WebviewWindow) -> Option<Self> {
        let hwnd = HWND(window.hwnd().ok()?.0);
        let none = DWMSBT_NONE;
        // The system backdrop on newer Windows paints the rectangular frame.
        // Client blur follows the island's window region.
        let modern = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_SYSTEMBACKDROP_TYPE,
                std::ptr::from_ref(&none).cast(),
                4,
            )
        }
        .is_ok();
        if modern {
            window_vibrancy::apply_blur(window, Some((20, 20, 24, 165))).ok()?;
            Some(Self::ShapedBlur)
        } else {
            window_vibrancy::apply_acrylic(window, Some((20, 20, 24, 195))).ok()?;
            Some(Self::Acrylic)
        }
    }

    fn clear(self, window: &WebviewWindow) {
        let _ = match self {
            Self::Acrylic => window_vibrancy::clear_acrylic(window),
            Self::ShapedBlur => window_vibrancy::clear_blur(window),
        };
    }
}

impl Glass {
    fn refresh(&mut self, window: &WebviewWindow) -> Backdrop {
        let transparency_allowed = self
            .settings
            .as_ref()
            .and_then(|(settings, _)| settings.AdvancedEffectsEnabled().ok())
            .unwrap_or(false);
        if self.requested && transparency_allowed {
            if self.effect.is_none() {
                self.effect = Effect::apply(window);
            }
        } else if let Some(effect) = self.effect.take() {
            effect.clear(window);
        }
        Backdrop {
            blurred: self.effect.is_some(),
            transparency_allowed,
        }
    }
}

impl Drop for Glass {
    fn drop(&mut self) {
        if let Some((settings, Some(cookie))) = &self.settings {
            let _ = settings.RemoveAdvancedEffectsEnabledChanged(*cookie);
        }
    }
}

#[derive(Default)]
pub struct GlassState(Mutex<Glass>);

pub fn observe(app: &AppHandle) {
    let Ok(settings) = UISettings::new() else {
        return;
    };
    let handle = app.clone();
    let handler = TypedEventHandler::new(move |_, _| {
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(window) = app.get_webview_window("main") {
                let state = app.state::<GlassState>();
                if let Ok(mut glass) = state.0.lock() {
                    let backdrop = glass.refresh(&window);
                    let _ = window.emit("island-glass", backdrop);
                };
            }
        });
        Ok(())
    });
    let cookie = settings.AdvancedEffectsEnabledChanged(&handler).ok();
    let state = app.state::<GlassState>();
    if let Ok(mut glass) = state.0.lock() {
        glass.settings = Some((settings, cookie));
    };
}

#[tauri::command]
pub fn set_glass(
    window: WebviewWindow,
    state: State<'_, GlassState>,
    enabled: bool,
) -> Result<Backdrop, String> {
    if window.label() != "main" {
        return Err("Glass is available on the IslandX overlay.".into());
    }
    let mut glass = state.0.lock().map_err(|error| error.to_string())?;
    glass.requested = enabled;
    Ok(glass.refresh(&window))
}
