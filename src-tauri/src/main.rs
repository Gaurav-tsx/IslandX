#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod clipboard;
mod desktop;
mod foreground;
mod glass;
mod media;
mod stats;
mod updates;
mod window;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            window::toggle(app)
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        window::toggle(app);
                    }
                })
                .build(),
        )
        .manage(stats::SamplerState::default())
        .manage(media::MediaState::default())
        .manage(clipboard::ClipboardState::default())
        .manage(updates::UpdateState::default())
        .manage(glass::GlassState::default())
        .invoke_handler(tauri::generate_handler![
            glass::transparency_allowed,
            foreground::foreground_app,
            window::island_layout,
            window::move_circle,
            window::monitors,
            window::set_keyboard,
            desktop::open_site,
            desktop::open_file,
            desktop::read_shelf,
            desktop::save_shelf,
            desktop::capture,
            desktop::open_windows_settings,
            desktop::uninstall,
            desktop::updates_configured,
            updates::update_check,
            updates::update_ready,
            updates::update_download,
            updates::update_install,
            stats::sample_stats,
            stats::pause_stats,
            media::start_media,
            media::stop_media,
            media::media_action,
            audio::read_audio,
            audio::change_audio,
            clipboard::clipboard_history,
            clipboard::clipboard_capture,
            clipboard::clipboard_copy,
            clipboard::clipboard_pin,
            clipboard::clipboard_clear,
        ])
        .setup(|app| {
            foreground::observe(app.handle());
            glass::observe(app.handle());
            let show = MenuItem::with_id(app, "show", "Toggle IslandX", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit IslandX", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("IslandX")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => window::toggle(app),
                    "settings" => {
                        let _ = app.emit("island-settings", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            let _ = app.global_shortcut().register(shortcut);
            clipboard::start(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("IslandX could not start")
        .run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                foreground::stop();
            }
        });
}
