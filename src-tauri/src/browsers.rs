use serde::Serialize;
use std::{collections::BTreeMap, path::PathBuf, process::Command};
use url::Url;
use windows_registry::{CURRENT_USER, LOCAL_MACHINE};

const CLIENTS: &str = r"SOFTWARE\Clients\StartMenuInternet";

#[derive(Serialize)]
pub struct Browser {
    id: String,
    name: String,
    #[serde(skip)]
    executable: PathBuf,
}

fn executable(command: &str) -> Option<PathBuf> {
    let command = command.trim();
    let path = if let Some(quoted) = command.strip_prefix('"') {
        quoted.split_once('"')?.0
    } else {
        let end = command.to_ascii_lowercase().find(".exe")? + 4;
        &command[..end]
    };
    let path = PathBuf::from(path);
    (path.is_absolute()
        && path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        && path.is_file())
    .then_some(path)
}

#[tauri::command]
pub fn installed_browsers() -> Vec<Browser> {
    let mut installed = BTreeMap::new();
    for clients in [LOCAL_MACHINE, CURRENT_USER] {
        let Ok(key) = clients.open(CLIENTS) else {
            continue;
        };
        let Ok(names) = key.keys() else { continue };
        for name in names {
            let Ok(client) = key.open(&name) else {
                continue;
            };
            let path = client
                .open(r"shell\open\command")
                .and_then(|command| command.get_string(""));
            let Some(executable) = path.ok().and_then(|command| executable(&command)) else {
                continue;
            };
            if executable
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("iexplore.exe"))
            {
                continue;
            }
            let id = name.to_ascii_lowercase();
            installed.insert(
                id.clone(),
                Browser {
                    id,
                    name: client
                        .get_string("")
                        .ok()
                        .filter(|value| !value.is_empty())
                        .unwrap_or(name),
                    executable,
                },
            );
        }
    }
    let mut installed: Vec<_> = installed.into_values().collect();
    installed.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    installed
}

pub fn launch(id: &str, url: &Url) -> Result<bool, String> {
    let Some(browser) = installed_browsers()
        .into_iter()
        .find(|browser| browser.id == id)
    else {
        return Ok(false);
    };
    Command::new(&browser.executable)
        .arg(url.as_str())
        .spawn()
        .map_err(|error| format!("Could not open {}. {error}", browser.name))?;
    Ok(true)
}
