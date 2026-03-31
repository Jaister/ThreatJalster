import type { MiniMapNodeProps } from "@xyflow/react";
import { useWorkspaceStore } from "../../store";

export const CustomMiniMapNode = ({
  id,
  x,
  y,
  width,
  height,
  selected
}: MiniMapNodeProps) => {
  const node = useWorkspaceStore((state) => state.nodes.find((n) => n.id === id));

  if (!node) {
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill="#505050"
        stroke={selected ? "#ffffff" : "rgba(255,255,255,0.4)"}
        strokeWidth={selected ? 2 : 1}
      />
    );
  }

  const title = node.data.title;
  const tags = node.data.payload.tags;
  const markdown = node.data.payload.markdown;
  const preview = markdown.length > 60 ? `${markdown.slice(0, 60)}…` : markdown;

  const headerHeight = height * 0.22;
  const footerHeight = tags.length > 0 ? height * 0.14 : 0;
  const bodyHeight = height - headerHeight - footerHeight;

  return (
    <g>
      {/* Card background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill="#404040"
        stroke={selected ? "#ffffff" : "rgba(255,255,255,0.5)"}
        strokeWidth={selected ? 2 : 1}
      />

      {/* Header background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={headerHeight}
        rx={4}
        fill="#4a4a4a"
      />
      {/* Square off bottom corners of header */}
      <rect
        x={x}
        y={y + headerHeight - 4}
        width={width}
        height={4}
        fill="#4a4a4a"
      />

      {/* Header divider */}
      <line
        x1={x}
        y1={y + headerHeight}
        x2={x + width}
        y2={y + headerHeight}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={1}
      />

      {/* Title text */}
      <foreignObject x={x + 6} y={y + 2} width={width - 12} height={headerHeight - 2}>
        <div
          style={{
            color: "#ffffff",
            fontSize: "10px",
            fontWeight: 600,
            fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
            lineHeight: `${headerHeight - 4}px`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap" as const
          }}
        >
          {title}
        </div>
      </foreignObject>

      {/* Body - markdown preview */}
      {preview && (
        <foreignObject x={x + 6} y={y + headerHeight + 4} width={width - 12} height={bodyHeight - 8}>
          <div
              style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: "8px",
              fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
              lineHeight: "1.3",
              overflow: "hidden",
              wordBreak: "break-word" as const
            }}
          >
            {preview}
          </div>
        </foreignObject>
      )}

      {/* Footer with tags */}
      {tags.length > 0 && (
        <>
          <line
            x1={x}
            y1={y + height - footerHeight}
            x2={x + width}
            y2={y + height - footerHeight}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={1}
          />
          <foreignObject
            x={x + 6}
            y={y + height - footerHeight + 1}
            width={width - 12}
            height={footerHeight - 2}
          >
            <div
                  style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "7px",
                fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
                lineHeight: `${footerHeight - 2}px`,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const
              }}
            >
              {tags.join(" | ")}
            </div>
          </foreignObject>
        </>
      )}
    </g>
  );
};
