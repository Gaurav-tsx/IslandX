use serde::Serialize;
use std::{fs, time::Duration};
use tauri::{
    async_runtime::{spawn_blocking, Mutex},
    ipc::Channel,
    AppHandle, Manager, State,
};
use tauri_plugin_updater::{Update, UpdaterExt};

const MANIFEST: &str = "staged-update.json";
const INSTALLER: &str = "staged-update.bin";
const MAX_INSTALLER: u64 = 64 * 1024 * 1024;

#[derive(Default)]
pub struct UpdateState(Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct Release {
    version: String,
    notes: Option<String>,
}

fn release(update: &Update) -> Release {
    Release {
        version: update.version.clone(),
        notes: update.body.clone(),
    }
}

fn restore(app: &AppHandle) -> Result<Option<(Update, Vec<u8>)>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let manifest = dir.join(MANIFEST);
    let installer = dir.join(INSTALLER);
    let restored = (|| {
        let manifest_size = fs::metadata(&manifest).ok()?.len();
        let installer_size = fs::metadata(&installer).ok()?.len();
        if manifest_size > 256 * 1024 || installer_size > MAX_INSTALLER {
            return None;
        }
        let raw = serde_json::from_slice(&fs::read(&manifest).ok()?).ok()?;
        let update = app.updater().ok()?.restore_update(raw).ok()??;
        let bytes = fs::read(&installer).ok()?;
        update.verify(&bytes).ok()?;
        Some((update, bytes))
    })();
    if restored.is_none() {
        let _ = fs::remove_file(manifest);
        let _ = fs::remove_file(installer);
    }
    Ok(restored)
}

#[tauri::command]
pub async fn update_ready(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<Release>, String> {
    let _guard = state.0.lock().await;
    spawn_blocking(move || restore(&app).map(|ready| ready.map(|(update, _)| release(&update))))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<Release>, String> {
    let mut candidate = state.0.lock().await;
    *candidate = None;
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(15))
        // Let the connector try the CDN's other addresses when one stops responding.
        .configure_client(|client| client.connect_timeout(Duration::from_secs(6)))
        .build()
        .map_err(|error| error.to_string())?;
    *candidate = updater.check().await.map_err(|error| error.to_string())?;
    Ok(candidate.as_ref().map(release))
}

#[derive(Clone, Serialize)]
pub struct Progress {
    received: usize,
    total: Option<u64>,
}

#[tauri::command]
pub async fn update_download(
    app: AppHandle,
    state: State<'_, UpdateState>,
    progress: Channel<Progress>,
) -> Result<Release, String> {
    let candidate = state.0.lock().await;
    let mut update = candidate
        .as_ref()
        .ok_or("Check for an update first.")?
        .clone();
    update.timeout = Some(Duration::from_secs(120));
    let mut received = 0;
    let mut reported = 0;
    let bytes = update
        .download(
            |count, total| {
                received += count;
                if received - reported >= 64 * 1024 {
                    let _ = progress.send(Progress { received, total });
                    reported = received;
                }
            },
            || {},
        )
        .await
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_INSTALLER {
        return Err("The installer exceeds the staging limit.".into());
    }
    let manifest = serde_json::to_vec(&update.raw_json).map_err(|error| error.to_string())?;
    spawn_blocking(move || -> Result<Release, String> {
        super::desktop::write_local(&app, INSTALLER, &bytes)?;
        super::desktop::write_local(&app, MANIFEST, &manifest)?;
        Ok(release(&update))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    state: State<'_, UpdateState>,
    version: String,
) -> Result<(), String> {
    let _guard = state.0.lock().await;
    spawn_blocking(move || -> Result<(), String> {
        let (update, bytes) =
            restore(&app)?.ok_or("The staged update is unavailable. Check for updates again.")?;
        if update.version != version {
            return Err(
                "The staged version changed. Reopen the update settings to review it.".into(),
            );
        }
        update.install(bytes).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
