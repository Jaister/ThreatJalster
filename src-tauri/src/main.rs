#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_evidence_file,
            commands::save_project,
            commands::load_project
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
