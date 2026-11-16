use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::{
    async_runtime::Mutex, webview::NewWindowResponse, AppHandle, Manager, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use tokio::{sync::oneshot, time::timeout};
use url::Url;
use webview2_com::{
    take_pwstr, CoTaskMemPWSTR,
    Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
    WebResourceRequestedEventHandler,
};

const HOME: &str = "https://music.youtube.com/";
const LABEL: &str = "music-player";
const SCRIPT: &str = include_str!("music-player.js");
const AD_REQUESTS: &[&str] = &[
    "https://*.doubleclick.net/*",
    "https://*.googlesyndication.com/*",
    "https://*.googleadservices.com/*",
    "https://*.googletagmanager.com/*",
    "https://*.google-analytics.com/*",
    "https://music.youtube.com/pagead/*",
    "https://music.youtube.com/api/stats/ads*",
    "https://www.youtube.com/pagead/*",
    "https://www.youtube.com/api/stats/ads*",
];

#[derive(Default)]
pub struct PlayerState(Mutex<()>);

fn music_origin(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("music.youtube.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

async fn attach_filter(window: &WebviewWindow) -> Result<(), String> {
    let (send, receive) = oneshot::channel();
    window
        .with_webview(move |platform| {
            let result = (|| -> webview2_com::Result<()> {
                // WebView2 calls the handler only for the URL patterns below.
                unsafe {
                    let view = platform.controller().CoreWebView2()?;
                    let environment = platform.environment();
                    for pattern in AD_REQUESTS {
                        let pattern = CoTaskMemPWSTR::from(*pattern);
                        view.AddWebResourceRequestedFilter(
                            *pattern.as_ref().as_pcwstr(),
                            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                        )?;
                    }
                    view.add_WebResourceRequested(
                        &WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                            if let Some(args) = args {
                                let mut uri = Default::default();
                                args.Request()?.Uri(&mut uri)?;
                                let uri = take_pwstr(uri);
                                if !blocked_request(&uri) {
                                    return Ok(());
                                }
                                let reason = CoTaskMemPWSTR::from("Blocked");
                                let headers = CoTaskMemPWSTR::from("Cache-Control: no-store");
                                let response = environment.CreateWebResourceResponse(
                                    None,
                                    403,
                                    *reason.as_ref().as_pcwstr(),
                                    *headers.as_ref().as_pcwstr(),
                                )?;
                                args.SetResponse(&response)?;
                            }
                            Ok(())
                        })),
                        &mut 0,
                    )?;
                }
                Ok(())
            })();
            let _ = send.send(result.map_err(|error| error.to_string()));
        })
        .map_err(|error| error.to_string())?;
    timeout(Duration::from_secs(8), receive)
        .await
        .map_err(|_| "Could not initialize the music request filter.".to_string())?
        .map_err(|error| error.to_string())?
}

fn blocked_request(uri: &str) -> bool {
    let Ok(url) = Url::parse(uri) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    AD_REQUESTS.iter().any(|pattern| {
        let Some((domain, path)) = pattern.trim_start_matches("https://").split_once('/') else {
            return false;
        };
        if let Some(suffix) = domain.strip_prefix('*') {
            host.ends_with(suffix)
        } else {
            host == domain
                && url
                    .path()
                    .starts_with(&format!("/{}", path.trim_end_matches('*')))
        }
    })
}

async fn get_player(app: &AppHandle, state: &PlayerState) -> Result<WebviewWindow, String> {
    let _guard = state.0.lock().await;
    if let Some(player) = app.get_webview_window(LABEL) {
        return Ok(player);
    }
    let profile = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("Music");
    let player = WebviewWindowBuilder::new(
        app,
        LABEL,
        WebviewUrl::External(Url::parse("about:blank").unwrap()),
    )
    .title("IslandX Music")
    .data_directory(profile)
    .visible(false)
    .focused(false)
    .skip_taskbar(true)
    .decorations(false)
    .inner_size(960.0, 680.0)
    .on_navigation(|url| url.as_str() == "about:blank" || music_origin(url))
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .initialization_script(SCRIPT)
    .additional_browser_args("--autoplay-policy=no-user-gesture-required")
    .build()
    .map_err(|error| error.to_string())?;
    if let Err(error) = attach_filter(&player).await.and_then(|_| {
        player
            .navigate(Url::parse(HOME).unwrap())
            .map_err(|error| error.to_string())
    }) {
        let _ = player.destroy();
        return Err(error);
    }
    Ok(player)
}

pub async fn preload(app: AppHandle) {
    let state = app.state::<PlayerState>();
    let _ = get_player(&app, &state).await;
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Request {
    Status,
    Search { query: String },
    Results { query: String },
    Play { path: String },
    Toggle,
    Previous,
    Next,
    Seek { seconds: f64 },
}

fn playable(path: &str) -> bool {
    if !path.starts_with("/watch?") && !path.starts_with("/playlist?") {
        return false;
    }
    let Ok(base) = Url::parse(HOME) else {
        return false;
    };
    let Ok(url) = base.join(path) else {
        return false;
    };
    if !music_origin(&url)
        || url.fragment().is_some()
        || !matches!(url.path(), "/watch" | "/playlist")
    {
        return false;
    }
    let mut video = false;
    let mut list = false;
    for (key, value) in url.query_pairs() {
        if value.is_empty()
            || value.len() > 140
            || !value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            return false;
        }
        match key.as_ref() {
            "v" if !video && value.len() == 11 => video = true,
            "list" if !list => list = true,
            _ => return false,
        }
    }
    (url.path() == "/watch" && video) || (url.path() == "/playlist" && list && !video)
}

#[tauri::command]
pub async fn music_request(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, PlayerState>,
    request: Request,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Music controls are available inside IslandX.".into());
    }
    match &request {
        Request::Search { query } | Request::Results { query }
            if query.trim().is_empty() || query.chars().count() > 120 =>
        {
            return Err("Enter a search of up to 120 characters.".into());
        }
        Request::Play { path } if path.len() > 350 || !playable(path) => {
            return Err("This is not a YouTube Music track or playlist.".into());
        }
        Request::Seek { seconds } if !seconds.is_finite() || *seconds < 0.0 => {
            return Err("Invalid playback position.".into());
        }
        _ => {}
    }
    let player = get_player(&app, &state).await?;
    let request = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let script = format!("window.islandXMusic?.({request}) ?? null");
    let (send, mut receive) = tauri::async_runtime::channel(1);
    player
        .eval_with_callback(script, move |result| {
            let _ = send.try_send(result);
        })
        .map_err(|error| error.to_string())?;
    let result = timeout(Duration::from_secs(8), receive.recv())
        .await
        .map_err(|_| "YouTube Music did not respond.".to_string())?
        .ok_or_else(|| "YouTube Music is unavailable.".to_string())?;
    if result.len() > 65536 {
        return Err("The YouTube Music response was too large.".into());
    }
    serde_json::from_str(&result).map_err(|_| "YouTube Music returned an invalid response.".into())
}
