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
import { loadProject, saveProject, toAssetUrl } from "../lib/tauri";
import type {
  EvidenceImageMeta,
  NodeMode,
  Severity,
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
  snippetLanguage?: string;
  snippetContent?: string;
  severity?: Severity;
}

interface WorkspaceState {
  nodes: ThreatNode[];
  edges: ThreatEdge[];
  evidence: Record<string, EvidenceImageMeta>;
  evidencePreviewData: Record<string, string>;
  selectedNodeId?: string;
  investigationId: string;
  projectDir?: string;
  isBusy: boolean;
  error?: string;
  toasts: ToastMessage[];
  onNodesChange: (changes: NodeChange<ThreatNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ThreatEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (position?: XYPosition) => void;
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
  }) => void;
  enqueueToast: (text: string) => void;
  dismissToast: (toastId: string) => void;
  setInvestigationId: (id: string) => void;
  saveWorkspace: () => Promise<void>;
  saveWorkspaceAs: () => Promise<void>;
  loadProjectFromDialog: () => Promise<void>;
}

const now = () => new Date().toISOString();

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
    evidenceImageIds: [],
    tags: ["new"],
    severity: "medium" as const
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
            tags: ["phishing", "initial-access"],
            severity: "high"
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

  return {
    ...node,
    type: normalizedType,
    draggable: mode !== "edit",
    data: {
      ...node.data,
      mode
    }
  };
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
    edges: Array.isArray(workspace.edges) ? (workspace.edges as ThreatEdge[]) : [],
    evidence
  };
};

const demo = createDemoWorkspace();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  investigationId: demo.meta.investigationId,
  projectDir: undefined,
  nodes: demo.nodes,
  edges: demo.edges,
  evidence: demo.evidence,
  evidencePreviewData: {},
  selectedNodeId: demo.nodes[0]?.id,
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
    set((state) => ({
      edges: addEdge<ThreatEdge>(
        {
          ...connection,
          id: crypto.randomUUID(),
          type: "straight",
          data: {
            relation: "related",
            confidence: 0.65
          }
        },
        state.edges
      ) as ThreatEdge[]
    }));
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
                relation: "expands",
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
              severity: updates.severity ?? node.data.payload.severity,
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

  removeEvidenceFromNode: ({ nodeId, imageId }) => {
    set((state) => {
      const remainingEvidence = Object.fromEntries(
        Object.entries(state.evidence).filter(([id]) => id !== imageId)
      );
      const remainingPreviews = Object.fromEntries(
        Object.entries(state.evidencePreviewData).filter(([id]) => id !== imageId)
      );

      return {
        evidence: remainingEvidence,
        evidencePreviewData: remainingPreviews,
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
                evidenceImageIds: node.data.payload.evidenceImageIds.filter((id) => id !== imageId)
              }
            }
          };
        })
      };
    });
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

  setInvestigationId: (id) => {
    set({ investigationId: id.trim() || "demo-investigation" });
  },

  saveWorkspace: async () => {
    const state = get();
    set({ isBusy: true, error: undefined });

    try {
      const workspace = buildWorkspaceDocument(state);
      const shouldAskPath = !state.projectDir;
      const result = await saveProject(workspace, state.projectDir, shouldAskPath);

      set({ isBusy: false, projectDir: result.projectDir });
      get().enqueueToast(`Project saved: ${result.workspacePath}`);
    } catch (error) {
      set({
        isBusy: false,
        error: error instanceof Error ? error.message : "Failed to save project"
      });
    }
  },

  saveWorkspaceAs: async () => {
    const state = get();
    set({ isBusy: true, error: undefined });

    try {
      const workspace = buildWorkspaceDocument(state);
      const result = await saveProject(workspace, state.projectDir, true);

      set({ isBusy: false, projectDir: result.projectDir });
      get().enqueueToast(`Project saved as: ${result.workspacePath}`);
    } catch (error) {
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
        nodes: workspace.nodes,
        edges: workspace.edges,
        evidence: workspace.evidence,
        evidencePreviewData: buildEvidencePreviews(workspace.evidence),
        selectedNodeId: workspace.nodes[0]?.id,
        isBusy: false
      });
    } catch (error) {
      set({
        isBusy: false,
        error: error instanceof Error ? error.message : "Failed to load project"
      });
    }
  }
}));
