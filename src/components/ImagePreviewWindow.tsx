import { RefObject, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../store";
import styles from "./ImagePreviewWindow.module.css";

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

interface DragState {
  offsetX: number;
  offsetY: number;
}

interface PanDragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ImagePreviewWindowProps {
  containerRef: RefObject<HTMLElement | null>;
}

export const ImagePreviewWindow = ({ containerRef }: ImagePreviewWindowProps) => {
  const openedImagePreviewSrc = useWorkspaceStore((state) => state.openedImagePreviewSrc);
  const closeImagePreview = useWorkspaceStore((state) => state.closeImagePreview);
  const [position, setPosition] = useState({ x: 64, y: 64 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panDragRef = useRef<PanDragState | null>(null);

  const clampWindowPosition = (nextX: number, nextY: number): { x: number; y: number } => {
    const container = containerRef.current;
    const panelWidth = windowRef.current?.offsetWidth ?? 920;
    const panelHeight = windowRef.current?.offsetHeight ?? 680;
    const containerWidth = container?.clientWidth ?? globalThis.window.innerWidth;
    const containerHeight = container?.clientHeight ?? globalThis.window.innerHeight;
    const maxX = Math.max(8, containerWidth - panelWidth - 8);
    const maxY = Math.max(8, containerHeight - panelHeight - 8);

    return {
      x: clamp(nextX, 8, maxX),
      y: clamp(nextY, 8, maxY)
    };
  };

  const clampPan = (candidate: { x: number; y: number }, targetZoom: number): { x: number; y: number } => {
    const imageWidth = imageRef.current?.clientWidth ?? 0;
    const imageHeight = imageRef.current?.clientHeight ?? 0;
    const viewportWidth = viewportRef.current?.clientWidth ?? 0;
    const viewportHeight = viewportRef.current?.clientHeight ?? 0;

    const maxX = Math.max(0, (imageWidth * targetZoom - viewportWidth) / 2);
    const maxY = Math.max(0, (imageHeight * targetZoom - viewportHeight) / 2);

    return {
      x: clamp(candidate.x, -maxX, maxX),
      y: clamp(candidate.y, -maxY, maxY)
    };
  };

  useEffect(() => {
    if (!openedImagePreviewSrc) {
      return;
    }

    const container = containerRef.current;
    const containerWidth = container?.clientWidth ?? globalThis.window.innerWidth;
    const containerHeight = container?.clientHeight ?? globalThis.window.innerHeight;
    const panelWidth = Math.min(containerWidth - 16, 920);
    const panelHeight = Math.min(containerHeight - 16, 680);
    const centeredX = Math.round((containerWidth - panelWidth) / 2);
    const centeredY = Math.round((containerHeight - panelHeight) / 2);

    setPosition(clampWindowPosition(centeredX, centeredY));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [containerRef, openedImagePreviewSrc]);

  useEffect(() => {
    if (!openedImagePreviewSrc) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeImagePreview();
    };

    globalThis.window.addEventListener("keydown", onKeyDown);

    return () => {
      globalThis.window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeImagePreview, openedImagePreviewSrc]);

  useEffect(() => {
    if (!openedImagePreviewSrc) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if (dragRef.current) {
        const container = containerRef.current;
        const containerBounds = container?.getBoundingClientRect();
        const localClientX = event.clientX - (containerBounds?.left ?? 0);
        const localClientY = event.clientY - (containerBounds?.top ?? 0);
        const next = clampWindowPosition(
          localClientX - dragRef.current.offsetX,
          localClientY - dragRef.current.offsetY
        );
        setPosition(next);
      }

      if (panDragRef.current) {
        const drag = panDragRef.current;
        const nextPan = {
          x: drag.originX + (event.clientX - drag.startX),
          y: drag.originY + (event.clientY - drag.startY)
        };

        setPan(clampPan(nextPan, zoom));
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
      panDragRef.current = null;
    };

    globalThis.window.addEventListener("mousemove", onMouseMove);
    globalThis.window.addEventListener("mouseup", onMouseUp);

    return () => {
      globalThis.window.removeEventListener("mousemove", onMouseMove);
      globalThis.window.removeEventListener("mouseup", onMouseUp);
    };
  }, [containerRef, openedImagePreviewSrc, zoom]);

  useEffect(() => {
    if (!openedImagePreviewSrc) {
      return;
    }

    const onWindowResize = () => {
      setPosition((current) => clampWindowPosition(current.x, current.y));
      setPan((current) => clampPan(current, zoom));
    };

    globalThis.window.addEventListener("resize", onWindowResize);

    return () => {
      globalThis.window.removeEventListener("resize", onWindowResize);
    };
  }, [containerRef, openedImagePreviewSrc, zoom]);

  if (!openedImagePreviewSrc) {
    return null;
  }

  return (
    <div
      ref={windowRef}
      className={styles.window}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div
        className={styles.titlebar}
        onMouseDown={(event) => {
          const bounds = windowRef.current?.getBoundingClientRect();
          const containerBounds = containerRef.current?.getBoundingClientRect();
          if (!bounds) {
            return;
          }

          dragRef.current = {
            offsetX: event.clientX - bounds.left,
            offsetY: event.clientY - bounds.top
          };

          if (!containerBounds) {
            return;
          }
        }}
      >
        <span>Evidence preview</span>

        <div className={styles.titleActions}>
          <button
            type="button"
            className={styles.zoomButton}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              setZoom((current) => {
                const nextZoom = clamp(Number((current - 0.2).toFixed(2)), 1, 6);
                setPan((currentPan) => clampPan(currentPan, nextZoom));
                return nextZoom;
              });
            }}
            aria-label="Zoom out"
          >
            -
          </button>
          <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className={styles.zoomButton}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              setZoom((current) => {
                const nextZoom = clamp(Number((current + 0.2).toFixed(2)), 1, 6);
                setPan((currentPan) => clampPan(currentPan, nextZoom));
                return nextZoom;
              });
            }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            aria-label="Reset image position"
          >
            1:1
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => closeImagePreview()}
            aria-label="Close image preview"
          >
            x
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={styles.imageWrap}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((current) => {
            const delta = event.deltaY < 0 ? 0.12 : -0.12;
            const nextZoom = clamp(Number((current + delta).toFixed(2)), 1, 6);
            setPan((currentPan) => clampPan(currentPan, nextZoom));
            return nextZoom;
          });
        }}
        onMouseDown={(event) => {
          if (zoom <= 1) {
            return;
          }

          event.preventDefault();
          panDragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            originX: pan.x,
            originY: pan.y
          };
        }}
      >
        <img
          ref={imageRef}
          className={`${styles.image} ${zoom > 1 ? styles.imagePannable : ""}`}
          src={openedImagePreviewSrc}
          alt="Evidence preview"
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
      </div>
    </div>
  );
};
