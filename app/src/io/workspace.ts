import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { REGIONS } from "@/config/regions";
import { get, initialState, set, toast, useStore, type State } from "@/state/store";
import { saveFile } from "./export";

const KEYS = ["page", "mode", "date", "speed", "theme", "basemap", "styles", "filters", "showPlan", "unit", "follow",
  "leftOpen", "rightOpen", "rightTab", "tableLayer", "tableExtentOnly", "stories", "userLayers", "view"] as const;
type Saved = Pick<State, (typeof KEYS)[number]>;

export interface Workspace extends Partial<Saved> {
  schemaVersion: 1;
  app: "Barbarossa";
  savedAt: string;
  dataSnapshot?: State["data"]["source"];
}

export function serialize(s: State): Workspace {
  const out: Workspace = { schemaVersion: 1, app: "Barbarossa", savedAt: new Date().toISOString(), dataSnapshot: s.data.source };
  for (const k of KEYS) (out as unknown as Record<string, unknown>)[k] = s[k];
  return out;
}

const PAGES = new Set(["home", ...REGIONS.map((r) => r.id)]);

/** Apply a workspace after checking it is ours; unknown or malformed keys fall back to defaults. */
export function applyWorkspace(w: unknown): boolean {
  const ws = w as Workspace;
  if (!ws || typeof ws !== "object" || ws.app !== "Barbarossa" || ws.schemaVersion !== 1) {
    toast("Not a Barbarossa workspace file (expected *.barbarossa.json).", "error");
    return false;
  }
  const patch: Partial<State> = {};
  for (const k of KEYS) {
    const v = ws[k];
    if (v === undefined) continue;
    if (typeof v !== typeof initialState[k] && initialState[k] !== null) continue; // type guard on untrusted input
    (patch as Record<string, unknown>)[k] = v;
  }
  if (patch.page && !PAGES.has(patch.page)) delete patch.page;
  if (patch.date && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) delete patch.date;
  if (patch.userLayers && !Array.isArray(patch.userLayers)) delete patch.userLayers;
  set({ ...patch, playing: false, presenting: null, selection: null });
  if (ws.dataSnapshot && ws.dataSnapshot.date !== get().data.source.date)
    toast(`Workspace was saved with data from ${ws.dataSnapshot.date}; now showing ${get().data.source.date}.`, "info");
  return true;
}

export async function saveWorkspace() {
  const s = get();
  const blob = new Blob([JSON.stringify(serialize(s), null, 1)], { type: "application/json" });
  const ok = await saveFile(blob, `barbarossa_${s.page}_${s.date}.barbarossa.json`,
    [{ description: "Barbarossa workspace", accept: { "application/json": [".barbarossa.json", ".json"] } }]);
  if (ok) toast("Workspace saved", "ok");
}

export async function openWorkspaceFile(file: File) {
  try {
    if (applyWorkspace(JSON.parse(await file.text()))) toast(`Opened ${file.name}`, "ok");
  } catch {
    toast(`Could not read ${file.name}: not valid JSON.`, "error");
  }
}

const AUTOSAVE = "barbarossa-autosave";

/** Debounced autosave to IndexedDB, and an offer to restore the previous session on load. */
export function startAutosave() {
  let t: ReturnType<typeof setTimeout> | undefined;
  const unsub = useStore.subscribe((now, prev) => {
    if (KEYS.every((k) => now[k] === prev[k])) return;
    clearTimeout(t);
    t = setTimeout(() => idbSet(AUTOSAVE, serialize(get())).catch(() => {}), 1000);
  });
  idbGet(AUTOSAVE).then((w) => {
    if (w) toast("Restore your last session?", "info", { label: "Restore", run: () => applyWorkspace(w) }, 8000);
  }).catch(() => {}); // private windows can block IndexedDB; the app still works without autosave
  return unsub;
}

export const clearAutosave = () => idbDel(AUTOSAVE).catch(() => {});
