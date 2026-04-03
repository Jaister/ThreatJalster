import { useEffect, useRef } from "react";
import { type ReactFlowInstance } from "@xyflow/react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  copyEvidenceFile,
  extensionFromPath,
  fileNameFromPath,
  isSupportedEvidenceFile,
  mimeFromExtension,
  toAssetUrl
} from "../lib/tauri";
import { useWorkspaceStore } from "../store";
import type { ThreatEdge, ThreatNode } from "../types/workspace";

export const useTauriFileDrop = (
  reactFlowInstance: ReactFlowInstance<ThreatNode, ThreatEdge> | null,
  containerRef: React.RefObject<HTMLElement | null>
) => {
  const pendingPathsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const setupListener = async () => {
      const webview = getCurrentWebview();

      const unlisten = await webview.onDragDropEvent((event) => {
        if (cancelled) return;

        const payload = event.payload;

        if (payload.type === "enter") {
          pendingPathsRef.current = payload.paths;
          useWorkspaceStore.getState().setDragOverCanvas(true);
          console.debug("[fileDrop] enter, %d path(s)", payload.paths.length);
          return;
        }

        if (payload.type === "leave") {
          pendingPathsRef.current = [];
          useWorkspaceStore.getState().setDragOverCanvas(false);
          console.debug("[fileDrop] leave");
          return;
        }

        if (payload.type === "over") {
          return;
        }

        if (payload.type === "drop") {
          useWorkspaceStore.getState().setDragOverCanvas(false);

          const paths = payload.paths.filter(isSupportedEvidenceFile);
          console.debug(
            "[fileDrop] drop, %d total path(s), %d supported",
            payload.paths.length,
            paths.length
          );

          if (paths.length === 0) {
            useWorkspaceStore.getState().enqueueToast(
              "No supported files. Drop images (png, jpg, webp) or PDFs."
            );
            return;
          }

          const position = payload.position;
          void handleDrop(paths, position);
        }
      });

      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;

    setupListener().then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    }).catch((err) => {
      console.warn("[fileDrop] failed to setup listener:", err);
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [reactFlowInstance, containerRef]);

  const handleDrop = async (
    paths: string[],
    position: { x: number; y: number }
  ) => {
    const store = useWorkspaceStore.getState();
    const rf = reactFlowInstance;

    if (!rf) {
      console.warn("[fileDrop] no reactFlowInstance, attaching to selected node");
      return attachToNode(paths, store.selectedNodeId);
    }

    const targetNodeId = hitTestNode(position, rf);

    if (targetNodeId) {
      console.debug("[fileDrop] hit node: %s", targetNodeId);
      return attachToNode(paths, targetNodeId);
    }

    if (store.selectedNodeId) {
      console.debug("[fileDrop] no hit, using selected node: %s", store.selectedNodeId);
      return attachToNode(paths, store.selectedNodeId);
    }

    console.debug("[fileDrop] no hit, no selection, creating new node");
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const dpr = globalThis.window.devicePixelRatio || 1;
    const logicalX = position.x / dpr - (rect?.left ?? 0);
    const logicalY = position.y / dpr - (rect?.top ?? 0);
    const flowPos = rf.screenToFlowPosition({ x: logicalX, y: logicalY });

    store.addNode(flowPos);

    const newState = useWorkspaceStore.getState();
    return attachToNode(paths, newState.selectedNodeId);
  };

  const hitTestNode = (
    physicalPosition: { x: number; y: number },
    rf: ReactFlowInstance<ThreatNode, ThreatEdge>
  ): string | undefined => {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const dpr = globalThis.window.devicePixelRatio || 1;

    const logicalX = physicalPosition.x / dpr - (rect?.left ?? 0);
    const logicalY = physicalPosition.y / dpr - (rect?.top ?? 0);

    const flowPos = rf.screenToFlowPosition({ x: logicalX, y: logicalY });
    console.debug(
      "[fileDrop] hitTest physical=(%d,%d) logical=(%d,%d) flow=(%d,%d)",
      physicalPosition.x, physicalPosition.y,
      logicalX, logicalY,
      flowPos.x, flowPos.y
    );

    const nodes = useWorkspaceStore.getState().nodes;

    for (const node of nodes) {
      const w = node.measured?.width ?? 720;
      const h = node.measured?.height ?? 280;
      const x0 = node.position.x;
      const y0 = node.position.y;

      if (
        flowPos.x >= x0 &&
        flowPos.x <= x0 + w &&
        flowPos.y >= y0 &&
        flowPos.y <= y0 + h
      ) {
        return node.id;
      }
    }

    return undefined;
  };

  const attachToNode = async (
    paths: string[],
    nodeId: string | undefined
  ) => {
    if (!nodeId) {
      console.warn("[fileDrop] no target node to attach files");
      return;
    }

    const store = useWorkspaceStore.getState();
    store.setSelectedNodeId(nodeId);
    store.setNodeMode(nodeId, "edit");

    for (const filePath of paths) {
      try {
        const fileName = fileNameFromPath(filePath);
        const ext = extensionFromPath(filePath);
        const mime = mimeFromExtension(ext);

        console.debug("[fileDrop] copying %s (mime=%s)", fileName, mime);
        const storagePath = await copyEvidenceFile(filePath, fileName);
        const previewSrc = toAssetUrl(storagePath);

        useWorkspaceStore.getState().attachEvidenceToNode({
          nodeId,
          originalFileName: fileName,
          mimeType: mime,
          storagePath,
          previewSrc
        });

        useWorkspaceStore.getState().enqueueToast(`Saved evidence: ${fileName}`);
      } catch (err) {
        console.error("[fileDrop] failed to copy evidence:", err);
        useWorkspaceStore.getState().enqueueToast(
          `Failed to save: ${fileNameFromPath(filePath)}`
        );
      }
    }
  };
};
