use serde::Serialize;
use tauri::{AppHandle, Emitter, Monitor, WebviewWindow};
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
    GWL_EXSTYLE, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, WDA_EXCLUDEFROMCAPTURE,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
};

const CIRCLE: u32 = 36;

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

fn shape(hwnd: HWND, width: i32, height: i32, scale: f64, circle: bool) -> Result<(), String> {
    unsafe {
        let region = if circle {
            CreateEllipticRgn(0, 0, width, height)
        } else {
            let diameter = ((48.0 * scale).round() as i32).min(height).min(width);
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
    let travel = screen_width - width;
    let margin = margin.min(travel / 2);
    ((anchor * f64::from(screen_width)).round() as i32 - width / 2).clamp(margin, travel - margin)
}

fn remove_frame(hwnd: HWND) {
    // WebView owns the visible contour. Disable the independent DWM paint layers.
    let no_border = 0xffff_fffe_u32;
    let square = DWMWCP_DONOTROUND;
    let no_backdrop = DWMSBT_NONE;
    unsafe {
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
    }
}

#[tauri::command]
pub fn island_layout(
    window: WebviewWindow,
    width: u32,
    height: u32,
    monitor: i32,
    anchor: Option<f64>,
) -> Result<(), String> {
    let circle = width == CIRCLE && height == CIRCLE;
    if (!circle && (!(150..=640).contains(&width) || !(28..=360).contains(&height)))
        || monitor < -1
        || anchor.is_some_and(|x| !(0.0..=1.0).contains(&x))
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
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let required = (WS_EX_TOOLWINDOW | WS_EX_TOPMOST).0 as isize;
        if first_show {
            SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                style | required | WS_EX_NOACTIVATE.0 as isize,
            );
            let _ = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
            remove_frame(hwnd);
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
        SetWindowPos(
            hwnd,
            None,
            origin.x + left,
            origin.y + inset,
            w,
            h,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
        .map_err(|error| error.to_string())?;
    }
    shape(hwnd, w, h, scale, circle)?;
    if first_show {
        window.show().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn move_circle(
    window: WebviewWindow,
    monitor: i32,
    start: f64,
    delta: f64,
) -> Result<f64, String> {
    if monitor < -1 || !(0.0..=1.0).contains(&start) || !delta.is_finite() {
        return Err("Invalid circle position.".into());
    }
    let display = display(&window, monitor)?;
    let scale = display.scale_factor();
    let screen = display.size().width as i32;
    let width = ((f64::from(CIRCLE) * scale).round() as i32).min(screen);
    let origin = display.position();
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    let target = (start + delta * scale / f64::from(screen)).clamp(0.0, 1.0);
    let left = left_on_display(screen, width, target, (8.0 * scale).round() as i32);
    unsafe {
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|error| error.to_string())?;
        if rect.right - rect.left == width && rect.bottom - rect.top == width {
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
        }
    }
    Ok(f64::from(left + width / 2) / f64::from(screen))
}

#[tauri::command]
pub fn set_keyboard(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let flag = WS_EX_NOACTIVATE.0 as isize;
        let next = if enabled { style & !flag } else { style | flag };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
    }
    if enabled {
        window.set_focus().map_err(|error| error.to_string())?;
    } else {
        crate::foreground::restore(hwnd);
    }
    Ok(())
}
