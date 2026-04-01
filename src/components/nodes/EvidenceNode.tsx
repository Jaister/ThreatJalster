import { useMemo, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readClipboardImage, saveEvidenceFile, toAssetUrl } from "../../lib/tauri";
import { useWorkspaceStore } from "../../store";
import type { ThreatNode } from "../../types/workspace";
import styles from "./EvidenceNode.module.css";

const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const SEVERITY_OPTIONS = ["low", "medium", "high", "critical"] as const;

const isImageType = (mimeType: string): boolean => mimeType.startsWith("image/");

const parseTags = (raw: string): string[] =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const getImageFiles = (files: FileList | File[]): File[] =>
  Array.from(files).filter((file) => isImageType(file.type));

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

export const EvidenceNode = ({ id, data, selected }: NodeProps<ThreatNode>) => {
  const [isDropActive, setIsDropActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const evidencePreviewData = useWorkspaceStore((state) => state.evidencePreviewData);
  const isBusy = useWorkspaceStore((state) => state.isBusy);
  const setSelectedNodeId = useWorkspaceStore((state) => state.setSelectedNodeId);
  const setNodeMode = useWorkspaceStore((state) => state.setNodeMode);
  const updateNodeTextFields = useWorkspaceStore((state) => state.updateNodeTextFields);
  const attachEvidenceToNode = useWorkspaceStore((state) => state.attachEvidenceToNode);
  const removeEvidenceFromNode = useWorkspaceStore((state) => state.removeEvidenceFromNode);
  const enqueueToast = useWorkspaceStore((state) => state.enqueueToast);

  const mode = data.mode === "edit" ? "edit" : "view";
  const snippetLanguage = data.payload.snippet?.language ?? "text";
  const snippetContent = data.payload.snippet?.content ?? "";
  const tagsText = data.payload.tags.join(", ");

  const imageUrls = useMemo(
    () =>
      data.payload.evidenceImageIds
        .map((imageId) => ({ imageId, src: evidencePreviewData[imageId] }))
        .filter((image) => Boolean(image.src)),
    [data.payload.evidenceImageIds, evidencePreviewData]
  );

  const attachFiles = async (files: File[]): Promise<void> => {
    console.debug("[evidence:attach] called with %d file(s)", files.length);
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      for (const [index, file] of files.entries()) {
        console.debug("[evidence:attach] file[%d] name=%s type=%s size=%d", index, file.name, file.type, file.size);
        if (!isImageType(file.type)) {
          console.debug("[evidence:attach] skipped (not image type)");
          continue;
        }

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
          mimeType: SUPPORTED_IMAGE_MIME.has(file.type) ? file.type : "image/png",
          storagePath,
          previewSrc
        });

        enqueueToast(`Saved evidence image: ${storagePath}`);
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

  const onSeverityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!SEVERITY_OPTIONS.includes(value as (typeof SEVERITY_OPTIONS)[number])) {
      return;
    }

    updateNodeTextFields(id, {
      severity: value as (typeof SEVERITY_OPTIONS)[number]
    });
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

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    setSelectedNodeId(id);
    const allFiles = Array.from(event.dataTransfer.files);
    console.debug("[evidence:drop] %d file(s): %s", allFiles.length, allFiles.map((f) => `${f.name} (${f.type})`).join(", "));
    void attachFiles(getImageFiles(event.dataTransfer.files));
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDropActive(true);
  };

  const onDragLeave = () => {
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
      className={`${styles.node} ${selected ? styles.nodeSelected : ""}`}
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
      <Handle type="target" position={Position.Left} />

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
            <h4 className={styles.title}>{data.title}</h4>
          )}
          <div className={styles.meta}>Double click to switch mode</div>
        </div>
        <button type="button" className={styles.modeButton} onClick={onToggleMode}>
          {mode === "view" ? "Edit" : "View"}
        </button>
      </header>

      <section className={`${styles.body} ${mode === "edit" ? "nodrag nopan nowheel" : ""}`}>
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
              Severity
              <select
                className={`${styles.selectInput} nodrag`}
                value={data.payload.severity}
                onChange={onSeverityChange}
                aria-label="Node severity"
              >
                {SEVERITY_OPTIONS.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
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
            <article className={styles.markdownView}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.payload.markdown}</ReactMarkdown>
            </article>

            <div className={styles.metaChips}>
              <span className={styles.metaChip}>Severity: {data.payload.severity}</span>
            </div>

            {snippetContent ? (
              <div className={styles.snippetBlock}>
                <div className={styles.snippetMeta}>{snippetLanguage || "text"}</div>
                <pre className={styles.snippetContent}>{snippetContent}</pre>
              </div>
            ) : null}
          </>
        )}

        <div className={`${styles.dropzone} nodrag ${isDropActive ? styles.dropzoneActive : ""}`}>
          {isUploading
            ? "Saving evidence image..."
            : "Drag and drop images here or focus this node and press Ctrl+V"}
        </div>

        {imageUrls.length > 0 ? (
          <div className={styles.imageGrid}>
            {imageUrls.map((image) => (
              <figure key={image.imageId} className={styles.imageCard}>
                <img className={styles.image} src={image.src} alt="Evidence" />
                <button
                  type="button"
                  className={`${styles.removeImageButton} nodrag`}
                  disabled={isBusy || isUploading}
                  onClick={() => void removeEvidenceFromNode({ nodeId: id, imageId: image.imageId })}
                  aria-label="Remove image"
                >
                  x
                </button>
              </figure>
            ))}
          </div>
        ) : null}
      </section>

      <footer className={styles.footer}>
        {data.payload.tags.length > 0 ? data.payload.tags.join(" | ") : "no tags"}
      </footer>

      <Handle type="source" position={Position.Right} />
    </div>
  );
};
