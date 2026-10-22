# Barbarossa Digital Analysis app

Standalone rebuild of the ArcGIS Experience "Operation Barbarossa Digital Analysis"
(item `ba5e82851a854d8387a89ea37c32a009`). Vite + React + TypeScript + Tailwind v4, built to one
self-contained file: `npm run build` → `../Barbarossa.html` (open by double-click, works offline except basemap tiles).

## Commands
- `python scripts/export_data.py` (from repo root: `python app/scripts/export_data.py`) — regenerate `src/data/*.json`
  from the newest `agol/AGOL_snapshot_*.gdb` + `milestones/AGS_Milestones.gdb`. Run after `agol/download_agol.py`.
- `npm run build` — type-check, build, copy to repo root. `npm test` — vitest. `npm run preview` — serve `dist/` on :4173.

## Rules
- All state lives in the zustand store (`src/state/store.ts`); change it with `set()` / helpers there.
- `syncLayers` (`src/map/syncLayers.ts`) is the only code that writes sources, layers, paint, layout or filters to MapLibre.
- Map filters (`layerFilter`) and JS filters (`matches`) in `src/map/expressions.ts` must stay equivalent; tests cover both.
- Colors come from CSS variables in `src/theme.css` (two themes: `tactical`, `period`). Unit colors are the same in both.
- Unlayered CSS beats Tailwind utilities: put shared classes in `@layer components` (maplibre's own CSS already forces
  `position: relative` on the map element, hence the wrapper div in `MapView`).
- Coded values are decoded at export time from the `domain_*` tables. The live Frontier_Points service has Security/Cavalry
  labels swapped (codes 1/2); the data and the domain tables agree on 1 = Cavalry, 2 = Security.
- Bad input (files, workspaces, network) shows a toast; never throw into React.
- Copied UI components live in `src/ui/` with a header naming their cult-ui / watermelon-ui source.
- Ponytail rules: smallest complete change, no new dependencies for a few lines.
- `window.__map` is a deliberate console debugging handle.
