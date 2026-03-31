import {
  Background,
  ConnectionLineType,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  useViewport
} from "@xyflow/react";
import { ChangeEvent, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useWorkspaceStore } from "../../store";
import type { ThreatEdge, ThreatNode } from "../../types/workspace";
import { EvidenceNode } from "../nodes/EvidenceNode";
import { CustomMiniMapNode } from "./MiniMapNode";

const nodeTypes = {
  intelNode: EvidenceNode,
  evidenceNode: EvidenceNode
};

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2;

interface CanvasContextMenuState {
  screenX: number;
  screenY: number;
  flowX: number;
  flowY: number;
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
  const nodes = useWorkspaceStore((state) => state.nodes);
  const edges = useWorkspaceStore((state) => state.edges);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const onNodesChange = useWorkspaceStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkspaceStore((state) => state.onEdgesChange);
  const onConnect = useWorkspaceStore((state) => state.onConnect);
  const setSelectedNodeId = useWorkspaceStore((state) => state.setSelectedNodeId);
  const { screenToFlowPosition } = useReactFlow<ThreatNode, ThreatEdge>();

  const onPaneContextMenu = (event: globalThis.MouseEvent | ReactMouseEvent<Element>) => {
    event.preventDefault();
    setSelectedNodeId(undefined);

    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    setContextMenu({
      screenX: event.clientX,
      screenY: event.clientY,
      flowX: flowPosition.x,
      flowY: flowPosition.y
    });
  };

  const onAddNodeFromContext = () => {
    if (!contextMenu) {
      return;
    }

    addNode({ x: contextMenu.flowX, y: contextMenu.flowY });
    setContextMenu(null);
  };

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "straight",
      animated: false,
      style: {
        strokeWidth: 1.5,
        stroke: "rgba(255, 255, 255, 0.78)"
      }
    }),
    []
  );

  return (
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
      panOnScroll
      zoomOnPinch
      zoomOnScroll
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.Straight}
      onlyRenderVisibleElements={false}
    >
      <Background gap={24} size={1} color="rgba(255, 255, 255, 0.22)" />
      <MiniMap
        position="bottom-right"
        className="canvas-minimap"
        bgColor="#404040"
        maskColor="rgba(255, 255, 255, 0.14)"
        maskStrokeColor="rgba(255, 255, 255, 0.72)"
        maskStrokeWidth={1}
        offsetScale={2}
        nodeComponent={CustomMiniMapNode}
        pannable
        zoomable
      />
      <ZoomSliderControl />
      {contextMenu ? (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={onAddNodeFromContext}>
            Anadir nodo
          </button>
        </div>
      ) : null}
    </ReactFlow>
  );
};
