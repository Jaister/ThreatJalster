# ThreatJalster (Tauri + React)

Cross-platform desktop application for Threat Hunting and Pentesting built on an infinite canvas of connectable nodes.

## Supported Platforms

| Platform | Status |
|----------|--------|
| Windows 10/11 (x64) | Supported |
| Linux (x64, X11 & Wayland) | Supported |

## System Requirements

### Windows

- Windows 10 (1803+) or Windows 11
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (included in Windows 11, auto-installed on Windows 10)

### Linux

Install the following system packages before building or running:

**Debian / Ubuntu:**

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  librsvg2-dev \
  libxdo-dev \
  build-essential \
  pkg-config \
  curl \
  wget \
  file
```

**Fedora:**

```bash
sudo dnf install -y \
  webkit2gtk4.1-devel \
  gtk3-devel \
  javascriptcoregtk4.1-devel \
  libsoup3-devel \
  librsvg2-devel \
  libxdo-devel \
  gcc \
  pkg-config
```

**Arch Linux:**

```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  gtk3 \
  libsoup3 \
  librsvg \
  xdotool \
  base-devel
```

**File dialog support (Linux):** Make sure `xdg-desktop-portal` and a portal backend are installed for native file dialogs:

```bash
# Debian/Ubuntu (GNOME)
sudo apt install -y xdg-desktop-portal xdg-desktop-portal-gtk

# Debian/Ubuntu (KDE)
sudo apt install -y xdg-desktop-portal xdg-desktop-portal-kde

# Arch (GNOME)
sudo pacman -S xdg-desktop-portal xdg-desktop-portal-gtk
```

**Clipboard image support (Linux):** The app reads images from the system clipboard via native APIs. On X11 this works out of the box. On Wayland, ensure `wl-clipboard` is available:

```bash
# Debian/Ubuntu
sudo apt install -y wl-clipboard

# Arch
sudo pacman -S wl-clipboard
```

## Build Requirements (all platforms)

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.77
- npm (comes with Node.js)

## Getting Started

```bash
# Install frontend dependencies
npm install

# Run in development mode (hot reload)
npm run tauri:dev

# Build release binary
npm run tauri:build
```

Frontend-only dev server (no Tauri shell):

```bash
npm run dev
```

## Architecture

### Frontend (React + TypeScript)

- **Canvas**: `@xyflow/react` (React Flow) for an infinite zoomable/pannable node canvas.
- **State**: Zustand for global state management.
- **Markdown**: `react-markdown` + `remark-gfm` for rich-text rendering inside nodes.

### Backend / App Shell (Tauri + Rust)

- **Shell**: Tauri v2 for lightweight native binary with secure IPC.
- **Persistence**: JSON workspace files saved to the platform app-data directory.
- **Evidence**: Images saved with UUID filenames, size limits, and atomic writes.
- **Clipboard**: Native clipboard image reading via `arboard` for cross-platform paste support.

### Data Locations

| Data | Windows | Linux |
|------|---------|-------|
| Projects | `%LOCALAPPDATA%\com.security.threatjalster\projects\` | `~/.local/share/com.security.threatjalster/projects/` |
| Evidence images | `%LOCALAPPDATA%\com.security.threatjalster\evidences\` | `~/.local/share/com.security.threatjalster/evidences/` |

## Key Files

| File | Purpose |
|------|---------|
| `src/components/canvas/ThreatCanvas.tsx` | Infinite canvas with nodes and edges |
| `src/components/nodes/EvidenceNode.tsx` | Node UI with markdown, images, tags, severity |
| `src/store/useWorkspaceStore.ts` | Global state and persistence logic |
| `src/lib/tauri.ts` | Frontend IPC wrappers |
| `src-tauri/src/commands.rs` | Rust commands for file I/O, dialogs, clipboard |
| `src-tauri/tauri.conf.json` | Tauri config, CSP, asset protocol scope |

## Security

- `withGlobalTauri: false` to minimize JS attack surface.
- Restrictive CSP in `tauri.conf.json`.
- All filenames sanitized (alphanumeric + underscore/dash only).
- Image and workspace size limits enforced.
- Atomic writes (`*.tmp` + rename) to prevent file corruption.
- Asset protocol scoped to app-data directories only.
