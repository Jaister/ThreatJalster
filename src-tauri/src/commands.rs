use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;
use uuid::Uuid;

const MAX_WORKSPACE_BYTES: usize = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const WORKSPACE_FILE: &str = "workspace.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectResponse {
    pub project_dir: String,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadProjectResponse {
    pub workspace: Value,
    pub project_dir: String,
    pub workspace_path: String,
}

fn sanitize_token(value: &str, fallback: &str, max_len: usize) -> String {
    let cleaned = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        return fallback.to_string();
    }

    trimmed.chars().take(max_len).collect()
}

fn sanitize_extension(file_name: &str) -> String {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();

    sanitize_token(&extension, "bin", 12)
}

fn sanitize_stem(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("evidence");

    sanitize_token(stem, "evidence", 80)
}

fn app_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("cannot resolve app_data_dir: {e}"))?;

    fs::create_dir_all(&root).map_err(|e| format!("cannot create app_data_dir: {e}"))?;
    Ok(root)
}

fn evidence_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app_data_root(app)?.join("evidences");
    fs::create_dir_all(&root).map_err(|e| format!("cannot create evidences directory: {e}"))?;
    eprintln!("[evidence] root dir: {}", root.display());
    Ok(root)
}

fn projects_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app_data_root(app)?.join("projects");
    fs::create_dir_all(&root).map_err(|e| format!("cannot create projects directory: {e}"))?;
    Ok(root)
}

fn default_project_dir(app: &AppHandle, workspace: &Value) -> Result<PathBuf, String> {
    let investigation_id = workspace
        .get("meta")
        .and_then(|meta| meta.get("investigationId"))
        .and_then(Value::as_str)
        .unwrap_or("workspace");

    let safe_name = sanitize_token(investigation_id, "workspace", 72);
    let folder_name = format!("{}_{}", safe_name, Utc::now().format("%Y%m%d%H%M%S"));
    let path = projects_root(app)?.join(folder_name);
    fs::create_dir_all(&path).map_err(|e| format!("cannot create project directory: {e}"))?;
    Ok(path)
}

fn default_workspace_file_name(workspace: &Value) -> String {
    let investigation_id = workspace
        .get("meta")
        .and_then(|meta| meta.get("investigationId"))
        .and_then(Value::as_str)
        .unwrap_or("workspace");

    let safe_name = sanitize_token(investigation_id, "workspace", 72);
    format!("{safe_name}.json")
}

fn normalize_dialog_path(path: PathBuf) -> PathBuf {
    if path.extension().is_some() {
        return path;
    }

    path.with_extension("json")
}

async fn pick_workspace_save_path(
    app: &AppHandle,
    workspace: &Value,
    project_dir: Option<&str>,
) -> Result<PathBuf, String> {
    let suggested_dir = project_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(projects_root(app)?);

    fs::create_dir_all(&suggested_dir)
        .map_err(|e| format!("cannot create suggested directory: {e}"))?;

    let (tx, rx) = oneshot::channel();

    app.dialog()
        .file()
        .set_title("Save project workspace")
        .set_file_name(default_workspace_file_name(workspace))
        .set_directory(suggested_dir)
        .add_filter("Workspace JSON", &["json"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    let selected = rx
        .await
        .map_err(|_| "dialog channel closed unexpectedly".to_string())?
        .ok_or_else(|| "save cancelled".to_string())?;

    let path = selected
        .into_path()
        .map_err(|e| format!("invalid selected save path: {e}"))?;

    Ok(normalize_dialog_path(path))
}

fn resolve_project_dir(
    app: &AppHandle,
    workspace: &Value,
    project_dir: Option<String>,
) -> Result<PathBuf, String> {
    if let Some(raw_dir) = project_dir {
        let trimmed = raw_dir.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            let resolved = if candidate
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
            {
                candidate
                    .parent()
                    .ok_or_else(|| "invalid project directory path".to_string())?
                    .to_path_buf()
            } else {
                candidate
            };

            fs::create_dir_all(&resolved)
                .map_err(|e| format!("cannot create target project directory: {e}"))?;

            return Ok(resolved);
        }
    }

    default_project_dir(app, workspace)
}

fn write_atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let tmp_name = format!(
        "{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace"),
        Uuid::new_v4()
    );
    let tmp_path = path.with_file_name(tmp_name);

    fs::write(&tmp_path, content).map_err(|e| format!("write failed: {e}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("replace failed: {e}"))?;
    }
    fs::rename(&tmp_path, path).map_err(|e| format!("rename failed: {e}"))?;
    Ok(())
}

fn encode_rgba_to_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buf, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("png header error: {e}"))?;
        writer
            .write_image_data(rgba)
            .map_err(|e| format!("png write error: {e}"))?;
    }
    Ok(buf)
}

#[tauri::command]
pub fn save_evidence_file(app: AppHandle, bytes: Vec<u8>, original_name: String) -> Result<String, String> {
    eprintln!("[evidence:save] received {} bytes, name={}", bytes.len(), original_name);

    if bytes.is_empty() {
        return Err("image payload is empty".to_string());
    }

    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("image payload exceeds maximum size".to_string());
    }

    let file_name = format!(
        "{}_{}.{}",
        Uuid::new_v4(),
        sanitize_stem(&original_name),
        sanitize_extension(&original_name)
    );
    let file_path = evidence_root(&app)?.join(file_name);
    eprintln!("[evidence:save] writing to {}", file_path.display());
    write_atomic(&file_path, &bytes)?;
    eprintln!("[evidence:save] ok, exists={}", file_path.exists());

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_project(
    app: AppHandle,
    workspace: Value,
    project_dir: Option<String>,
    ask_path: Option<bool>,
) -> Result<SaveProjectResponse, String> {
    eprintln!("[save] save_project called, project_dir={:?}, ask_path={:?}", project_dir, ask_path);

    let payload =
        serde_json::to_vec_pretty(&workspace).map_err(|e| format!("serialize workspace failed: {e}"))?;
    eprintln!("[save] serialized payload: {} bytes", payload.len());

    if payload.len() > MAX_WORKSPACE_BYTES {
        return Err("workspace payload too large".to_string());
    }

    let ask_path = ask_path.unwrap_or(false);
    let workspace_path = if ask_path {
        eprintln!("[save] opening file picker dialog");
        let path = pick_workspace_save_path(&app, &workspace, project_dir.as_deref()).await?;
        eprintln!("[save] dialog returned: {}", path.display());
        path
    } else if let Some(ref raw) = project_dir {
        let candidate = PathBuf::from(raw.trim());
        if candidate
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("json"))
            .unwrap_or(false)
        {
            eprintln!("[save] reusing exact workspace path: {}", candidate.display());
            candidate
        } else {
            let target_dir = resolve_project_dir(&app, &workspace, project_dir)?;
            let path = target_dir.join(WORKSPACE_FILE);
            eprintln!("[save] resolved path (no dialog): {}", path.display());
            path
        }
    } else {
        let target_dir = resolve_project_dir(&app, &workspace, None)?;
        let path = target_dir.join(WORKSPACE_FILE);
        eprintln!("[save] resolved path (no projectDir): {}", path.display());
        path
    };

    let target_dir = workspace_path
        .parent()
        .ok_or_else(|| "cannot resolve save directory".to_string())?
        .to_path_buf();

    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("cannot create target project directory: {e}"))?;

    eprintln!("[save] writing {} bytes to {}", payload.len(), workspace_path.display());
    write_atomic(&workspace_path, &payload)?;
    eprintln!("[save] ok, file exists={}", workspace_path.exists());

    Ok(SaveProjectResponse {
        project_dir: target_dir.to_string_lossy().to_string(),
        workspace_path: workspace_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn load_project(app: AppHandle) -> Result<LoadProjectResponse, String> {
    let (tx, rx) = oneshot::channel();

    app.dialog()
        .file()
        .add_filter("Workspace JSON", &["json"])
        .set_title("Select workspace.json")
        .pick_file(move |path| {
            let _ = tx.send(path);
        });

    let selected = rx
        .await
        .map_err(|_| "dialog channel closed unexpectedly".to_string())?
        .ok_or_else(|| "file selection cancelled".to_string())?;

    let workspace_path = selected
        .into_path()
        .map_err(|e| format!("invalid selected file path: {e}"))?;

    let content = fs::read_to_string(&workspace_path)
        .map_err(|e| format!("cannot read selected workspace file: {e}"))?;

    if content.len() > MAX_WORKSPACE_BYTES {
        return Err("workspace file too large".to_string());
    }

    let workspace: Value =
        serde_json::from_str(&content).map_err(|e| format!("invalid workspace format: {e}"))?;

    let project_dir = workspace_path
        .parent()
        .ok_or_else(|| "cannot resolve project directory".to_string())?
        .to_string_lossy()
        .to_string();

    Ok(LoadProjectResponse {
        workspace,
        project_dir,
        workspace_path: workspace_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn read_clipboard_image(app: AppHandle) -> Result<Option<String>, String> {
    eprintln!("[evidence:clipboard] opening system clipboard");
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("cannot open clipboard: {e}"))?;

    let img = match clipboard.get_image() {
        Ok(img) => img,
        Err(arboard::Error::ContentNotAvailable) => {
            eprintln!("[evidence:clipboard] no image in clipboard");
            return Ok(None);
        }
        Err(e) => {
            eprintln!("[evidence:clipboard] error: {e}");
            return Err(format!("clipboard read error: {e}"));
        }
    };

    eprintln!("[evidence:clipboard] got image {}x{}, {} rgba bytes", img.width, img.height, img.bytes.len());
    let rgba: Vec<u8> = img.bytes.into_owned();
    let png_bytes =
        encode_rgba_to_png(img.width as u32, img.height as u32, &rgba)?;
    eprintln!("[evidence:clipboard] encoded to {} png bytes", png_bytes.len());

    if png_bytes.len() > MAX_IMAGE_BYTES {
        return Err("clipboard image exceeds maximum size".to_string());
    }

    let file_name = format!("{}_clipboard.png", Uuid::new_v4());
    let file_path = evidence_root(&app)?.join(file_name);
    write_atomic(&file_path, &png_bytes)?;
    eprintln!("[evidence:clipboard] saved to {}", file_path.display());

    Ok(Some(file_path.to_string_lossy().to_string()))
}
