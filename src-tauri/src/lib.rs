use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

// Helper function to position the window at the bottom-right corner, just above the taskbar.
fn position_window(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale_factor = monitor.scale_factor();
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();

        let window_width = (360.0 * scale_factor) as u32;
        let window_height = (520.0 * scale_factor) as u32;

        // On Windows, position at the bottom-right corner, leaving space for the taskbar (approx 48-60 logical pixels).
        // Standard Windows taskbar height is 48px, plus some padding.
        let padding_x = (16.0 * scale_factor) as i32;
        let padding_y = (60.0 * scale_factor) as i32;

        let x = monitor_pos.x + (monitor_size.width as i32) - (window_width as i32) - padding_x;
        let y = monitor_pos.y + (monitor_size.height as i32) - (window_height as i32) - padding_y;

        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

// Toggle window visibility and position it near the tray
fn toggle_window(window: &tauri::WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        position_window(window);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Get the main window
            if let Some(window) = app.get_webview_window("main") {
                // Initial positioning of the window
                position_window(&window);

                // Setup blur hiding (auto-hide when clicking outside)
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = w.hide();
                    }
                });
            }

            // Create Tray Menu items
            let app_handle = app.handle().clone();
            let toggle = MenuItem::with_id(&app_handle, "toggle", "Open Nimbus", true, None::<&str>)?;
            let quit = MenuItem::with_id(&app_handle, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(&app_handle, &[&toggle, &quit])?;

            // Create Tray Icon
            // Let's load the default app icon
            let icon = app.default_window_icon().cloned().ok_or("No default window icon found")?;
            
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false) // Left click will trigger window toggle, right click triggers menu
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "toggle" => {
                            if let Some(window) = app.get_webview_window("main") {
                                toggle_window(&window);
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_window(&window);
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
