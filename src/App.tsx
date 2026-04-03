import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { ImagePreviewWindow } from "./components/ImagePreviewWindow";
import { ThreatCanvas } from "./components/canvas/ThreatCanvas";
import { ToastManager } from "./components/ToastManager";
import { useWorkspaceStore } from "./store";
import type { ThreatNode } from "./types/workspace";

const normalizeText = (value: string): string => value.toLocaleLowerCase();

const getSearchableNodeText = (node: ThreatNode): string => {
  const snippet = node.data.payload.snippet;

  return [
    node.data.title,
    node.data.payload.markdown,
    node.data.payload.tags.join(" "),
    node.data.payload.ttps.join(" "),
    node.data.payload.iocs.join(" "),
    node.data.payload.severity,
    node.data.payload.behavior ?? "",
    snippet?.language ?? "",
    snippet?.content ?? ""
  ].join("\n");
};

export const App = () => {
  const [inputId, setInputId] = useState("demo-investigation");
  const [isFindOpen, setIsFindOpen] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const canvasWrapRef = useRef<HTMLElement>(null);
  const setInvestigationId = useWorkspaceStore((state) => state.setInvestigationId);
  const saveWorkspace = useWorkspaceStore((state) => state.saveWorkspace);
  const saveWorkspaceAs = useWorkspaceStore((state) => state.saveWorkspaceAs);
  const loadProjectFromDialog = useWorkspaceStore((state) => state.loadProjectFromDialog);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const deleteSelectedNode = useWorkspaceStore((state) => state.deleteSelectedNode);
  const nodes = useWorkspaceStore((state) => state.nodes);
  const searchTerm = useWorkspaceStore((state) => state.searchTerm);
  const activeSearchNodeId = useWorkspaceStore((state) => state.activeSearchNodeId);
  const setSelectedNodeId = useWorkspaceStore((state) => state.setSelectedNodeId);
  const selectedNodeId = useWorkspaceStore((state) => state.selectedNodeId);
  const setSearchTerm = useWorkspaceStore((state) => state.setSearchTerm);
  const setActiveSearchNodeId = useWorkspaceStore((state) => state.setActiveSearchNodeId);
  const isBusy = useWorkspaceStore((state) => state.isBusy);
  const error = useWorkspaceStore((state) => state.error);

  const normalizedSearchTerm = normalizeText(searchTerm.trim());

  const matchedNodeIds = useMemo(() => {
    if (!normalizedSearchTerm) {
      return [];
    }

    return nodes
      .filter((node) => normalizeText(getSearchableNodeText(node)).includes(normalizedSearchTerm))
      .map((node) => node.id);
  }, [nodes, normalizedSearchTerm]);

  const activeMatchIndex = useMemo(() => {
    if (!activeSearchNodeId) {
      return -1;
    }

    return matchedNodeIds.indexOf(activeSearchNodeId);
  }, [activeSearchNodeId, matchedNodeIds]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputId(value);
    setInvestigationId(value);
  };

  const onCloseFind = () => {
    setIsFindOpen(false);
    setSearchTerm("");
    setActiveSearchNodeId(undefined);
  };

  const moveSearch = (direction: 1 | -1) => {
    if (matchedNodeIds.length === 0) {
      return;
    }

    const currentIndex =
      activeSearchNodeId !== undefined ? matchedNodeIds.indexOf(activeSearchNodeId) : -1;

    if (currentIndex === -1) {
      setActiveSearchNodeId(matchedNodeIds[0]);
      return;
    }

    const nextIndex =
      (currentIndex + direction + matchedNodeIds.length) % matchedNodeIds.length;
    setActiveSearchNodeId(matchedNodeIds[nextIndex]);
  };

  useEffect(() => {
    if (!normalizedSearchTerm || matchedNodeIds.length === 0) {
      if (activeSearchNodeId) {
        setActiveSearchNodeId(undefined);
      }
      return;
    }

    if (!activeSearchNodeId || !matchedNodeIds.includes(activeSearchNodeId)) {
      setActiveSearchNodeId(matchedNodeIds[0]);
    }
  }, [activeSearchNodeId, matchedNodeIds, normalizedSearchTerm, setActiveSearchNodeId]);

  useEffect(() => {
    if (!activeSearchNodeId) {
      return;
    }

    setSelectedNodeId(activeSearchNodeId);
  }, [activeSearchNodeId, setSelectedNodeId]);

  useEffect(() => {
    if (!isFindOpen) {
      return;
    }

    globalThis.requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, [isFindOpen]);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLocaleLowerCase();

      if (key === "delete") {
        event.preventDefault();
        deleteSelectedNode();
        return;
      }

      if (!isPrimaryModifier || event.altKey) {
        return;
      }

      if (key === "s") {
        event.preventDefault();
        if (isBusy) {
          return;
        }

        if (event.shiftKey) {
          void saveWorkspaceAs();
          return;
        }

        void saveWorkspace();
        return;
      }

      if (key === "f") {
        event.preventDefault();
        setIsFindOpen(true);
      }
    };

    globalThis.window.addEventListener("keydown", onGlobalKeyDown);

    return () => {
      globalThis.window.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, [deleteSelectedNode, isBusy, saveWorkspace, saveWorkspaceAs]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-wrap">
          <h1>ThreatJalster</h1>
          <p>Interactive attack-path workspace for analysts</p>
        </div>

        <div className="actions">
          <input
            aria-label="Investigation ID"
            placeholder="investigation-id"
            value={inputId}
            onChange={onChange}
          />
          <button type="button" disabled={isBusy} onClick={() => loadProjectFromDialog()}>
            Open Project
          </button>
          <button type="button" disabled={isBusy} onClick={() => saveWorkspace()}>
            Guardar
          </button>
          <button type="button" disabled={isBusy} onClick={() => saveWorkspaceAs()}>
            Guardar como
          </button>
          <button type="button" disabled={isBusy} onClick={() => addNode()}>
            Add Node
          </button>
          <button
            type="button"
            disabled={isBusy || !selectedNodeId}
            onClick={() => deleteSelectedNode()}
          >
            Borrar nodo
          </button>
        </div>
      </header>

      {isFindOpen ? (
        <section className="findbar" role="search" aria-label="Buscar en nodos">
          <label htmlFor="find-input">Buscar</label>
          <input
            id="find-input"
            ref={findInputRef}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                moveSearch(event.shiftKey ? -1 : 1);
              }

              if (event.key === "Escape") {
                event.preventDefault();
                onCloseFind();
              }
            }}
            placeholder="Buscar en titulo, markdown, tags y snippets"
            aria-label="Buscar texto"
          />
          <output aria-live="polite" aria-atomic="true">
            {normalizedSearchTerm
              ? `${matchedNodeIds.length === 0 ? 0 : activeMatchIndex + 1}/${matchedNodeIds.length}`
              : "0/0"}
          </output>
          <button
            type="button"
            onClick={() => moveSearch(-1)}
            disabled={matchedNodeIds.length === 0}
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => moveSearch(1)}
            disabled={matchedNodeIds.length === 0}
          >
            Siguiente
          </button>
          <button type="button" onClick={onCloseFind}>
            Cerrar
          </button>
        </section>
      ) : null}

      {error ? <p className="error-banner">{error}</p> : null}

      <main ref={canvasWrapRef} className="canvas-wrap">
        <ReactFlowProvider>
          <ThreatCanvas />
        </ReactFlowProvider>
        <ToastManager />
        <ImagePreviewWindow containerRef={canvasWrapRef} />
      </main>
    </div>
  );
};
