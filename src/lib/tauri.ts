import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { WorkspaceDocument } from "../types/workspace";

export interface SaveProjectResponse {
  projectDir: string;
  workspacePath: string;
}

export interface LoadProjectResponse {
  workspace: WorkspaceDocument;
  projectDir: string;
  workspacePath: string;
};

export const saveEvidenceFile = async (
  bytes: Uint8Array,
  originalName: string
): Promise<string> => {
  console.debug("[tauri:saveEvidence] invoking with %d bytes, name=%s", bytes.length, originalName);
  const result = await invoke<string>("save_evidence_file", {
    bytes: Array.from(bytes),
    originalName
  });
  console.debug("[tauri:saveEvidence] returned path=%s", result);
  return result;
};

export const saveProject = async (
  workspace: WorkspaceDocument,
  projectDir?: string,
  askPath = false
): Promise<SaveProjectResponse> => {
  console.debug("[tauri:saveProject] invoking projectDir=%s askPath=%s", projectDir ?? "null", askPath);
  const result = await invoke<SaveProjectResponse>("save_project", {
    workspace,
    projectDir: projectDir ?? null,
    askPath
  });
  console.debug("[tauri:saveProject] result projectDir=%s workspacePath=%s", result.projectDir, result.workspacePath);
  return result;
};

export const loadProject = async (): Promise<LoadProjectResponse> => {
  return invoke("load_project");
};

export const copyEvidenceFile = async (
  sourcePath: string,
  originalName: string
): Promise<string> => {
  console.debug("[tauri:copyEvidence] invoking source=%s name=%s", sourcePath, originalName);
  const result = await invoke<string>("copy_evidence_file", {
    sourcePath,
    originalName
  });
  console.debug("[tauri:copyEvidence] returned path=%s", result);
  return result;
};

export const deleteEvidenceFile = async (storagePath: string): Promise<void> => {
  console.debug("[tauri:deleteEvidence] invoking storagePath=%s", storagePath);
  await invoke("delete_evidence_file", { storagePath });
  console.debug("[tauri:deleteEvidence] done");
};

export const readClipboardImage = async (): Promise<string | null> => {
  return invoke("read_clipboard_image");
};

const normalizeAssetPath = (filePath: string): string => {
  const normalizedSlashes = filePath.replace(/\\/g, "/");

  if (normalizedSlashes.startsWith("//?/UNC/")) {
    return `//${normalizedSlashes.slice("//?/UNC/".length)}`;
  }

  if (normalizedSlashes.startsWith("//?/")) {
    return normalizedSlashes.slice("//?/".length);
  }

  return normalizedSlashes;
};

export const toAssetUrl = (filePath: string): string => {
  const normalized = normalizeAssetPath(filePath);
  const url = convertFileSrc(normalized, "asset");
  console.debug("[tauri:toAssetUrl] %s -> %s", filePath, url);
  return url;
};

const SUPPORTED_EVIDENCE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "pdf"
]);

export const fileNameFromPath = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? "unknown";
};

export const extensionFromPath = (filePath: string): string => {
  const name = fileNameFromPath(filePath);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const isSupportedEvidenceFile = (filePath: string): boolean =>
  SUPPORTED_EVIDENCE_EXTENSIONS.has(extensionFromPath(filePath));

export const mimeFromExtension = (ext: string): string => {
  switch (ext.toLowerCase()) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
};
