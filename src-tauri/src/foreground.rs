use std::{
    cell::RefCell,
    sync::atomic::{AtomicIsize, Ordering},
};
use tauri::{AppHandle, Emitter, WebviewWindow, WindowEvent};
use windows::Win32::{
    Foundation::HWND,
    UI::{
        Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK},
        WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetShellWindow, GetWindowThreadProcessId,
            SetForegroundWindow, EVENT_SYSTEM_FOREGROUND, WINEVENT_OUTOFCONTEXT,
        },
    },
};

struct Observer {
    app: AppHandle,
    hook: HWINEVENTHOOK,
    latest: bool,
    window: HWND,
}

impl Drop for Observer {
    fn drop(&mut self) {
        unsafe {
            let _ = UnhookWinEvent(self.hook);
        }
    }
}

thread_local! {
    static OBSERVER: RefCell<Option<Observer>> = const { RefCell::new(None) };
}

static BROWSER: AtomicIsize = AtomicIsize::new(0);

pub fn watch_browser(window: &WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        let handle = hwnd.0 as isize;
        BROWSER.store(handle, Ordering::Relaxed);
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                let _ = BROWSER.compare_exchange(handle, 0, Ordering::Relaxed, Ordering::Relaxed);
            }
        });
    }
}

fn is_app(window: HWND) -> Option<bool> {
    if window.is_invalid() {
        return None;
    }
    let mut process = 0;
    let mut class = [0; 64];
    let length = unsafe {
        GetWindowThreadProcessId(window, Some(&mut process));
        if process == std::process::id() {
            return (window.0 as isize == BROWSER.load(Ordering::Relaxed)).then_some(true);
        }
        if window == GetShellWindow() {
            return Some(false);
        }
        GetClassNameW(window, &mut class)
    };
    match String::from_utf16_lossy(&class[..length.max(0) as usize]).as_str() {
        "Progman" | "WorkerW" | "#32769" => Some(false),
        "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" => None,
        _ => Some(true),
    }
}

unsafe extern "system" fn foreground_changed(
    _: HWINEVENTHOOK,
    _: u32,
    window: HWND,
    _: i32,
    _: i32,
    _: u32,
    _: u32,
) {
    let Some(active) = is_app(window) else {
        return;
    };
    let app = OBSERVER.with_borrow_mut(|slot| {
        slot.as_mut().and_then(|observer| {
            let changed = observer.latest != active;
            observer.latest = active;
            observer.window = window;
            changed.then(|| observer.app.clone())
        })
    });
    if let Some(app) = app {
        let _ = app.emit("island-foreground", active);
    }
}

pub fn observe(app: &AppHandle) {
    let hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(foreground_changed),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    if !hook.is_invalid() {
        let window = unsafe { GetForegroundWindow() };
        let latest = is_app(window).unwrap_or(false);
        OBSERVER.with_borrow_mut(|slot| {
            *slot = Some(Observer {
                app: app.clone(),
                hook,
                latest,
                window,
            })
        });
    }
}

pub fn stop() {
    OBSERVER.with_borrow_mut(|slot| *slot = None);
}

pub fn restore(window: HWND) {
    if unsafe { GetForegroundWindow() } == window {
        if let Some(previous) =
            OBSERVER.with_borrow(|slot| slot.as_ref().map(|observer| observer.window))
        {
            if previous != window && !previous.is_invalid() {
                unsafe {
                    let _ = SetForegroundWindow(previous);
                }
            }
        }
    }
}

#[tauri::command]
pub fn foreground_app() -> bool {
    is_app(unsafe { GetForegroundWindow() })
        .or_else(|| OBSERVER.with_borrow(|slot| slot.as_ref().map(|observer| observer.latest)))
        .unwrap_or(false)
}
