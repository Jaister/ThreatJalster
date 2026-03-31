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
  return invoke("save_evidence_file", {
    bytes: Array.from(bytes),
    originalName
  });
};

export const saveProject = async (
  workspace: WorkspaceDocument,
  projectDir?: string,
  askPath = false
): Promise<SaveProjectResponse> => {
  return invoke("save_project", {
    workspace,
    projectDir: projectDir ?? null,
    askPath
  });
};

export const loadProject = async (): Promise<LoadProjectResponse> => {
  return invoke("load_project");
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

export const toAssetUrl = (filePath: string): string =>
  convertFileSrc(normalizeAssetPath(filePath), "asset");
