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
