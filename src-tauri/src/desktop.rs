use std::{ffi::OsStr, fs, os::windows::ffi::OsStrExt, path::Path, process::Command};
use tauri::{webview::NewWindowResponse, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;
use url::Url;
use windows::core::{w, PCWSTR};
use windows::Win32::Storage::FileSystem::{
    MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_LWIN, VK_R, VK_S, VK_SHIFT, VK_SNAPSHOT,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

pub fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}

pub fn write_local(app: &AppHandle, file: &str, bytes: &[u8]) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(file);
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    let from = wide(temporary.as_os_str());
    let to = wide(path.as_os_str());
    unsafe {
        MoveFileExW(
            PCWSTR(from.as_ptr()),
            PCWSTR(to.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_shelf(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    match fs::read(dir.join("shelf.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn save_shelf(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    if paths.len() > 40
        || paths
            .iter()
            .any(|path| path.len() > 32768 || path.contains('\0') || !Path::new(path).is_absolute())
    {
        return Err("The shelf contains unsupported file paths.".into());
    }
    let bytes = serde_json::to_vec(&paths).map_err(|error| error.to_string())?;
    write_local(&app, "shelf.json", &bytes)
}

fn shell_open(value: &OsStr) -> Result<(), String> {
    let value = wide(value);
    let result = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            PCWSTR(value.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize <= 32 {
        return Err("Windows could not open this item. Check that its app is installed.".into());
    }
    Ok(())
}

fn valid_url(url: &Url) -> bool {
    url.scheme() == "https"
        && url.has_host()
        && url.username().is_empty()
        && url.password().is_none()
}

#[tauri::command]
pub async fn open_site(app: AppHandle, url: String, embedded: bool) -> Result<(), String> {
    if url.len() > 2048 {
        return Err("The URL is too long.".into());
    }
    let url = Url::parse(&url).map_err(|error| error.to_string())?;
    if !valid_url(&url) {
        return Err("Enter an HTTPS URL without embedded credentials.".into());
    }
    if !embedded {
        return shell_open(OsStr::new(url.as_str()));
    }
    if let Some(browser) = app.get_webview_window("browser") {
        browser.navigate(url).map_err(|error| error.to_string())?;
        browser.show().map_err(|error| error.to_string())?;
        return browser.set_focus().map_err(|error| error.to_string());
    }
    let data = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("Browser");
    WebviewWindowBuilder::new(&app, "browser", WebviewUrl::External(url))
        .title("IslandX Browser")
        .data_directory(data)
        .inner_size(940.0, 650.0)
        .min_inner_size(420.0, 280.0)
        .center()
        .always_on_top(true)
        .on_navigation(valid_url)
        .on_new_window(|url, _| {
            if valid_url(&url) {
                let _ = shell_open(OsStr::new(url.as_str()));
            }
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    let allowed = [
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "heic", "mp4", "webm", "mov", "mkv",
        "mp3", "wav", "ogg", "flac", "m4a", "pdf", "txt", "csv", "zip", "7z", "rar", "docx",
        "xlsx", "pptx", "md", "rtf",
    ];
    if !path.is_absolute() || path.as_os_str().to_string_lossy().contains('\0') {
        return Err("Choose an absolute Windows file path.".into());
    }
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    if !allowed.contains(&extension.as_str()) {
        return Err(
            "This file type can be stored on the shelf. Open it from File Explorer.".into(),
        );
    }
    if !path.is_file() {
        return Err("This file has moved or is unavailable.".into());
    }
    shell_open(path.as_os_str())
}

#[tauri::command]
pub fn open_windows_settings(page: &str) -> Result<(), String> {
    let target = match page {
        "sound" => "ms-settings:sound",
        "display" => "ms-settings:display",
        "wifi" => "ms-settings:network-wifi",
        "bluetooth" => "ms-settings:bluetooth",
        "notifications" => "ms-settings:notifications",
        _ => return Err("Unknown Windows settings page.".into()),
    };
    shell_open(OsStr::new(target))
}

fn keyboard_input(key: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                dwFlags: flags,
                ..Default::default()
            },
        },
    }
}

#[tauri::command]
pub fn capture(kind: &str) -> Result<&'static str, String> {
    let (keys, message): (&[VIRTUAL_KEY], _) = match kind {
        "screenshot" => (
            &[VK_LWIN, VK_SNAPSHOT],
            "Windows saves full screenshots in Pictures → Screenshots.",
        ),
        "snip" => (
            &[VK_LWIN, VK_SHIFT, VK_S],
            "Select a region in Windows Snipping Tool.",
        ),
        "record" => (
            &[VK_LWIN, VK_SHIFT, VK_R],
            "Recording opens in supported Windows 11 versions of Snipping Tool.",
        ),
        _ => return Err("Unknown capture mode.".into()),
    };
    let input: Vec<_> = keys
        .iter()
        .map(|&key| keyboard_input(key, KEYBD_EVENT_FLAGS(0)))
        .chain(
            keys.iter()
                .rev()
                .map(|&key| keyboard_input(key, KEYEVENTF_KEYUP)),
        )
        .collect();
    if unsafe { SendInput(&input, std::mem::size_of::<INPUT>() as i32) } != input.len() as u32 {
        return Err(
            "Windows blocked the capture shortcut. Try opening Snipping Tool directly.".into(),
        );
    }
    Ok(message)
}

#[tauri::command]
pub fn updates_configured(app: AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|entry| entry.get("endpoints"))
        .and_then(|endpoints| endpoints.as_array())
        .is_some_and(|list| !list.is_empty())
}

#[tauri::command]
pub fn uninstall(app: AppHandle, remove_data: bool, remove_history: bool) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let uninstaller = executable.with_file_name("uninstall.exe");
    if !uninstaller.is_file() {
        return Err("IslandX was started outside its installer. Open Installed apps to manage installed copies.".into());
    }
    let mut command = Command::new(&uninstaller);
    if remove_data {
        command.arg("/ISLANDXDATA");
    } else if remove_history {
        command.arg("/ISLANDXHISTORY");
    }
    command.spawn().map_err(|error| error.to_string())?;
    let _ = app.autolaunch().disable();
    app.exit(0);
    Ok(())
}
