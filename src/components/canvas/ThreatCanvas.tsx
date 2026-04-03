import {
  Background,
  ConnectionLineType,
  Panel,
  ReactFlow,
  type DefaultEdgeOptions,
  useReactFlow,
  useViewport
} from "@xyflow/react";
import { ChangeEvent, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTauriFileDrop } from "../../hooks/useTauriFileDrop";
import { useWorkspaceStore } from "../../store";
import type { ThreatEdge, ThreatNode } from "../../types/workspace";
import { EvidenceNode } from "../nodes/EvidenceNode";

const nodeTypes = {
  intelNode: EvidenceNode,
  evidenceNode: EvidenceNode
};

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2;

interface CanvasContextMenuState {
  screenX: number;
  screenY: number;
  type: "pane" | "node" | "edge";
  flowX?: number;
  flowY?: number;
  nodeId?: string;
  edgeId?: string;
}

const ZoomSliderControl = () => {
  const { zoom } = useViewport();
  const { zoomTo } = useReactFlow<ThreatNode, ThreatEdge>();

  const onZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextZoom = Number(event.target.value);
    void zoomTo(nextZoom, { duration: 100 });
  };

  return (
    <Panel position="bottom-center" className="canvas-zoom-bar">
      <label htmlFor="canvas-zoom-slider">Zoom</label>
      <input
        id="canvas-zoom-slider"
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={onZoomChange}
        aria-label="Canvas zoom"
      />
      <output htmlFor="canvas-zoom-slider">{Math.round(zoom * 100)}%</output>
    </Panel>
  );
};

export const ThreatCanvas = () => {
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useWorkspaceStore((state) => state.nodes);
  const edges = useWorkspaceStore((state) => state.edges);
  const isDragOverCanvas = useWorkspaceStore((state) => state.isDragOverCanvas);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const deleteEdge = useWorkspaceStore((state) => state.deleteEdge);
  const onNodesChange = useWorkspaceStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkspaceStore((state) => state.onEdgesChange);
  const onConnect = useWorkspaceStore((state) => state.onConnect);
  const setSelectedNodeId = useWorkspaceStore((state) => state.setSelectedNodeId);
  const reactFlowInstance = useReactFlow<ThreatNode, ThreatEdge>();
  const { screenToFlowPosition } = reactFlowInstance;

  useTauriFileDrop(reactFlowInstance, containerRef);

  const onPaneContextMenu = (event: globalThis.MouseEvent | ReactMouseEvent<Element>) => {
    event.preventDefault();
    setSelectedNodeId(undefined);

    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    setContextMenu({
      screenX: event.clientX,
      screenY: event.clientY,
      type: "pane",
      flowX: flowPosition.x,
      flowY: flowPosition.y
    });
  };

  const onNodeContextMenu = (
    event: globalThis.MouseEvent | ReactMouseEvent<Element>,
    node: ThreatNode
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setContextMenu({
      screenX: event.clientX,
      screenY: event.clientY,
      type: "node",
      nodeId: node.id
    });
  };

  const onEdgeContextMenu = (
    event: globalThis.MouseEvent | ReactMouseEvent<Element>,
    edge: ThreatEdge
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      screenX: event.clientX,
      screenY: event.clientY,
      type: "edge",
      edgeId: edge.id
    });
  };

  const onAddNodeFromContext = () => {
    if (!contextMenu || contextMenu.type !== "pane") {
      return;
    }

    addNode({ x: contextMenu.flowX ?? 0, y: contextMenu.flowY ?? 0 });
    setContextMenu(null);
  };

  const onDeleteNodeFromContext = () => {
    if (!contextMenu || contextMenu.type !== "node" || !contextMenu.nodeId) {
      return;
    }

    deleteNode(contextMenu.nodeId);
    setContextMenu(null);
  };

  const onDeleteEdgeFromContext = () => {
    if (!contextMenu || contextMenu.type !== "edge" || !contextMenu.edgeId) {
      return;
    }

    deleteEdge(contextMenu.edgeId);
    setContextMenu(null);
  };

  const defaultEdgeOptions = useMemo<DefaultEdgeOptions>(
    () => ({
      type: "straight",
      animated: false,
      style: {
        strokeWidth: 2,
        stroke: "#ffffff",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    }),
    []
  );

  return (
    <div ref={containerRef} className={`canvas-container ${isDragOverCanvas ? "drag-over" : ""}`}>
    <ReactFlow<ThreatNode, ThreatEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => {
        setSelectedNodeId(node.id);
        setContextMenu(null);
      }}
      onPaneClick={() => {
        setSelectedNodeId(undefined);
        setContextMenu(null);
      }}
      onPaneContextMenu={onPaneContextMenu}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeContextMenu={onEdgeContextMenu}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      panOnScroll
      zoomOnPinch
      zoomOnScroll
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineStyle={{
        stroke: "#ffffff",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }}
      connectionLineType={ConnectionLineType.Straight}
      onlyRenderVisibleElements
    >
      <Background gap={24} size={1} color="rgba(255, 255, 255, 0.22)" />
      <ZoomSliderControl />
      {contextMenu ? (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {contextMenu.type === "pane" ? (
            <button type="button" onClick={onAddNodeFromContext}>
              Anadir nodo
            </button>
          ) : contextMenu.type === "node" ? (
            <button type="button" onClick={onDeleteNodeFromContext}>
              Borrar nodo
            </button>
          ) : (
            <button type="button" onClick={onDeleteEdgeFromContext}>
              Borrar enlace
            </button>
          )}
        </div>
      ) : null}
    </ReactFlow>
    </div>
  );
};
