use serde::Serialize;
use windows::core::GUID;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eCapture, eMultimedia, eRender, EDataFlow, IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audio {
    volume: u32,
    mic_muted: Option<bool>,
}

struct Com;

impl Com {
    fn init() -> windows::core::Result<Self> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
        Ok(Self)
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn endpoint(flow: EDataFlow) -> windows::core::Result<IAudioEndpointVolume> {
    unsafe {
        let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        devices
            .GetDefaultAudioEndpoint(flow, eMultimedia)?
            .Activate(CLSCTX_ALL, None)
    }
}

#[tauri::command]
pub async fn read_audio() -> Result<Audio, String> {
    tauri::async_runtime::spawn_blocking(|| -> windows::core::Result<Audio> {
        let _com = Com::init()?;
        let output = endpoint(eRender)?;
        let volume = unsafe { output.GetMasterVolumeLevelScalar()? };
        let mic_muted = endpoint(eCapture)
            .and_then(|mic| unsafe { mic.GetMute() })
            .ok()
            .map(|mute| mute.as_bool());
        Ok(Audio {
            volume: (volume * 100.0).round() as u32,
            mic_muted,
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn change_audio(volume: Option<u32>, mic_muted: Option<bool>) -> Result<(), String> {
    if volume.is_some_and(|volume| volume > 100) {
        return Err("Volume must be between 0 and 100.".into());
    }
    tauri::async_runtime::spawn_blocking(move || -> windows::core::Result<()> {
        let _com = Com::init()?;
        let context = GUID::default();
        unsafe {
            if let Some(volume) = volume {
                endpoint(eRender)?.SetMasterVolumeLevelScalar(volume as f32 / 100.0, &context)?;
            }
            if let Some(muted) = mic_muted {
                endpoint(eCapture)?.SetMute(muted, &context)?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}
