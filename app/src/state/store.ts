import { create } from "zustand";
import type { FC } from "@/data";
import { EMBEDDED, type Dataset } from "@/data";
import { preset, styleKey, type LayerId, type LayerStyle, type Mode } from "@/config/presets";
import { timeWindow, type PageId, type RegionId } from "@/config/regions";
import type { Filters } from "@/map/expressions";

export type Theme = "tactical" | "period";
export type RightTab = "charts" | "table" | "info" | "days" | "plan" | "oob" | "vectors";

export interface View { center: [number, number]; zoom: number; bearing: number; pitch: number }
export interface Step { title: string; caption: string; date: string; mode: Mode; view: View | null }
export interface UserLayer {
  id: string;
  name: string;
  kind: "circle" | "line" | "fill";
  data: FC;
  style: LayerStyle;
}
export interface Selection { layer: string; title: string; props: Record<string, unknown> }
export interface Toast { id: number; msg: string; kind: "info" | "error" | "ok"; action?: { label: string; run: () => void } }

export interface State {
  page: PageId;
  mode: Mode;
  date: string;
  playing: boolean;
  speed: number; // days per second
  theme: Theme;
  basemap: string;
  styles: Record<string, LayerStyle>; // overrides only; preset() fills the rest
  filters: Filters;
  showPlan: boolean;
  selection: Selection | null;
  unit: string | null; // "Nation|Num_Name"
  follow: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  rightTab: RightTab;
  tableLayer: LayerId;
  tableExtentOnly: boolean;
  stories: Partial<Record<RegionId, Step[]>>;
  presenting: { region: RegionId; step: number } | null;
  userLayers: UserLayer[];
  data: Dataset;
  view: View | null;
  toasts: Toast[];
}

export const initialState: State = {
  page: "home",
  mode: "instant",
  date: timeWindow("home").start,
  playing: false,
  speed: 2,
  theme: "tactical",
  basemap: "dark",
  styles: {},
  filters: { geo: null, dv: null, chart: null },
  showPlan: false,
  selection: null,
  unit: null,
  follow: false,
  // Narrow screens start with the map clear; panels overlay it when opened.
  leftOpen: typeof window === "undefined" || window.innerWidth >= 1024,
  rightOpen: typeof window === "undefined" || window.innerWidth >= 1024,
  rightTab: "charts",
  tableLayer: "points",
  tableExtentOnly: false,
  stories: {},
  presenting: null,
  userLayers: [],
  data: EMBEDDED,
  view: null,
  toasts: [],
};

export const useStore = create<State>()(() => initialState);
export const set = useStore.setState;
export const get = useStore.getState;

export function styleOf(s: Pick<State, "page" | "mode" | "styles">, id: LayerId): LayerStyle {
  return s.styles[styleKey(s.page, s.mode, id)] ?? preset(s.page, s.mode, id);
}

export function setStyle(id: LayerId, patch: Partial<LayerStyle>) {
  const s = get();
  const key = styleKey(s.page, s.mode, id);
  set({ styles: { ...s.styles, [key]: { ...styleOf(s, id), ...patch } } });
}

export function resetStyle(id?: LayerId) {
  const s = get();
  if (!id) return set({ styles: {} });
  const { [styleKey(s.page, s.mode, id)]: _, ...rest } = s.styles;
  set({ styles: rest });
}

export function goTo(page: PageId) {
  const s = get();
  const { start, end } = timeWindow(page);
  const date = s.date < start || s.date > end ? start : s.date;
  set({
    page, date, playing: false, selection: null,
    filters: { geo: null, dv: null, chart: null },
    rightTab: page === "home" ? s.rightTab : s.rightTab === "plan" && page !== "frontier" ? "charts" : s.rightTab,
    unit: page === s.page ? s.unit : null,
  });
}

let toastId = 0;
export function toast(msg: string, kind: Toast["kind"] = "info", action?: Toast["action"], ms = 4500) {
  const t = { id: ++toastId, msg, kind, action };
  set({ toasts: [...get().toasts, t] });
  setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), action ? ms * 2 : ms);
}

export const unitKey = (nation: unknown, num: unknown) => `${nation}|${num}`;
export const unitLabel = (key: string, branch?: string) => {
  const [nation, num] = key.split("|");
  return `${nation} ${num === "9999" ? "(unnumbered)" : num}${branch ? ` ${branch}` : ""}`;
};
