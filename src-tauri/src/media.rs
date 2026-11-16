use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    sync::{mpsc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionMediaProperties as Properties,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::DataReader;
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

const TICKS: f64 = 10_000_000.0;
const WINDOWS_EPOCH: f64 = 11_644_473_600.0;

#[derive(Clone, Default, Serialize)]
struct Song {
    title: String,
    artist: String,
    art: Option<String>,
    playing: bool,
    position: f64,
    duration: f64,
}

enum Signal {
    Session,
    Track,
    Timing,
    Stop,
}

#[derive(Default)]
pub struct MediaState(Mutex<Option<mpsc::Sender<Signal>>>);

struct Runtime;

impl Runtime {
    fn new() -> windows::core::Result<Self> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
        Ok(Self)
    }
}

impl Drop for Runtime {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

struct Watch {
    session: Session,
    details: Option<i64>,
    playback: Option<i64>,
    timeline: Option<i64>,
}

impl Watch {
    fn new(session: Session, sender: &mpsc::Sender<Signal>) -> Self {
        let detail_events = sender.clone();
        let play_events = sender.clone();
        let timeline_events = sender.clone();
        let details = session
            .MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
                let _ = detail_events.send(Signal::Track);
                Ok(())
            }))
            .ok();
        let playback = session
            .PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
                let _ = play_events.send(Signal::Timing);
                Ok(())
            }))
            .ok();
        let timeline = session
            .TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
                let _ = timeline_events.send(Signal::Timing);
                Ok(())
            }))
            .ok();
        Self {
            session,
            details,
            playback,
            timeline,
        }
    }
}

impl Drop for Watch {
    fn drop(&mut self) {
        if let Some(token) = self.details {
            let _ = self.session.RemoveMediaPropertiesChanged(token);
        }
        if let Some(token) = self.playback {
            let _ = self.session.RemovePlaybackInfoChanged(token);
        }
        if let Some(token) = self.timeline {
            let _ = self.session.RemoveTimelinePropertiesChanged(token);
        }
    }
}

fn artwork(props: &Properties) -> Option<String> {
    let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.get().ok()?;
    let kind = stream.ContentType().ok()?.to_string();
    if !matches!(
        kind.as_str(),
        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    ) {
        return None;
    }
    let size = stream.Size().ok()?;
    if size == 0 || size > 512 * 1024 {
        return None;
    }
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0).ok()?).ok()?;
    let length = reader.LoadAsync(size as u32).ok()?.get().ok()?;
    let mut bytes = vec![0; length as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    Some(format!("data:{kind};base64,{}", STANDARD.encode(bytes)))
}

fn timing(session: &Session, song: &mut Song) {
    song.playing = session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .is_ok_and(|status| status == PlaybackStatus::Playing);
    if let Ok(timeline) = session.GetTimelineProperties() {
        let start = timeline.StartTime().map_or(0, |t| t.Duration) as f64 / TICKS;
        let end = timeline.EndTime().map_or(0, |t| t.Duration) as f64 / TICKS;
        let position = timeline.Position().map_or(0, |t| t.Duration) as f64 / TICKS;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0.0, |t| t.as_secs_f64());
        let since = timeline.LastUpdatedTime().map_or(0.0, |t| {
            (now + WINDOWS_EPOCH - t.UniversalTime as f64 / TICKS).max(0.0)
        });
        song.duration = (end - start).max(0.0);
        song.position =
            (position - start + if song.playing { since } else { 0.0 }).clamp(0.0, song.duration);
    }
}

fn watch(
    app: &AppHandle,
    sender: mpsc::Sender<Signal>,
    receiver: mpsc::Receiver<Signal>,
) -> windows::core::Result<()> {
    let _runtime = Runtime::new()?;
    let manager = Manager::RequestAsync()?.get()?;
    let session_events = sender.clone();
    let token = manager.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
        let _ = session_events.send(Signal::Session);
        Ok(())
    }))?;
    let mut session = None;
    let mut song = Song::default();
    let _ = sender.send(Signal::Session);
    while let Ok(signal) = receiver.recv() {
        let mut refresh_session = false;
        let mut refresh_track = false;
        let mut stopped = false;
        for pending in std::iter::once(signal).chain(receiver.try_iter()) {
            match pending {
                Signal::Session => refresh_session = true,
                Signal::Track => refresh_track = true,
                Signal::Timing => {}
                Signal::Stop => {
                    stopped = true;
                    break;
                }
            }
        }
        if stopped {
            break;
        }
        if refresh_session {
            session = manager
                .GetCurrentSession()
                .ok()
                .map(|session| Watch::new(session, &sender));
        }
        if let Some(watch) = &session {
            if refresh_session || refresh_track {
                song = Song::default();
                if let Ok(properties) = watch
                    .session
                    .TryGetMediaPropertiesAsync()
                    .and_then(|work| work.get())
                {
                    song.title = properties
                        .Title()
                        .map_or_else(|_| String::new(), |value| value.to_string());
                    song.artist = properties
                        .Artist()
                        .map_or_else(|_| String::new(), |value| value.to_string());
                    song.art = artwork(&properties);
                }
            }
            timing(&watch.session, &mut song);
        }
        let _ = app.emit("island-media", session.as_ref().map(|_| &song));
    }
    manager.RemoveCurrentSessionChanged(token)?;
    Ok(())
}

#[tauri::command]
pub fn start_media(app: AppHandle, state: State<'_, MediaState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|error| error.to_string())?;
    if let Some(previous) = slot.take() {
        let _ = previous.send(Signal::Stop);
    }
    let (sender, receiver) = mpsc::channel();
    *slot = Some(sender.clone());
    std::thread::Builder::new()
        .name("islandx-media".into())
        .spawn(move || {
            if watch(&app, sender, receiver).is_err() {
                let _ = app.emit("island-media", None::<Song>);
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn stop_media(state: State<'_, MediaState>) {
    if let Ok(mut slot) = state.0.lock() {
        if let Some(sender) = slot.take() {
            let _ = sender.send(Signal::Stop);
        }
    }
}

#[tauri::command]
pub async fn media_action(action: String, seconds: Option<f64>) -> Result<(), String> {
    let success = tauri::async_runtime::spawn_blocking(move || -> Result<bool, String> {
        let run = || -> windows::core::Result<bool> {
            let _runtime = Runtime::new()?;
            let session = Manager::RequestAsync()?.get()?.GetCurrentSession()?;
            match action.as_str() {
                "toggle" => session.TryTogglePlayPauseAsync()?.get(),
                "previous" => session.TrySkipPreviousAsync()?.get(),
                "next" => session.TrySkipNextAsync()?.get(),
                "seek" => {
                    let position = seconds
                        .filter(|value| value.is_finite() && (0.0..=172_800.0).contains(value))
                        .ok_or_else(|| {
                            windows::core::Error::from_hresult(windows::core::HRESULT(
                                0x80070057u32 as i32,
                            ))
                        })?;
                    let start = session.GetTimelineProperties()?.StartTime()?.Duration;
                    session
                        .TryChangePlaybackPositionAsync(start + (position * TICKS) as i64)?
                        .get()
                }
                _ => Ok(false),
            }
        };
        run().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    if !success {
        return Err("The active media player declined this control.".into());
    }
    Ok(())
}
