import type { Edge, Node } from "@xyflow/react";

export type Severity = "low" | "medium" | "high" | "critical";
export type NodeMode = "view" | "edit";

export interface EvidenceImageMeta {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface CodeSnippet {
  language: string;
  content: string;
}

export interface NodePayload {
  markdown: string;
  snippet?: CodeSnippet;
  evidenceImageIds: string[];
  tags: string[];
  severity: Severity;
}

export interface ThreatNodeData {
  [key: string]: unknown;
  title: string;
  mode: NodeMode;
  payload: NodePayload;
  updatedAt: string;
}

export interface ThreatEdgeData {
  [key: string]: unknown;
  relation: string;
  confidence: number;
}

export type ThreatNode = Node<ThreatNodeData, "intelNode" | "evidenceNode">;
export type ThreatEdge = Edge<ThreatEdgeData>;

export interface WorkspaceMeta {
  investigationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDocument {
  version: number;
  meta: WorkspaceMeta;
  nodes: ThreatNode[];
  edges: ThreatEdge[];
  evidence: Record<string, EvidenceImageMeta>;
}
