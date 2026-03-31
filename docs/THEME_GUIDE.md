# Theme Guide - ThreatJalster

## 1) Core Aesthetic
- Product type: Corporate cybersecurity analyst tool.
- Style: Flat Design only. Functional, sober, and utilitarian.
- Strict bans:
  - No gradients.
  - No neon effects.
  - No glow effects.
  - No blurred or colored shadows.

## 2) Color System (Non-Negotiable)
Only these two colors are allowed:
- White: #FFFFFF
- Dark Gray: #404040

Allowed variations:
- Opacity changes of white and dark gray.
- No third color in any component state.

## 3) Typography
- Primary family: Segoe UI, Helvetica Neue, Arial, sans-serif.
- Monospace: Consolas, Courier New, monospace.
- Scale:
  - H1: 16px, 600, uppercase, +0.03em tracking.
  - H2: 15px, 600.
  - Body: 13px to 14px, line-height 1.4 to 1.45.
  - Meta: 11px to 12px.

## 4) Borders and Radius
- Border thickness: 1px.
- Border color: white with controlled opacity.
- Radius tokens:
  - Control: 4px.
  - Card/panel: 6px.
- Avoid pill and ornamental geometry.

## 5) Interaction Rules
- Default: dark gray surfaces, white text, white-opacity borders.
- Hover: increase border opacity.
- Active: apply white low-opacity overlay.
- Focus-visible: 1px white outline with subtle white-opacity ring.
- Disabled: 48% opacity and no pointer events.

## 6) Component Behavior
- Buttons and inputs: flat fills, no effects.
- Tabs: compact rectangular controls, active tab in inverted colors.
- Cards/nodes: dark gray background, white border, no decorative shadows.
- Alerts: white on dark gray with border emphasis, no accent colors.

## 7) Canvas and Graph Rules
- Background: dark gray with low-opacity white grid lines.
- Edges: straight lines only.
- Handles: white circles with dark gray border.
- Minimap:
  - Background: #404040.
  - Nodes: #FFFFFF.
  - Border: solid white-opacity line.
  - Position: bottom-right with enough offset to avoid overlap with controls.

## 8) Bottom Controls
- Replace plus/minus zoom controls with a single zoom slider.
- Slider track: white low-opacity on dark gray.
- Slider thumb: white.
- Keep presentation minimal and compact.

## 9) Accessibility Baseline
- Every interactive control must expose visible focus.
- Keep text contrast high with white on dark gray or inverse.
- Labels and control names must be explicit and short.
