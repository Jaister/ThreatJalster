import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition
} from "@xyflow/react";
import { create } from "zustand";
import { deleteEvidenceFile, loadProject, saveProject, toAssetUrl } from "../lib/tauri";
import type {
  EdgeRelation,
  EvidenceImageMeta,
  NodeMode,
  Severity,
  ThreatBehavior,
  ThreatEdge,
  ThreatNode,
  WorkspaceDocument
} from "../types/workspace";

type EvidenceMime = EvidenceImageMeta["mimeType"];

interface ToastMessage {
  id: string;
  text: string;
}

interface NodeTextUpdates {
  title?: string;
  markdown?: string;
  tags?: string[];
  ttps?: string[];
  iocs?: string[];
  snippetLanguage?: string;
  snippetContent?: string;
  severity?: Severity;
  confidence?: number;
  behavior?: ThreatBehavior;
  observedAt?: string;
}

interface WorkspaceState {
  nodes: ThreatNode[];
  edges: ThreatEdge[];
  evidence: Record<string, EvidenceImageMeta>;
  evidencePreviewData: Record<string, string>;
  openedImagePreviewSrc?: string;
  openedImagePreviewMimeType?: string;
  searchTerm: string;
  activeSearchNodeId?: string;
  selectedNodeId?: string;
  investigationId: string;
  projectDir?: string;
  workspacePath?: string;
  isDragOverCanvas: boolean;
  isBusy: boolean;
  error?: string;
  toasts: ToastMessage[];
  onNodesChange: (changes: NodeChange<ThreatNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ThreatEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  deleteEdge: (edgeId: string) => void;
  addNode: (position?: XYPosition) => void;
  deleteNode: (nodeId: string) => Promise<void>;
  deleteSelectedNode: () => void;
  setSelectedNodeId: (nodeId?: string) => void;
  setNodeMode: (nodeId: string, mode: NodeMode) => void;
  updateNodeTextFields: (nodeId: string, updates: NodeTextUpdates) => void;
  attachEvidenceToNode: (params: {
    nodeId: string;
    originalFileName: string;
    mimeType: EvidenceMime;
    storagePath: string;
    previewSrc: string;
  }) => void;
  removeEvidenceFromNode: (params: {
    nodeId: string;
    imageId: string;
  }) => Promise<void>;
  openImagePreview: (src: string, mimeType?: string) => void;
  closeImagePreview: () => void;
  setSearchTerm: (value: string) => void;
  setActiveSearchNodeId: (nodeId?: string) => void;
  enqueueToast: (text: string) => void;
  dismissToast: (toastId: string) => void;
  setDragOverCanvas: (value: boolean) => void;
  setInvestigationId: (id: string) => void;
  saveWorkspace: () => Promise<void>;
  saveWorkspaceAs: () => Promise<void>;
  loadProjectFromDialog: () => Promise<void>;
}

const now = () => new Date().toISOString();

const isDialogCancellation = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel/i.test(message);
};

const buildWorkspaceDocument = (state: WorkspaceState): WorkspaceDocument => ({
  version: 1,
  meta: {
    investigationId: state.investigationId,
    name: "Threat Investigation",
    createdAt: now(),
    updatedAt: now()
  },
  nodes: state.nodes,
  edges: state.edges,
  evidence: state.evidence
});

const createNodePayload = (index: number) => ({
  title: `Intel Node ${index}`,
  mode: "view" as NodeMode,
  updatedAt: now(),
  payload: {
    markdown: "### New finding\nDocument your hypothesis, indicators, and next action.",
    snippet: {
      language: "text",
      content: "Add command or log snippet here"
    },
    evidenceImageIds: [] as string[],
    tags: ["new"],
    ttps: [] as string[],
    iocs: [] as string[],
    severity: "medium" as const,
    confidence: 0.5
  }
});

const createDemoWorkspace = (): WorkspaceDocument => {
  const investigationId = "demo-investigation";

  return {
    version: 1,
    meta: {
      investigationId,
      name: "Initial Threat Hunt",
      createdAt: now(),
      updatedAt: now()
    },
    nodes: [
      {
        id: "node-1",
        type: "evidenceNode",
        position: { x: 60, y: 40 },
        data: {
          title: "Initial Foothold",
          mode: "view",
          updatedAt: now(),
          payload: {
            markdown:
              "### IOC Summary\nPotential phishing entry-point via malicious macro-enabled document.",
            snippet: {
              language: "powershell",
              content:
                "Get-WinEvent -LogName Security | Where-Object { $_.Id -eq 4688 } | Select-Object -First 5"
            },
            evidenceImageIds: [],
            tags: ["phishing"],
            ttps: ["T1566.001", "T1059.001"],
            iocs: [],
            severity: "high",
            confidence: 0.75,
            behavior: "initial-access"
          }
        }
      }
    ],
    edges: [],
    evidence: {}
  };
};

const normalizeNode = (node: ThreatNode): ThreatNode => {
  const normalizedType = node.type === "intelNode" ? "evidenceNode" : node.type;
  const mode = node.data.mode === "edit" ? "edit" : "view";

  const payload = node.data.payload;

  return {
    ...node,
    type: normalizedType,
    draggable: mode !== "edit",
    data: {
      ...node.data,
      mode,
      payload: {
        ...payload,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        ttps: Array.isArray(payload.ttps) ? payload.ttps : [],
        iocs: Array.isArray(payload.iocs) ? payload.iocs : [],
        evidenceImageIds: Array.isArray(payload.evidenceImageIds) ? payload.evidenceImageIds : [],
        severity: payload.severity ?? "medium",
        confidence: typeof payload.confidence === "number" ? payload.confidence : 0.5
      }
    }
  };
};

const VALID_EDGE_RELATIONS = new Set<string>([
  "enables", "lateral-to", "escalates", "exfiltrates", "persists", "c2-channel", "related"
]);

const normalizeEdgeRelation = (raw: unknown): "related" | string => {
  if (typeof raw === "string" && VALID_EDGE_RELATIONS.has(raw)) {
    return raw;
  }
  return "related";
};

const buildEvidencePreviews = (
  evidence: Record<string, EvidenceImageMeta>
): Record<string, string> => {
  const previewData: Record<string, string> = {};

  for (const [imageId, metadata] of Object.entries(evidence)) {
    if (!metadata.storagePath) {
      continue;
    }

    previewData[imageId] = toAssetUrl(metadata.storagePath);
  }

  return previewData;
};

const normalizeWorkspace = (workspace: WorkspaceDocument): WorkspaceDocument => {
  const rawEvidence =
    workspace.evidence && typeof workspace.evidence === "object" ? workspace.evidence : {};

  const evidence: Record<string, EvidenceImageMeta> = {};

  for (const [imageId, metadata] of Object.entries(rawEvidence)) {
    if (!metadata || typeof metadata !== "object" || !metadata.storagePath) {
      continue;
    }

    const mimeType =
      typeof metadata.mimeType === "string" && metadata.mimeType.startsWith("image/")
        ? metadata.mimeType
        : "image/png";

    evidence[imageId] = {
      id: imageId,
      fileName:
        typeof metadata.fileName === "string" && metadata.fileName.length > 0
          ? metadata.fileName
          : `${imageId}.bin`,
      mimeType,
      storagePath: metadata.storagePath,
      width: typeof metadata.width === "number" ? metadata.width : undefined,
      height: typeof metadata.height === "number" ? metadata.height : undefined,
      createdAt:
        typeof metadata.createdAt === "string" && metadata.createdAt.length > 0
          ? metadata.createdAt
          : now()
    };
  }

  const rawEdges = Array.isArray(workspace.edges) ? (workspace.edges as ThreatEdge[]) : [];
  const normalizedEdges: ThreatEdge[] = rawEdges.map((edge) => {
    const d = edge.data;
    const relation = normalizeEdgeRelation(d?.relation) as EdgeRelation;
    const confidence = typeof d?.confidence === "number" ? d.confidence : 0.5;
    return { ...edge, data: { ...d, relation, confidence } };
  });

  return {
    version: typeof workspace.version === "number" ? workspace.version : 1,
    meta: {
      investigationId:
        workspace.meta && typeof workspace.meta.investigationId === "string"
          ? workspace.meta.investigationId
          : "demo-investigation",
      name:
        workspace.meta && typeof workspace.meta.name === "string"
          ? workspace.meta.name
          : "Threat Investigation",
      createdAt:
        workspace.meta && typeof workspace.meta.createdAt === "string"
          ? workspace.meta.createdAt
          : now(),
      updatedAt:
        workspace.meta && typeof workspace.meta.updatedAt === "string"
          ? workspace.meta.updatedAt
          : now()
    },
    nodes: Array.isArray(workspace.nodes)
      ? workspace.nodes.map((node) => normalizeNode(node as ThreatNode))
      : [],
    edges: normalizedEdges,
    evidence
  };
};

const demo = createDemoWorkspace();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  investigationId: demo.meta.investigationId,
  projectDir: undefined,
  workspacePath: undefined,
  nodes: demo.nodes,
  edges: demo.edges,
  evidence: demo.evidence,
  evidencePreviewData: {},
  openedImagePreviewSrc: undefined,
  openedImagePreviewMimeType: undefined,
  searchTerm: "",
  activeSearchNodeId: undefined,
  selectedNodeId: demo.nodes[0]?.id,
  isDragOverCanvas: false,
  isBusy: false,
  error: undefined,
  toasts: [],

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges<ThreatNode>(changes, state.nodes)
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges<ThreatEdge>(changes, state.edges)
    }));
  },

  onConnect: (connection) => {
    if (!connection.source || !connection.target) {
      return;
    }

    if (connection.source === connection.target) {
      get().enqueueToast("A node cannot connect to itself.");
      return;
    }

    set((state) => ({
      edges: addEdge<ThreatEdge>(
        {
          ...connection,
          id: crypto.randomUUID(),
          type: "straight",
          data: {
            relation: "related" as EdgeRelation,
            confidence: 0.65
          }
        },
        state.edges
      ) as ThreatEdge[]
    }));
  },

  deleteEdge: (edgeId) => {
    set((state) => {
      const exists = state.edges.some((edge) => edge.id === edgeId);
      if (!exists) {
        return state;
      }

      return {
        edges: state.edges.filter((edge) => edge.id !== edgeId)
      };
    });

    get().enqueueToast("Edge deleted.");
  },

  addNode: (position) => {
    set((state) => {
      const nodeId = `node-${crypto.randomUUID()}`;
      const selectedNode = state.nodes.find((node) => node.id === state.selectedNodeId);
      const nextPosition =
        position ??
        (selectedNode
          ? {
              x: selectedNode.position.x + 380,
              y: selectedNode.position.y + 30
            }
          : {
              x: 90 + (state.nodes.length % 3) * 40,
              y: 80 + (state.nodes.length % 4) * 50
            });

      const newNode: ThreatNode = {
        id: nodeId,
        type: "evidenceNode",
        draggable: true,
        position: nextPosition,
        data: createNodePayload(state.nodes.length + 1)
      };

      const newEdges = selectedNode
        ? [
            ...state.edges,
            {
              id: `edge-${crypto.randomUUID()}`,
              source: selectedNode.id,
              target: nodeId,
              type: "straight",
              data: {
                relation: "enables" as EdgeRelation,
                confidence: 0.5
              }
            }
          ]
        : state.edges;

      return {
        nodes: [...state.nodes, newNode],
        edges: newEdges,
        selectedNodeId: nodeId
      };
    });
  },

  deleteNode: async (nodeId) => {
    const state = get();
    const targetNode = state.nodes.find((node) => node.id === nodeId);
    if (!targetNode) {
      return;
    }

    const imageIds = targetNode.data.payload.evidenceImageIds;

    if (imageIds.length > 0) {
      const confirmed = globalThis.confirm(
        `This will permanently delete ${imageIds.length} evidence file(s) from disk. Continue?`
      );
      if (!confirmed) {
        return;
      }

      for (const imgId of imageIds) {
        const meta = state.evidence[imgId];
        if (meta?.storagePath) {
          try {
            await deleteEvidenceFile(meta.storagePath);
          } catch (err) {
            console.warn("[deleteNode] failed to delete evidence file:", err);
          }
        }
      }
    }

    const removedImageIds = new Set(imageIds);
    const removedPreviewSources = new Set(
      imageIds
        .map((imgId) => state.evidencePreviewData[imgId])
        .filter((src): src is string => Boolean(src))
    );

    set((prev) => {
      const remainingNodes = prev.nodes.filter((node) => node.id !== nodeId);
      const remainingEdges = prev.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      );
      const remainingEvidence = Object.fromEntries(
        Object.entries(prev.evidence).filter(([id]) => !removedImageIds.has(id))
      );
      const remainingPreviewData = Object.fromEntries(
        Object.entries(prev.evidencePreviewData).filter(([id]) => !removedImageIds.has(id))
      );

      const nextSelectedNodeId =
        prev.selectedNodeId === nodeId ? remainingNodes[0]?.id : prev.selectedNodeId;
      const shouldClosePreview =
        Boolean(prev.openedImagePreviewSrc) &&
        removedPreviewSources.has(prev.openedImagePreviewSrc as string);

      return {
        nodes: remainingNodes,
        edges: remainingEdges,
        evidence: remainingEvidence,
        evidencePreviewData: remainingPreviewData,
        selectedNodeId: nextSelectedNodeId,
        activeSearchNodeId:
          prev.activeSearchNodeId === nodeId ? undefined : prev.activeSearchNodeId,
        openedImagePreviewSrc: shouldClosePreview ? undefined : prev.openedImagePreviewSrc,
        openedImagePreviewMimeType:
          shouldClosePreview ? undefined : prev.openedImagePreviewMimeType
      };
    });

    get().enqueueToast("Node and evidence files deleted.");
  },

  deleteSelectedNode: () => {
    const selectedNodeId = get().selectedNodeId;
    if (!selectedNodeId) {
      return;
    }

    void get().deleteNode(selectedNodeId);
  },

  setSelectedNodeId: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  setNodeMode: (nodeId, mode) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          draggable: mode !== "edit",
          data: {
            ...node.data,
            mode,
            updatedAt: now()
          }
        };
      })
    }));
  },

  updateNodeTextFields: (nodeId, updates) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        const existingSnippet = node.data.payload.snippet ?? {
          language: "text",
          content: ""
        };

        return {
          ...node,
          data: {
            ...node.data,
            title: updates.title ?? node.data.title,
            updatedAt: now(),
            payload: {
              ...node.data.payload,
              markdown: updates.markdown ?? node.data.payload.markdown,
              tags: updates.tags ?? node.data.payload.tags,
              ttps: updates.ttps ?? node.data.payload.ttps,
              iocs: updates.iocs ?? node.data.payload.iocs,
              severity: updates.severity ?? node.data.payload.severity,
              confidence: updates.confidence ?? node.data.payload.confidence,
              behavior: updates.behavior !== undefined ? updates.behavior : node.data.payload.behavior,
              observedAt: updates.observedAt !== undefined ? updates.observedAt : node.data.payload.observedAt,
              snippet: {
                language: updates.snippetLanguage ?? existingSnippet.language,
                content: updates.snippetContent ?? existingSnippet.content
              }
            }
          }
        };
      })
    }));
  },

  attachEvidenceToNode: ({ nodeId, originalFileName, mimeType, storagePath, previewSrc }) => {
    set((state) => {
      const evidenceId = crypto.randomUUID();
      const evidenceMeta: EvidenceImageMeta = {
        id: evidenceId,
        fileName: originalFileName,
        mimeType,
        storagePath,
        createdAt: now()
      };

      return {
        evidence: {
          ...state.evidence,
          [evidenceId]: evidenceMeta
        },
        evidencePreviewData: {
          ...state.evidencePreviewData,
          [evidenceId]: previewSrc
        },
        error: undefined,
        nodes: state.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              updatedAt: now(),
              payload: {
                ...node.data.payload,
                evidenceImageIds: [...node.data.payload.evidenceImageIds, evidenceId]
              }
            }
          };
        })
      };
    });
  },

  removeEvidenceFromNode: async ({ nodeId, imageId }) => {
    const state = get();
    const meta = state.evidence[imageId];

    if (meta?.storagePath) {
      const confirmed = globalThis.confirm("Delete this evidence file from disk?");
      if (!confirmed) {
        return;
      }

      try {
        await deleteEvidenceFile(meta.storagePath);
      } catch (err) {
        console.warn("[removeEvidence] failed to delete from disk:", err);
      }
    }

    set((prev) => {
      const remainingEvidence = Object.fromEntries(
        Object.entries(prev.evidence).filter(([id]) => id !== imageId)
      );
      const remainingPreviews = Object.fromEntries(
        Object.entries(prev.evidencePreviewData).filter(([id]) => id !== imageId)
      );

      return {
        evidence: remainingEvidence,
        evidencePreviewData: remainingPreviews,
        nodes: prev.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              updatedAt: now(),
              payload: {
                ...node.data.payload,
                evidenceImageIds: node.data.payload.evidenceImageIds.filter((id) => id !== imageId)
              }
            }
          };
        })
      };
    });

    get().enqueueToast("Evidence file deleted.");
  },

  openImagePreview: (src, mimeType) => {
    set({ openedImagePreviewSrc: src, openedImagePreviewMimeType: mimeType });
  },

  closeImagePreview: () => {
    set({ openedImagePreviewSrc: undefined, openedImagePreviewMimeType: undefined });
  },

  setSearchTerm: (value) => {
    set({ searchTerm: value });
  },

  setActiveSearchNodeId: (nodeId) => {
    set({ activeSearchNodeId: nodeId });
  },

  enqueueToast: (text) => {
    const toastId = crypto.randomUUID();

    set((state) => ({
      toasts: [...state.toasts, { id: toastId, text }]
    }));

    globalThis.setTimeout(() => {
      get().dismissToast(toastId);
    }, 3600);
  },

  dismissToast: (toastId) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId)
    }));
  },

  setDragOverCanvas: (value) => {
    set({ isDragOverCanvas: value });
  },

  setInvestigationId: (id) => {
    set({ investigationId: id.trim() || "demo-investigation" });
  },

  saveWorkspace: async () => {
    const state = get();
    const shouldAskPath = !state.workspacePath;
    console.debug("[save] saveWorkspace called, workspacePath=%s projectDir=%s shouldAskPath=%s", state.workspacePath ?? "undefined", state.projectDir ?? "undefined", shouldAskPath);
    set({ isBusy: true, error: undefined });

    try {
      const workspace = buildWorkspaceDocument(state);
      console.debug("[save] nodes=%d, edges=%d, evidence=%d", workspace.nodes.length, workspace.edges.length, Object.keys(workspace.evidence).length);
      const result = await saveProject(workspace, state.workspacePath ?? state.projectDir, shouldAskPath);
      console.debug("[save] success -> projectDir=%s workspacePath=%s", result.projectDir, result.workspacePath);

      set({ isBusy: false, projectDir: result.projectDir, workspacePath: result.workspacePath });
      get().enqueueToast(`Project saved: ${result.workspacePath}`);
    } catch (error) {
      console.debug("[save] error: %o", error);
      if (isDialogCancellation(error)) {
        set({ isBusy: false, error: undefined });
        return;
      }

      set({
        isBusy: false,
        error: error instanceof Error ? error.message : "Failed to save project"
      });
    }
  },

  saveWorkspaceAs: async () => {
    const state = get();
    console.debug("[save] saveWorkspaceAs called, projectDir=%s", state.projectDir ?? "undefined");
    set({ isBusy: true, error: undefined });

    try {
      const workspace = buildWorkspaceDocument(state);
      console.debug("[save] askPath=true, nodes=%d, edges=%d, evidence=%d", workspace.nodes.length, workspace.edges.length, Object.keys(workspace.evidence).length);
      const result = await saveProject(workspace, state.projectDir, true);
      console.debug("[save] success -> projectDir=%s workspacePath=%s", result.projectDir, result.workspacePath);

      set({ isBusy: false, projectDir: result.projectDir, workspacePath: result.workspacePath });
      get().enqueueToast(`Project saved as: ${result.workspacePath}`);
    } catch (error) {
      console.debug("[save] error: %o", error);
      if (isDialogCancellation(error)) {
        set({ isBusy: false, error: undefined });
        return;
      }

      set({
        isBusy: false,
        error: error instanceof Error ? error.message : "Failed to save project"
      });
    }
  },

  loadProjectFromDialog: async () => {
    set({ isBusy: true, error: undefined });

    try {
      const result = await loadProject();
      const workspace = normalizeWorkspace(result.workspace);

      set({
        investigationId: workspace.meta.investigationId,
        projectDir: result.projectDir,
        workspacePath: result.workspacePath,
        nodes: workspace.nodes,
        edges: workspace.edges,
        evidence: workspace.evidence,
        evidencePreviewData: buildEvidencePreviews(workspace.evidence),
        openedImagePreviewSrc: undefined,
        openedImagePreviewMimeType: undefined,
        searchTerm: "",
        activeSearchNodeId: undefined,
        selectedNodeId: workspace.nodes[0]?.id,
        isBusy: false
      });
    } catch (error) {
      if (isDialogCancellation(error)) {
        set({ isBusy: false, error: undefined });
        return;
      }

      set({
        isBusy: false,
        error: error instanceof Error ? error.message : "Failed to load project"
      });
    }
  }
}));
