use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Monitor, State, WebviewWindow};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMSBT_NONE, DWMWA_BORDER_COLOR, DWMWA_SYSTEMBACKDROP_TYPE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};
use windows::Win32::Graphics::Gdi::{
    CreateEllipticRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, GetWindowRect, SetWindowDisplayAffinity, SetWindowLongPtrW, SetWindowPos,
    GWL_EXSTYLE, GWL_STYLE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    WDA_EXCLUDEFROMCAPTURE, WDA_NONE, WS_CAPTION, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
};

const CIRCLE: u32 = 36;

#[derive(Clone, Copy, PartialEq, Eq)]
struct Outline {
    width: i32,
    height: i32,
    diameter: i32,
    circle: bool,
}

#[derive(Default)]
struct AppliedLayout {
    outline: Option<Outline>,
    capture_hidden: Option<bool>,
}

#[derive(Default)]
pub struct LayoutState(Mutex<AppliedLayout>);

#[derive(Serialize)]
pub struct Display {
    index: usize,
    name: String,
}

pub fn toggle(app: &AppHandle) {
    let _ = app.emit("island-toggle", ());
}

#[tauri::command]
pub fn monitors(window: WebviewWindow) -> Result<Vec<Display>, String> {
    Ok(window
        .available_monitors()
        .map_err(|error| error.to_string())?
        .iter()
        .enumerate()
        .map(|(index, monitor)| Display {
            index,
            name: monitor
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1)),
        })
        .collect())
}

fn shape(hwnd: HWND, outline: Outline) -> Result<(), String> {
    let Outline {
        width,
        height,
        diameter,
        circle,
    } = outline;
    unsafe {
        let region = if circle {
            CreateEllipticRgn(0, 0, width, height)
        } else {
            CreateRoundRectRgn(0, 0, width, height, diameter, diameter)
        };
        if region.is_invalid() {
            return Err("Could not create the island outline.".into());
        }
        if SetWindowRgn(hwnd, Some(region), true) == 0 {
            let _ = DeleteObject(region.into());
            return Err("Windows could not set the island outline.".into());
        }
    }
    Ok(())
}

fn display(window: &WebviewWindow, monitor: i32) -> Result<Monitor, String> {
    let display = if monitor >= 0 {
        window
            .available_monitors()
            .map_err(|error| error.to_string())?
            .into_iter()
            .nth(monitor as usize)
    } else {
        None
    };
    display
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?)
        .ok_or_else(|| "No active display was found.".into())
}

fn left_on_display(screen_width: i32, width: i32, anchor: f64, margin: i32) -> i32 {
    let travel = (screen_width - width).max(0);
    let margin = margin.min(travel / 2);
    ((anchor * f64::from(screen_width)).round() as i32 - width / 2).clamp(margin, travel - margin)
}

fn remove_frame(hwnd: HWND) {
    // Strip all non-client window frame styles so Windows never renders a caption or title bar.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let unwanted =
            (WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU).0 as isize;
        let clean = (style & !unwanted) | (WS_POPUP.0 as isize);
        SetWindowLongPtrW(hwnd, GWL_STYLE, clean);

        // WebView owns the visible contour. Disable the independent DWM paint layers.
        let no_border = 0xffff_fffe_u32;
        let square = DWMWCP_DONOTROUND;
        let no_backdrop = DWMSBT_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            (&no_border as *const u32).cast(),
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            std::ptr::from_ref(&square).cast(),
            4,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            std::ptr::from_ref(&no_backdrop).cast(),
            4,
        );
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

#[tauri::command]
pub fn island_layout(
    window: WebviewWindow,
    state: State<'_, LayoutState>,
    width: u32,
    height: u32,
    monitor: i32,
    anchor: Option<f64>,
    corner_radius: Option<f64>,
    hide_from_capture: Option<bool>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the IslandX overlay has an island layout.".into());
    }
    let circle = width == CIRCLE && height == CIRCLE;
    if (!circle && (!(150..=640).contains(&width) || !(2..=360).contains(&height)))
        || monitor < -1
        || anchor.is_some_and(|x| !(0.0..=1.0).contains(&x))
        || corner_radius.is_some_and(|x| !(0.0..=1.0).contains(&x))
    {
        return Err("Unsupported island size, position, or monitor.".into());
    }
    let display = display(&window, monitor)?;
    let scale = display.scale_factor();
    let screen = display.size();
    let origin = display.position();
    let w = ((width as f64 * scale).round() as u32).min(screen.width) as i32;
    let h = ((height as f64 * scale).round() as u32).min(screen.height) as i32;
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    let first_show = !window.is_visible().unwrap_or(false);
    let mut applied = state.0.lock().map_err(|error| error.to_string())?;
    let hide_from_capture = hide_from_capture.unwrap_or(true);
    let mut capture_result = Ok(());
    unsafe {
        if first_show {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let required = (WS_EX_TOOLWINDOW | WS_EX_TOPMOST).0 as isize;
            SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                style | required | WS_EX_NOACTIVATE.0 as isize,
            );
            remove_frame(hwnd);
            *applied = AppliedLayout::default();
        }
        if applied.capture_hidden != Some(hide_from_capture) {
            let affinity = if hide_from_capture {
                WDA_EXCLUDEFROMCAPTURE
            } else {
                WDA_NONE
            };
            capture_result = SetWindowDisplayAffinity(hwnd, affinity);
            applied.capture_hidden = Some(hide_from_capture);
        }
        let inset = if circle {
            (5.0 * scale).round() as i32
        } else {
            0
        };
        let left = left_on_display(
            screen.width as i32,
            w,
            anchor.unwrap_or(0.5),
            (8.0 * scale).round() as i32,
        );
        let (x, y) = (origin.x + left, origin.y + inset);
        let mut current = RECT::default();
        let mut flags = SWP_NOACTIVATE | SWP_NOZORDER;
        if GetWindowRect(hwnd, &mut current).is_ok() {
            if (current.left, current.top) == (x, y) {
                flags |= SWP_NOMOVE;
            }
            if (current.right - current.left, current.bottom - current.top) == (w, h) {
                flags |= SWP_NOSIZE;
            }
        }
        if !flags.contains(SWP_NOMOVE | SWP_NOSIZE) {
            SetWindowPos(hwnd, None, x, y, w, h, flags).map_err(|error| error.to_string())?;
        }
    }
    let diameter = if circle || h <= 8 {
        0
    } else {
        let max = ((48.0 * scale).round() as i32).min(h).min(w);
        (f64::from(max) * corner_radius.unwrap_or(1.0)).round() as i32
    };
    let outline = Outline {
        width: w,
        height: h,
        diameter,
        circle,
    };
    if applied.outline != Some(outline) {
        shape(hwnd, outline)?;
        applied.outline = Some(outline);
    }
    drop(applied);
    if first_show {
        window.show().map_err(|error| error.to_string())?;
    }
    capture_result
        .map_err(|error| format!("Windows could not change screen capture visibility: {error}"))
}

#[tauri::command]
pub fn move_island(
    window: WebviewWindow,
    monitor: i32,
    start: f64,
    delta: f64,
) -> Result<f64, String> {
    if monitor < -1 || !(0.0..=1.0).contains(&start) || !delta.is_finite() {
        return Err("Invalid island position.".into());
    }
    let display = display(&window, monitor)?;
    let scale = display.scale_factor();
    let screen = display.size().width as i32;
    let origin = display.position();
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    let target = (start + delta * scale / f64::from(screen)).clamp(0.0, 1.0);
    unsafe {
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|error| error.to_string())?;
        let width = (rect.right - rect.left).max(1);
        let left = left_on_display(screen, width, target, (8.0 * scale).round() as i32);
        SetWindowPos(
            hwnd,
            None,
            origin.x + left,
            rect.top,
            0,
            0,
            SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER,
        )
        .map_err(|error| error.to_string())?;
        Ok(f64::from(left + width / 2) / f64::from(screen))
    }
}

#[tauri::command]
pub fn move_circle(
    window: WebviewWindow,
    monitor: i32,
    start: f64,
    delta: f64,
) -> Result<f64, String> {
    move_island(window, monitor, start, delta)
}

#[tauri::command]
pub fn set_keyboard(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let flag = WS_EX_NOACTIVATE.0 as isize;
        let next = if enabled { style & !flag } else { style | flag };
        if next != style {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }
    if enabled {
        window.set_focus().map_err(|error| error.to_string())?;
    } else {
        crate::foreground::restore(hwnd);
    }
    Ok(())
}
