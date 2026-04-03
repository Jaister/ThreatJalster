import {
  type CSSProperties,
  Fragment,
  cloneElement,
  isValidElement,
  memo,
  useMemo,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ReactElement,
  type ReactNode,
  type WheelEvent
} from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readClipboardImage, saveEvidenceFile, toAssetUrl } from "../../lib/tauri";
import { useWorkspaceStore } from "../../store";
import type { ThreatBehavior, ThreatNode } from "../../types/workspace";
import styles from "./EvidenceNode.module.css";

const SUPPORTED_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "pdf"]);
const PDF_MIME = "application/pdf";
const SEVERITY_OPTIONS = ["low", "medium", "high", "critical"] as const;
const SEVERITY_OPTION_STYLES: Record<(typeof SEVERITY_OPTIONS)[number], CSSProperties> = {
  low: {
    color: "var(--severity-low)",
    background: "var(--color-surface)"
  },
  medium: {
    color: "var(--severity-medium)",
    background: "var(--color-surface)"
  },
  high: {
    color: "var(--severity-high)",
    background: "var(--color-surface)"
  },
  critical: {
    color: "var(--severity-critical)",
    background: "var(--color-surface)"
  }
};

const BEHAVIOR_OPTIONS: ThreatBehavior[] = [
  "reconnaissance",
  "resource-development",
  "initial-access",
  "execution",
  "persistence",
  "privilege-escalation",
  "defense-evasion",
  "credential-access",
  "discovery",
  "lateral-movement",
  "collection",
  "c2-communication",
  "exfiltration",
  "impact"
];

const isImageType = (mimeType: string): boolean => mimeType.startsWith("image/");

const isSupportedFile = (file: File): boolean => {
  if (isImageType(file.type) || file.type === PDF_MIME) {
    return true;
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_FILE_EXTENSIONS.has(ext);
};

const resolveMimeType = (file: File): string => {
  if (file.type && file.type.length > 0) {
    return file.type;
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return PDF_MIME;
  return "application/octet-stream";
};

const parseTags = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const getSupportedFiles = (files: FileList | File[]): File[] =>
  Array.from(files).filter((file) => isSupportedFile(file));

const getPastedImageFiles = (event: ClipboardEvent<HTMLElement>): File[] => {
  const itemFiles: File[] = [];

  for (const item of Array.from(event.clipboardData.items)) {
    console.debug("[evidence:paste] item kind=%s type=%s", item.kind, item.type);
    if (item.kind !== "file" || !isImageType(item.type)) {
      continue;
    }

    const file = item.getAsFile();
    if (file && isImageType(file.type)) {
      itemFiles.push(file);
    }
  }

  console.debug("[evidence:paste] matched %d item-files, fallback files=%d", itemFiles.length, event.clipboardData.files.length);

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(event.clipboardData.files).filter((file) => isImageType(file.type));
};

const readClipboardApiImages = async (): Promise<File[]> => {
  console.debug("[evidence:clipboardApi] navigator.clipboard.read available=%s", Boolean(navigator.clipboard?.read));
  if (!navigator.clipboard?.read) {
    return [];
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    console.debug("[evidence:clipboardApi] got %d clipboard items", clipboardItems.length);
    const files: File[] = [];

    for (const [index, clipboardItem] of clipboardItems.entries()) {
      console.debug("[evidence:clipboardApi] item[%d] types=%s", index, clipboardItem.types.join(", "));
      for (const mimeType of clipboardItem.types) {
        if (!isImageType(mimeType)) {
          continue;
        }

        const blob = await clipboardItem.getType(mimeType);
        console.debug("[evidence:clipboardApi] got blob type=%s size=%d", mimeType, blob.size);
        files.push(new File([blob], `clipboard-${Date.now()}-${index}.${mimeToExtension(mimeType)}`, { type: mimeType }));
      }
    }

    return files;
  } catch (err) {
    console.debug("[evidence:clipboardApi] error: %o", err);
    return [];
  }
};

const mimeToExtension = (mimeType: string): string => {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "bin";
};

const resolveUploadName = (file: File, index: number): string => {
  const trimmed = file.name.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  return `clipboard-${Date.now()}-${index}.${mimeToExtension(file.type)}`;
};

const highlightText = (text: string, query: string, isActive: boolean): ReactNode => {
  if (!query) {
    return text;
  }

  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const parts: ReactNode[] = [];

  let cursor = 0;
  let token = 0;

  while (cursor < text.length) {
    const foundAt = lowerText.indexOf(lowerQuery, cursor);
    if (foundAt === -1) {
      parts.push(text.slice(cursor));
      break;
    }

    if (foundAt > cursor) {
      parts.push(text.slice(cursor, foundAt));
    }

    const hit = text.slice(foundAt, foundAt + query.length);
    parts.push(
      <mark
        key={`hit-${foundAt}-${token}`}
        className={`${styles.searchHighlight} ${isActive ? styles.searchHighlightActive : ""}`}
      >
        {hit}
      </mark>
    );

    token += 1;
    cursor = foundAt + query.length;
  }

  if (parts.length === 0) {
    return text;
  }

  return parts.map((part, index) => <Fragment key={`part-${index}`}>{part}</Fragment>);
};

const highlightChildren = (node: ReactNode, query: string, isActive: boolean): ReactNode => {
  if (!query) {
    return node;
  }

  if (typeof node === "string") {
    return highlightText(node, query, isActive);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={`child-${index}`}>{highlightChildren(child, query, isActive)}</Fragment>
    ));
  }

  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return cloneElement(
      element,
      { ...element.props },
      highlightChildren(element.props.children, query, isActive)
    );
  }

  return node;
};

export const EvidenceNode = memo(({ id, data, selected, width, height }: NodeProps<ThreatNode>) => {
  const [isDropActive, setIsDropActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const evidencePreviewData = useWorkspaceStore((state) => state.evidencePreviewData);
  const searchTerm = useWorkspaceStore((state) => state.searchTerm);
  const activeSearchNodeId = useWorkspaceStore((state) => state.activeSearchNodeId);
  const isBusy = useWorkspaceStore((state) => state.isBusy);
  const setSelectedNodeId = useWorkspaceStore((state) => state.setSelectedNodeId);
  const setNodeMode = useWorkspaceStore((state) => state.setNodeMode);
  const updateNodeTextFields = useWorkspaceStore((state) => state.updateNodeTextFields);
  const attachEvidenceToNode = useWorkspaceStore((state) => state.attachEvidenceToNode);
  const removeEvidenceFromNode = useWorkspaceStore((state) => state.removeEvidenceFromNode);
  const openImagePreview = useWorkspaceStore((state) => state.openImagePreview);
  const enqueueToast = useWorkspaceStore((state) => state.enqueueToast);

  const mode = data.mode === "edit" ? "edit" : "view";
  const isEditMode = mode === "edit";
  const snippetLanguage = data.payload.snippet?.language ?? "text";
  const snippetContent = data.payload.snippet?.content ?? "";
  const tagsText = data.payload.tags.join(", ");
  const ttpsText = data.payload.ttps.join(", ");
  const iocsText = data.payload.iocs.join(", ");
  const confidencePercent = Math.round((data.payload.confidence ?? 0.5) * 100);
  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase();

  const nodeSearchContent = useMemo(
    () =>
      [
        data.title,
        data.payload.markdown,
        data.payload.tags.join(" "),
        data.payload.ttps.join(" "),
        data.payload.iocs.join(" "),
        data.payload.severity,
        data.payload.behavior ?? "",
        snippetLanguage,
        snippetContent
      ].join("\n"),
    [data.payload.markdown, data.payload.severity, data.payload.tags, data.payload.ttps, data.payload.iocs, data.payload.behavior, data.title, snippetContent, snippetLanguage]
  );

  const nodeMatchesSearch =
    normalizedSearchTerm.length > 0 &&
    nodeSearchContent.toLocaleLowerCase().includes(normalizedSearchTerm);
  const isActiveSearchResult = nodeMatchesSearch && activeSearchNodeId === id;

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: { children?: ReactNode }) => (
        <p>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</p>
      ),
      h1: ({ children }: { children?: ReactNode }) => (
        <h1>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</h1>
      ),
      h2: ({ children }: { children?: ReactNode }) => (
        <h2>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</h2>
      ),
      h3: ({ children }: { children?: ReactNode }) => (
        <h3>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</h3>
      ),
      h4: ({ children }: { children?: ReactNode }) => (
        <h4>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</h4>
      ),
      li: ({ children }: { children?: ReactNode }) => (
        <li>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</li>
      ),
      strong: ({ children }: { children?: ReactNode }) => (
        <strong>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</strong>
      ),
      em: ({ children }: { children?: ReactNode }) => (
        <em>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</em>
      ),
      code: ({ children }: { children?: ReactNode }) => (
        <code>{highlightChildren(children, normalizedSearchTerm, isActiveSearchResult)}</code>
      )
    }),
    [isActiveSearchResult, normalizedSearchTerm]
  );

  const evidence = useWorkspaceStore((state) => state.evidence);

  const evidenceItems = useMemo(
    () =>
      data.payload.evidenceImageIds
        .map((imageId) => ({
          imageId,
          src: evidencePreviewData[imageId],
          meta: evidence[imageId]
        }))
        .filter((item) => Boolean(item.src)),
    [data.payload.evidenceImageIds, evidencePreviewData, evidence]
  );

  const nodeStyle = {
    "--node-width": typeof width === "number" ? `${Math.round(width)}px` : "720px",
    "--node-height": typeof height === "number" ? `${Math.round(height)}px` : "auto"
  } as CSSProperties;

  const severityClassName =
    data.payload.severity === "low"
      ? styles.severityLow
      : data.payload.severity === "medium"
        ? styles.severityMedium
        : data.payload.severity === "high"
          ? styles.severityHigh
          : styles.severityCritical;

  const attachFiles = async (files: File[]): Promise<void> => {
    console.debug("[evidence:attach] called with %d file(s)", files.length);
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      for (const [index, file] of files.entries()) {
        const mime = resolveMimeType(file);
        console.debug("[evidence:attach] file[%d] name=%s type=%s resolved=%s size=%d", index, file.name, file.type, mime, file.size);

        const originalName = resolveUploadName(file, index);
        const bytes = new Uint8Array(await file.arrayBuffer());
        console.debug("[evidence:attach] saving %d bytes as %s", bytes.length, originalName);
        const storagePath = await saveEvidenceFile(bytes, originalName);
        console.debug("[evidence:attach] saved -> storagePath=%s", storagePath);

        const previewSrc = toAssetUrl(storagePath);
        console.debug("[evidence:attach] assetUrl=%s", previewSrc);

        attachEvidenceToNode({
          nodeId: id,
          originalFileName: originalName,
          mimeType: mime,
          storagePath,
          previewSrc
        });

        enqueueToast(`Saved evidence: ${originalName}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const onToggleMode = () => {
    setNodeMode(id, mode === "view" ? "edit" : "view");
  };

  const onEditorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeTextFields(id, { markdown: event.target.value });
  };

  const onTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNodeTextFields(id, { title: event.target.value });
  };

  const onTagsChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNodeTextFields(id, { tags: parseTags(event.target.value) });
  };

  const onTtpsChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNodeTextFields(id, { ttps: parseTags(event.target.value) });
  };

  const onIocsChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNodeTextFields(id, { iocs: parseTags(event.target.value) });
  };

  const onSeverityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!SEVERITY_OPTIONS.includes(value as (typeof SEVERITY_OPTIONS)[number])) {
      return;
    }

    updateNodeTextFields(id, {
      severity: value as (typeof SEVERITY_OPTIONS)[number]
    });
  };

  const onConfidenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNodeTextFields(id, { confidence: Number(event.target.value) / 100 });
  };

  const onBehaviorChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    updateNodeTextFields(id, {
      behavior: (value || undefined) as ThreatBehavior | undefined
    });
  };

  const onObservedAtChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNodeTextFields(id, { observedAt: event.target.value || undefined });
  };

  const onSnippetLanguageChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNodeTextFields(id, { snippetLanguage: event.target.value });
  };

  const onSnippetContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeTextFields(id, { snippetContent: event.target.value });
  };

  const onNodeDoubleClick = () => {
    onToggleMode();
  };

  const onBodyWheel = (event: WheelEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey) {
      return;
    }

    const el = event.currentTarget as HTMLElement;
    if (el.scrollHeight > el.clientHeight) {
      event.stopPropagation();
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropActive(false);

    if (!isEditMode) {
      setNodeMode(id, "edit");
    }

    setSelectedNodeId(id);
    const allFiles = Array.from(event.dataTransfer.files);
    console.debug("[evidence:drop] %d file(s): %s", allFiles.length, allFiles.map((f) => `${f.name} (${f.type}, ext=${f.name.split(".").pop()})`).join(", "));
    const supported = getSupportedFiles(allFiles);
    console.debug("[evidence:drop] %d supported file(s) after filter", supported.length);
    if (supported.length === 0) {
      enqueueToast("No supported files. Drop images (png, jpg, webp) or PDFs.");
      return;
    }
    void attachFiles(supported);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDropActive(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setIsDropActive(false);
  };

  const attachClipboardImageFromRust = async (): Promise<boolean> => {
    console.debug("[evidence:rustClipboard] reading clipboard via Rust backend");
    try {
      const storagePath = await readClipboardImage();
      console.debug("[evidence:rustClipboard] result=%s", storagePath ?? "null (no image)");
      if (!storagePath) {
        return false;
      }

      setSelectedNodeId(id);
      const previewSrc = toAssetUrl(storagePath);
      console.debug("[evidence:rustClipboard] assetUrl=%s", previewSrc);
      attachEvidenceToNode({
        nodeId: id,
        originalFileName: "clipboard.png",
        mimeType: "image/png",
        storagePath,
        previewSrc
      });
      enqueueToast(`Saved clipboard image: ${storagePath}`);
      return true;
    } catch (err) {
      console.debug("[evidence:rustClipboard] error: %o", err);
      return false;
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    if (!isEditMode) {
      return;
    }

    console.debug("[evidence:onPaste] items=%d files=%d", event.clipboardData.items.length, event.clipboardData.files.length);
    const files = getPastedImageFiles(event);
    if (files.length === 0) {
      console.debug("[evidence:onPaste] no direct files, trying clipboard API then Rust fallback");
      void (async () => {
        const clipboardApiFiles = await readClipboardApiImages();
        if (clipboardApiFiles.length > 0) {
          console.debug("[evidence:onPaste] clipboard API returned %d file(s)", clipboardApiFiles.length);
          setSelectedNodeId(id);
          void attachFiles(clipboardApiFiles);
          return;
        }

        console.debug("[evidence:onPaste] clipboard API empty, trying Rust backend");
        await attachClipboardImageFromRust();
      })();

      return;
    }

    console.debug("[evidence:onPaste] got %d direct file(s)", files.length);
    event.preventDefault();
    setSelectedNodeId(id);
    void attachFiles(files);
  };

  return (
    <div
      className={`${styles.node} ${selected ? styles.nodeSelected : ""} ${nodeMatchesSearch ? styles.searchMatch : ""} ${isActiveSearchResult ? styles.searchActiveMatch : ""}`}
      style={nodeStyle}
      onClick={() => setSelectedNodeId(id)}
      onDoubleClick={onNodeDoubleClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
      role="button"
      aria-label="Evidence node"
    >
      {isEditMode ? (
        <NodeResizer
          isVisible={selected}
          minWidth={340}
          minHeight={280}
          handleStyle={{
            width: 10,
            height: 10,
            borderRadius: 2,
            border: "1.5px solid #404040",
            background: "#ffffff"
          }}
          lineStyle={{
            borderColor: "rgba(255, 255, 255, 0.9)",
            borderWidth: 1.5
          }}
        />
      ) : null}

      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="target-top" type="target" position={Position.Top} />

      <header className={styles.header}>
        <div>
          {mode === "edit" ? (
            <input
              className={`${styles.titleInput} nodrag nopan nowheel`}
              value={data.title}
              onChange={onTitleChange}
              onPaste={onPaste}
              placeholder="Node title"
              aria-label="Node title"
            />
          ) : (
            <h4 className={styles.title}>
              {highlightText(data.title, normalizedSearchTerm, isActiveSearchResult)}
            </h4>
          )}
          <div className={styles.meta}>Double click to switch mode</div>
        </div>
        <button type="button" className={styles.modeButton} onClick={onToggleMode}>
          {mode === "view" ? "Edit" : "View"}
        </button>
      </header>

      <section className={`${styles.body} nopan ${mode === "edit" ? "nodrag nowheel" : ""}`} onWheel={onBodyWheel}>
        {mode === "edit" ? (
          <>
            <label className={styles.fieldLabel}>
              Markdown
              <textarea
                className={`${styles.editor} nodrag`}
                value={data.payload.markdown}
                onChange={onEditorChange}
                onPaste={onPaste}
                placeholder="Write markdown notes"
                aria-label="Evidence markdown editor"
              />
            </label>

            <label className={styles.fieldLabel}>
              Tags (comma separated)
              <input
                className={`${styles.textInput} nodrag`}
                value={tagsText}
                onChange={onTagsChange}
                onPaste={onPaste}
                placeholder="phishing, lateral-movement"
                aria-label="Node tags"
              />
            </label>

            <label className={styles.fieldLabel}>
              TTPs — MITRE ATT&CK IDs (comma separated)
              <input
                className={`${styles.textInput} nodrag`}
                value={ttpsText}
                onChange={onTtpsChange}
                onPaste={onPaste}
                placeholder="T1566.001, T1059.001"
                aria-label="MITRE ATT&CK technique IDs"
              />
            </label>

            <label className={styles.fieldLabel}>
              IOCs — Indicators of Compromise (comma separated)
              <input
                className={`${styles.textInput} nodrag`}
                value={iocsText}
                onChange={onIocsChange}
                onPaste={onPaste}
                placeholder="192.168.1.100, evil.com, d41d8cd98f..."
                aria-label="Indicators of Compromise"
              />
            </label>

            <label className={styles.fieldLabel}>
              Severity
              <select
                className={`${styles.selectInput} ${styles.severitySelect} ${severityClassName} nodrag`}
                value={data.payload.severity}
                onChange={onSeverityChange}
                aria-label="Node severity"
              >
                {SEVERITY_OPTIONS.map((severity) => (
                  <option key={severity} value={severity} style={SEVERITY_OPTION_STYLES[severity]}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              Confidence ({confidencePercent}%)
              <input
                className="nodrag"
                type="range"
                min={0}
                max={100}
                step={5}
                value={confidencePercent}
                onChange={onConfidenceChange}
                aria-label="Confidence level"
              />
            </label>

            <label className={styles.fieldLabel}>
              Behavior (ATT&CK Tactic)
              <select
                className={`${styles.selectInput} nodrag`}
                value={data.payload.behavior ?? ""}
                onChange={onBehaviorChange}
                aria-label="Threat behavior"
              >
                <option value="">— none —</option>
                {BEHAVIOR_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              Observed at
              <input
                className={`${styles.textInput} nodrag`}
                type="datetime-local"
                value={data.payload.observedAt ?? ""}
                onChange={onObservedAtChange}
                aria-label="Observation timestamp"
              />
            </label>

            <label className={styles.fieldLabel}>
              Snippet language
              <input
                className={`${styles.textInput} nodrag`}
                value={snippetLanguage}
                onChange={onSnippetLanguageChange}
                onPaste={onPaste}
                placeholder="powershell"
                aria-label="Snippet language"
              />
            </label>

            <label className={styles.fieldLabel}>
              Snippet content
              <textarea
                className={`${styles.editor} ${styles.snippetEditor} nodrag`}
                value={snippetContent}
                onChange={onSnippetContentChange}
                onPaste={onPaste}
                placeholder="Add command or log snippet here"
                aria-label="Snippet content"
              />
            </label>
          </>
        ) : (
          <>
            <article className={`${styles.markdownView} nodrag nopan`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {data.payload.markdown}
              </ReactMarkdown>
            </article>

            <div className={`${styles.metaChips} nodrag nopan`}>
              <span className={`${styles.metaChip} ${styles.severityChip} ${severityClassName}`}>
                Severity:
                <span className={`${styles.severityValue} ${severityClassName}`}>
                  {highlightText(data.payload.severity, normalizedSearchTerm, isActiveSearchResult)}
                </span>
              </span>

              <span className={`${styles.metaChip} ${styles.confidenceChip}`}>
                Confidence: {confidencePercent}%
              </span>

              {data.payload.behavior ? (
                <span className={`${styles.metaChip} ${styles.behaviorChip}`}>
                  {highlightText(data.payload.behavior, normalizedSearchTerm, isActiveSearchResult)}
                </span>
              ) : null}
            </div>

            {data.payload.ttps.length > 0 ? (
              <div className={`${styles.ttpsList} nodrag nopan`}>
                {data.payload.ttps.map((ttp, i) => (
                  <span key={`ttp-${i}`} className={styles.ttpChip}>
                    {highlightText(ttp, normalizedSearchTerm, isActiveSearchResult)}
                  </span>
                ))}
              </div>
            ) : null}

            {data.payload.iocs.length > 0 ? (
              <div className={`${styles.iocsList} nodrag nopan`}>
                {data.payload.iocs.map((ioc, i) => (
                  <span key={`ioc-${i}`} className={styles.iocChip}>
                    {highlightText(ioc, normalizedSearchTerm, isActiveSearchResult)}
                  </span>
                ))}
              </div>
            ) : null}

            {data.payload.observedAt ? (
              <div className={`${styles.observedAt} nodrag nopan`}>
                Observed: {new Date(data.payload.observedAt).toLocaleString()}
              </div>
            ) : null}

            {snippetContent ? (
              <div className={`${styles.snippetBlock} nodrag nopan`}>
                <div className={`${styles.snippetMeta} nodrag nopan`}>
                  {highlightText(snippetLanguage || "text", normalizedSearchTerm, isActiveSearchResult)}
                </div>
                <pre className={`${styles.snippetContent} nodrag nopan`}>
                  {highlightText(snippetContent, normalizedSearchTerm, isActiveSearchResult)}
                </pre>
              </div>
            ) : null}
          </>
        )}

        {isEditMode ? (
          <div className={`${styles.dropzone} nodrag ${isDropActive ? styles.dropzoneActive : ""}`}>
            {isUploading
              ? "Saving evidence..."
              : "Drop images or PDFs here, or Ctrl+V to paste"}
          </div>
        ) : null}

        {evidenceItems.length > 0 ? (
          <div className={styles.imageGrid}>
            {evidenceItems.map((item) => {
              const isPdf = item.meta?.mimeType === PDF_MIME ||
                item.meta?.fileName.toLowerCase().endsWith(".pdf");

              return (
                <figure key={item.imageId} className={styles.imageCard}>
                  <button
                    type="button"
                    className={`${styles.imagePreviewButton} nodrag`}
                    onClick={() => {
                      if (!item.src) return;
                      openImagePreview(item.src, item.meta?.mimeType);
                    }}
                    aria-label={isPdf ? "Open PDF preview" : "Open image preview"}
                  >
                    {isPdf ? (
                      <div className={styles.pdfThumb}>
                        <span className={styles.pdfIcon}>PDF</span>
                        <span className={styles.pdfName}>
                          {item.meta?.fileName ?? "document.pdf"}
                        </span>
                      </div>
                    ) : (
                      <img className={styles.image} src={item.src} alt="Evidence" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`${styles.removeImageButton} nodrag`}
                    disabled={isBusy || isUploading}
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeEvidenceFromNode({ nodeId: id, imageId: item.imageId });
                    }}
                    aria-label="Remove evidence"
                  >
                    x
                  </button>
                </figure>
              );
            })}
          </div>
        ) : null}
      </section>

      <footer className={styles.footer}>
        {highlightText(
          data.payload.tags.length > 0 ? data.payload.tags.join(" | ") : "no tags",
          normalizedSearchTerm,
          isActiveSearchResult
        )}
      </footer>

      <Handle id="source-right" type="source" position={Position.Right} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} />
    </div>
  );
});
