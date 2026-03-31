# ThreatJalster (Tauri + React)

Aplicacion de escritorio multiplataforma para Threat Hunting y Pentesting basada en un lienzo infinito de nodos conectables.

## Arquitectura propuesta

### Frontend (React + TypeScript)

- Framework: React 18 + TypeScript (Vite) para DX rapida y tipado estricto.
- Canvas de nodos: `@xyflow/react` (React Flow/XYFlow) por rendimiento y manejo eficiente de cientos de nodos.
- Estado global: Zustand para separar UI de logica de dominio y evitar acoplamiento.
- Renderizado enriquecido: `react-markdown` + `remark-gfm` para markdown seguro (sin HTML crudo).

### Backend / App Shell (Tauri + Rust)

- App shell: Tauri v2 para binario ligero y acceso nativo seguro.
- IPC: solo comandos Rust tipados y validacion fuerte de entrada.
- Persistencia: JSON local por investigacion en `app_local_data_dir()/investigations/{id}`.
- Evidencias: imagenes guardadas por Rust con limites de tamano y MIME allowlist.

## Estructura de datos

Documento principal (`WorkspaceDocument`):

- `meta`: `investigationId`, timestamps y nombre.
- `nodes`: arreglo de nodos XYFlow con payload enriquecido (`markdown`, `snippet`, `evidenceImageIds`, `tags`, `severity`).
- `edges`: relaciones entre nodos (incluye `relation` y `confidence`).
- `evidence`: indice de metadatos de imagen por `imageId`.

Decisiones de eficiencia:

- El nodo no almacena bytes de imagen; solo referencia por `id`.
- Las miniaturas se cargan bajo demanda como `data URL` desde Rust.
- `ReactFlow onlyRenderVisibleElements` reduce costo de render en canvas grandes.

## Seguridad aplicada

- `withGlobalTauri: false` para reducir superficie JS global.
- CSP restrictiva en `src-tauri/tauri.conf.json`.
- Validacion de `investigationId`, `nodeId`, `imageId` y nombre de archivo con regex.
- Bloqueo de tipos no permitidos (`image/png`, `image/jpeg`, `image/webp`).
- Limites de carga: workspace e imagenes con tamaño maximo.
- Escritura atomica en disco (`*.tmp` + `rename`) para evitar corrupcion.

## Archivos clave

- Frontend canvas: `src/components/canvas/ThreatCanvas.tsx`
- Nodo con preview: `src/components/nodes/IntelNode.tsx`
- Estado global: `src/store/useWorkspaceStore.ts`
- API IPC frontend: `src/lib/tauri.ts`
- Comandos Rust: `src-tauri/src/commands.rs`
- Configuracion Tauri: `src-tauri/tauri.conf.json`

## Comandos

```bash
npm install
npm run tauri:dev
```

Si solo quieres levantar frontend web:

```bash
npm run dev
```
