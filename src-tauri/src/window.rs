use serde::Serialize;
use tauri::{AppHandle, Emitter, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Gdi::{CreatePolygonRgn, DeleteObject, SetWindowRgn, WINDING};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowDisplayAffinity, SetWindowLongPtrW, GWL_EXSTYLE,
    WDA_EXCLUDEFROMCAPTURE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
};

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

fn shape(hwnd: HWND, width: u32, height: u32, scale: f64, expanded: bool) {
    let inset = 8.0 * scale;
    let radius = (if expanded { 27.0 } else { 18.0 } * scale)
        .min(height as f64 / 2.0)
        .min(width as f64 / 4.0);
    let w = width as f64;
    let h = height as f64;
    let point = |x: f64, y: f64| POINT {
        x: x.round() as i32,
        y: y.round() as i32,
    };
    let mut outline = vec![point(0.0, 0.0), point(w, 0.0)];
    let arc = |center_x: f64, center_y: f64, radius: f64, start: f64, step: f64| {
        (0..=6).map(move |i| {
            let angle = (start + f64::from(i) * step).to_radians();
            point(
                center_x + angle.cos() * radius,
                center_y + angle.sin() * radius,
            )
        })
    };
    outline.extend(arc(w, inset, inset, -90.0, -15.0));
    outline.extend(arc(w - inset - radius, h - radius, radius, 0.0, 15.0));
    outline.extend(arc(inset + radius, h - radius, radius, 90.0, 15.0));
    outline.extend(arc(0.0, inset, inset, 0.0, -15.0));
    unsafe {
        let region = CreatePolygonRgn(&outline, WINDING);
        // Windows owns the region after a successful SetWindowRgn.
        if !region.is_invalid() && SetWindowRgn(hwnd, Some(region), true) == 0 {
            let _ = DeleteObject(region.into());
        }
    }
}

#[tauri::command]
pub fn island_layout(
    window: WebviewWindow,
    width: u32,
    height: u32,
    monitor: i32,
) -> Result<(), String> {
    if !(150..=640).contains(&width) || !(28..=360).contains(&height) || monitor < -1 {
        return Err("Unsupported island size or monitor.".into());
    }
    let display = if monitor >= 0 {
        window
            .available_monitors()
            .map_err(|error| error.to_string())?
            .into_iter()
            .nth(monitor as usize)
    } else {
        None
    };
    let display = display
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?)
        .ok_or("No active display was found.")?;
    let scale = display.scale_factor();
    let screen = display.size();
    let origin = display.position();
    let w = ((width as f64 * scale).round() as u32).min(screen.width);
    let h = ((height as f64 * scale).round() as u32).min(screen.height);
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
        }
    }
    window
        .set_size(PhysicalSize::new(w, h))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            origin.x + (screen.width - w) as i32 / 2,
            origin.y,
        ))
        .map_err(|error| error.to_string())?;
    shape(hwnd, w, h, scale, height > 100);
    if first_show {
        window.show().map_err(|error| error.to_string())?;
    }
    Ok(())
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
    }
    Ok(())
}
