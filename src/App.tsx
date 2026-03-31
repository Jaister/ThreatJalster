import { ChangeEvent, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { ThreatCanvas } from "./components/canvas/ThreatCanvas";
import { ToastManager } from "./components/ToastManager";
import { useWorkspaceStore } from "./store";

type AppTab = "canvas" | "instructions";

export const App = () => {
  const [activeTab, setActiveTab] = useState<AppTab>("canvas");
  const [inputId, setInputId] = useState("demo-investigation");
  const setInvestigationId = useWorkspaceStore((state) => state.setInvestigationId);
  const saveCurrentWorkspace = useWorkspaceStore((state) => state.saveCurrentWorkspace);
  const loadProjectFromDialog = useWorkspaceStore((state) => state.loadProjectFromDialog);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const isBusy = useWorkspaceStore((state) => state.isBusy);
  const error = useWorkspaceStore((state) => state.error);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputId(value);
    setInvestigationId(value);
  };

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
          <button type="button" disabled={isBusy} onClick={() => saveCurrentWorkspace()}>
            Save Project
          </button>
          <button type="button" disabled={isBusy} onClick={() => addNode()}>
            Add Node
          </button>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <nav className="app-tabs" aria-label="Workspace tabs">
        <button
          type="button"
          className={activeTab === "canvas" ? "is-active" : ""}
          onClick={() => setActiveTab("canvas")}
        >
          Canvas
        </button>
        <button
          type="button"
          className={activeTab === "instructions" ? "is-active" : ""}
          onClick={() => setActiveTab("instructions")}
        >
          Instructions
        </button>
      </nav>

      <main className="canvas-wrap">
        {activeTab === "canvas" ? (
          <>
            <ReactFlowProvider>
              <ThreatCanvas />
            </ReactFlowProvider>
            <ToastManager />
          </>
        ) : (
          <section className="instructions-panel">
            <h2>Basic Instructions</h2>
            <ol>
              <li>Set an investigation ID that will be stored in project metadata.</li>
              <li>Use Open Project to pick a workspace.json file from disk.</li>
              <li>Use Add Node to create a new evidence card on the canvas.</li>
              <li>Double click a node to switch between view mode and edit mode.</li>
              <li>Drag image files onto a node or focus it and press Ctrl+V to paste images.</li>
              <li>Use the x button on each thumbnail to remove attached evidence.</li>
              <li>Drag from one node handle to another to create a straight relationship edge.</li>
              <li>Use Save Project to persist your graph, notes and evidence references.</li>
            </ol>
          </section>
        )}
      </main>
    </div>
  );
};
