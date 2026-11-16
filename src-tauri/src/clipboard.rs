use serde::{Deserialize, Serialize};
use std::{
    fs, mem, ptr, slice,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use windows::{
    core::{w, PCWSTR},
    Win32::{
        Foundation::{GlobalFree, LocalFree, HANDLE, HGLOBAL, HLOCAL, HWND},
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
        System::{
            DataExchange::{
                AddClipboardFormatListener, CloseClipboard, EmptyClipboard, GetClipboardData,
                IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
                SetClipboardData,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, GetMessageW, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE,
            WM_CLIPBOARDUPDATE,
        },
    },
};

const UNICODE_TEXT: u32 = 13;
const FILE: &str = "clipboard.bin";
const LIMIT: usize = 50;
const TEXT_LIMIT: usize = 8192;

#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    id: u32,
    text: String,
    pinned: bool,
}

#[derive(Default, Serialize, Deserialize)]
struct History {
    next: u32,
    items: Vec<Entry>,
}

#[derive(Default)]
pub struct ClipboardState {
    active: AtomicBool,
    history: Mutex<History>,
}

struct Clipboard;

impl Clipboard {
    fn open(window: Option<HWND>) -> windows::core::Result<Self> {
        unsafe { OpenClipboard(window)? };
        Ok(Self)
    }
}

impl Drop for Clipboard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}

fn protect(bytes: &[u8], encrypt: bool) -> windows::core::Result<Vec<u8>> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                PCWSTR::null(),
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )?;
        } else {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )?;
        }
        if output.pbData.is_null() {
            return Ok(Vec::new());
        }
        let bytes = slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(bytes)
    }
}

fn read_format<T>(format: u32, read: impl FnOnce(*const u8, usize) -> Option<T>) -> Option<T> {
    if format == 0 {
        return None;
    }
    unsafe {
        let handle = HGLOBAL(GetClipboardData(format).ok()?.0);
        let size = GlobalSize(handle);
        let address = GlobalLock(handle).cast::<u8>();
        if address.is_null() {
            return None;
        }
        let result = read(address, size);
        let _ = GlobalUnlock(handle);
        result
    }
}

fn copied_text(excluded: u32, history_allowed: u32) -> Option<String> {
    let _open = Clipboard::open(None).ok()?;
    if excluded != 0 && unsafe { IsClipboardFormatAvailable(excluded) }.is_ok() {
        return None;
    }
    if read_format(history_allowed, |address, size| {
        (size >= 4).then(|| unsafe { ptr::read_unaligned(address.cast::<u32>()) })
    }) == Some(0)
    {
        return None;
    }
    read_format(UNICODE_TEXT, |address, size| {
        if size < 2 {
            return None;
        }
        let data =
            unsafe { slice::from_raw_parts(address.cast::<u16>(), (size / 2).min(TEXT_LIMIT + 1)) };
        let length = data.iter().position(|unit| *unit == 0)?;
        let text = String::from_utf16_lossy(&data[..length]);
        (!text.trim().is_empty()).then_some(text)
    })
}

fn update(app: &AppHandle, change: impl FnOnce(&mut History) -> bool) -> Result<(), String> {
    let state = app.state::<ClipboardState>();
    let mut history = state.history.lock().map_err(|error| error.to_string())?;
    let old = history.items.clone();
    if !change(&mut history) {
        return Ok(());
    }
    let save = || -> Result<(), String> {
        let text = serde_json::to_vec(&*history).map_err(|error| error.to_string())?;
        let encrypted = protect(&text, true).map_err(|error| error.to_string())?;
        super::desktop::write_local(app, FILE, &encrypted)
    };
    if let Err(error) = save() {
        history.items = old;
        return Err(error);
    }
    drop(history);
    let _ = app.emit("island-clipboard", ());
    Ok(())
}

pub fn start(app: AppHandle) {
    let _ = std::thread::Builder::new()
        .name("islandx-clipboard".into())
        .spawn(move || {
            let state = app.state::<ClipboardState>();
            if let Some(history) = app
                .path()
                .app_data_dir()
                .ok()
                .and_then(|dir| fs::read(dir.join(FILE)).ok())
                .and_then(|data| protect(&data, false).ok())
                .and_then(|data| serde_json::from_slice::<History>(&data).ok())
            {
                if let Ok(mut slot) = state.history.lock() {
                    *slot = history;
                }
                let _ = app.emit("island-clipboard", ());
            }
            unsafe {
                let Ok(window) = CreateWindowExW(
                    WINDOW_EX_STYLE(0),
                    w!("STATIC"),
                    w!("IslandX Clipboard"),
                    WINDOW_STYLE(0),
                    0,
                    0,
                    0,
                    0,
                    Some(HWND_MESSAGE),
                    None,
                    None,
                    None,
                ) else {
                    return;
                };
                if AddClipboardFormatListener(window).is_err() {
                    return;
                }
                let excluded =
                    RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
                let history_allowed = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
                let mut message = MSG::default();
                while GetMessageW(&mut message, Some(window), 0, 0).0 > 0 {
                    if message.message != WM_CLIPBOARDUPDATE
                        || !state.active.load(Ordering::Relaxed)
                    {
                        continue;
                    }
                    if let Some(text) = copied_text(excluded, history_allowed) {
                        let _ = update(&app, |history| {
                            if let Some(existing) =
                                history.items.iter_mut().find(|item| item.text == text)
                            {
                                if existing.pinned {
                                    return false;
                                }
                            }
                            history.items.retain(|item| item.text != text);
                            if history.items.len() >= LIMIT {
                                let Some(last) =
                                    history.items.iter().rposition(|item| !item.pinned)
                                else {
                                    return false;
                                };
                                history.items.remove(last);
                            }
                            history.next = history.next.wrapping_add(1);
                            history.items.insert(
                                0,
                                Entry {
                                    id: history.next,
                                    text,
                                    pinned: false,
                                },
                            );
                            true
                        });
                    }
                }
            }
        });
}

#[tauri::command]
pub fn clipboard_capture(state: State<'_, ClipboardState>, enabled: bool) {
    state.active.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
pub fn clipboard_history(state: State<'_, ClipboardState>) -> Result<Vec<Entry>, String> {
    state
        .history
        .lock()
        .map(|history| history.items.clone())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clipboard_pin(app: AppHandle, id: u32) -> Result<(), String> {
    update(&app, |history| {
        if let Some(item) = history.items.iter_mut().find(|item| item.id == id) {
            item.pinned = !item.pinned;
            true
        } else {
            false
        }
    })
}

#[tauri::command]
pub fn clipboard_clear(app: AppHandle) -> Result<(), String> {
    update(&app, |history| {
        history.items.retain(|item| item.pinned);
        true
    })
}

#[tauri::command]
pub fn clipboard_copy(
    window: WebviewWindow,
    state: State<'_, ClipboardState>,
    id: u32,
) -> Result<(), String> {
    let text: Vec<u16> = state
        .history
        .lock()
        .map_err(|error| error.to_string())?
        .items
        .iter()
        .find(|item| item.id == id)
        .ok_or("Clipboard item has been removed.")?
        .text
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    let _open = Clipboard::open(Some(hwnd)).map_err(|error| error.to_string())?;
    unsafe {
        let handle = GlobalAlloc(GMEM_MOVEABLE, mem::size_of_val(text.as_slice()))
            .map_err(|error| error.to_string())?;
        let address = GlobalLock(handle).cast::<u16>();
        if address.is_null() {
            let _ = GlobalFree(Some(handle));
            return Err("Could not write clipboard text.".into());
        }
        ptr::copy_nonoverlapping(text.as_ptr(), address, text.len());
        let _ = GlobalUnlock(handle);
        let result =
            EmptyClipboard().and_then(|_| SetClipboardData(UNICODE_TEXT, Some(HANDLE(handle.0))));
        if result.is_err() {
            let _ = GlobalFree(Some(handle));
        }
        result.map(|_| ()).map_err(|error| error.to_string())
    }
}
