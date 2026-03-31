import { useMemo, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { saveEvidenceFile, toAssetUrl } from "../../lib/tauri";
import { useWorkspaceStore } from "../../store";
import type { ThreatNode } from "../../types/workspace";
import styles from "./EvidenceNode.module.css";

const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

const isImageType = (mimeType: string): boolean => mimeType.startsWith("image/");

const getImageFiles = (files: FileList | File[]): File[] =>
  Array.from(files).filter((file) => isImageType(file.type));

const getPastedImageFiles = (event: ClipboardEvent<HTMLElement>): File[] => {
  const itemFiles: File[] = [];

  for (const item of Array.from(event.clipboardData.items)) {
    if (item.kind !== "file" || !isImageType(item.type)) {
      continue;
    }

    const file = item.getAsFile();
    if (file && isImageType(file.type)) {
      itemFiles.push(file);
    }
  }

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(event.clipboardData.files).filter((file) => isImageType(file.type));
};

const readClipboardApiImages = async (): Promise<File[]> => {
  if (!navigator.clipboard?.read) {
    return [];
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    const files: File[] = [];

    for (const [index, clipboardItem] of clipboardItems.entries()) {
      for (const mimeType of clipboardItem.types) {
        if (!isImageType(mimeType)) {
          continue;
        }

        const blob = await clipboardItem.getType(mimeType);
        files.push(new File([blob], `clipboard-${Date.now()}-${index}.${mimeToExtension(mimeType)}`, { type: mimeType }));
      }
    }

    return files;
  } catch {
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
  const updateNodeMarkdown = useWorkspaceStore((state) => state.updateNodeMarkdown);
  const attachEvidenceToNode = useWorkspaceStore((state) => state.attachEvidenceToNode);
  const removeEvidenceFromNode = useWorkspaceStore((state) => state.removeEvidenceFromNode);
  const enqueueToast = useWorkspaceStore((state) => state.enqueueToast);

  const mode = data.mode === "edit" ? "edit" : "view";

  const imageUrls = useMemo(
    () =>
      data.payload.evidenceImageIds
        .map((imageId) => ({ imageId, src: evidencePreviewData[imageId] }))
        .filter((image) => Boolean(image.src)),
    [data.payload.evidenceImageIds, evidencePreviewData]
  );

  const attachFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      for (const [index, file] of files.entries()) {
        if (!isImageType(file.type)) {
          continue;
        }

        const originalName = resolveUploadName(file, index);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const storagePath = await saveEvidenceFile(bytes, originalName);

        attachEvidenceToNode({
          nodeId: id,
          originalFileName: originalName,
          mimeType: SUPPORTED_IMAGE_MIME.has(file.type) ? file.type : "image/png",
          storagePath,
          previewSrc: toAssetUrl(storagePath)
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
    updateNodeMarkdown(id, event.target.value);
  };

  const onNodeDoubleClick = () => {
    onToggleMode();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    setSelectedNodeId(id);
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

  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const files = getPastedImageFiles(event);
    if (files.length === 0) {
      void (async () => {
        const clipboardApiFiles = await readClipboardApiImages();
        if (clipboardApiFiles.length === 0) {
          return;
        }

        setSelectedNodeId(id);
        void attachFiles(clipboardApiFiles);
      })();

      return;
    }

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
          <h4 className={styles.title}>{data.title}</h4>
          <div className={styles.meta}>Double click to switch mode</div>
        </div>
        <button type="button" className={styles.modeButton} onClick={onToggleMode}>
          {mode === "view" ? "Edit" : "View"}
        </button>
      </header>

      <section className={`${styles.body} ${mode === "edit" ? "nodrag" : ""}`}>
        {mode === "edit" ? (
          <textarea
            className={`${styles.editor} nodrag`}
            value={data.payload.markdown}
            onChange={onEditorChange}
            onPaste={onPaste}
            placeholder="Write markdown notes"
            aria-label="Evidence markdown editor"
          />
        ) : (
          <article className={styles.markdownView}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.payload.markdown}</ReactMarkdown>
          </article>
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

      <footer className={styles.footer}>{data.payload.tags.join(" | ")}</footer>

      <Handle type="source" position={Position.Right} />
    </div>
  );
};
