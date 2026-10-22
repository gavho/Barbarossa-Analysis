import type { Feature } from "geojson";
import { layersFor, type LayerId } from "@/config/presets";
import { region, HOME } from "@/config/regions";
import { mapRef } from "@/map/MapView";
import { visibleFeatures } from "@/lib/query";
import { fmtDate } from "@/lib/dates";
import { get, styleOf, toast } from "@/state/store";

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Save via the File System Access picker when available, otherwise a plain download. */
export async function saveFile(blob: Blob, name: string, types?: { description: string; accept: Record<string, string[]> }[]) {
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (picker && window.self === window.top) {
    try {
      const h = await picker({ suggestedName: name, types });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return false;
    }
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

const stamp = () => {
  const s = get();
  return `barbarossa_${s.page}_${s.mode}_${s.date}`;
};

/** The map canvas composed with a title block, legend and credits at print scale. */
export async function renderMapImage(scale = 2): Promise<HTMLCanvasElement> {
  const map = mapRef;
  if (!map) throw new Error("Map is not ready");
  await new Promise<void>((r) => (map.loaded() ? r() : map.once("idle", () => r())));
  const src = map.getCanvas();
  const s = get();
  const header = 64 * scale, legendW = 230 * scale, pad = 14 * scale;
  const W = src.width + legendW, H = src.height + header;
  const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = c.getContext("2d")!;
  // Prints always use the paper palette so they read on a white page.
  const ink = "#1f1d1a", paper = "#f6f2e8", accent = s.theme === "period" ? "#8b2e1f" : "#1f6fb2";
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  g.drawImage(src, 0, header);
  g.fillStyle = ink;
  const title = "OPERATION BARBAROSSA — " + (region(s.page)?.title ?? HOME.title).toUpperCase();
  let size = 22 * scale;
  do g.font = `600 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  while (g.measureText(title).width > W - 2 * pad && (size -= scale) > 8 * scale);
  g.fillText(title, pad, 30 * scale);
  g.font = `${12 * scale}px "JetBrains Mono", monospace`;
  g.fillStyle = accent;
  g.fillText(`${fmtDate(s.date)}  ·  ${s.mode === "instant" ? "INSTANTANEOUS (single day)" : "PROGRESSIVE (to date)"}`, pad, 52 * scale);

  let y = header + pad + 10 * scale;
  g.fillStyle = ink;
  g.font = `600 ${14 * scale}px "Barlow Condensed", sans-serif`;
  g.fillText("LEGEND", src.width + pad, y);
  y += 18 * scale;
  g.font = `${11 * scale}px Inter, sans-serif`;
  for (const def of layersFor(s.page, s.showPlan).slice().reverse()) {
    const st = styleOf(s, def.id);
    if (!st.visible) continue;
    g.fillStyle = ink;
    g.font = `600 ${11 * scale}px Inter, sans-serif`;
    g.fillText(def.title, src.width + pad, y);
    y += 14 * scale;
    g.font = `${10.5 * scale}px Inter, sans-serif`;
    const rows: [string, string][] =
      st.colorMode === "category" && st.categories ? st.categories.map((c) => [c.color, String(c.value)])
        : st.colorMode === "ramp" && st.ramp ? st.ramp.map(([v, c]) => [c, `${v} ${st.colorField ?? ""}`])
        : def.kind === "heatmap" ? [["#7a1fa2", "Density (weighted by strength)"]]
        : [[st.color, def.title]];
    for (const [color, label] of rows.slice(0, 10)) {
      g.fillStyle = color;
      if (def.kind === "circle") { g.beginPath(); g.arc(src.width + pad + 6 * scale, y - 4 * scale, 5 * scale, 0, Math.PI * 2); g.fill(); }
      else if (def.kind === "line") g.fillRect(src.width + pad, y - 6 * scale, 14 * scale, 3 * scale);
      else g.fillRect(src.width + pad, y - 10 * scale, 14 * scale, 10 * scale);
      g.fillStyle = ink;
      g.fillText(label, src.width + pad + 20 * scale, y);
      y += 14 * scale;
    }
    y += 6 * scale;
    if (y > H - 80 * scale) break;
  }
  g.fillStyle = "#6b6357";
  g.font = `${9 * scale}px Inter, sans-serif`;
  const credit = ["Purdue University FORCES initiative", "Data: digitized 1941 daily situation maps", `Data as of ${s.data.source.date} · Basemap © Esri`];
  credit.forEach((t, i) => g.fillText(t, src.width + pad, H - (pad + (credit.length - 1 - i) * 13 * scale)));
  g.strokeStyle = ink; g.lineWidth = 2 * scale; g.strokeRect(0, header, src.width, src.height);
  return c;
}

export async function exportMapPng() {
  const c = await renderMapImage();
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
  await saveFile(blob, `${stamp()}.png`, [{ description: "PNG image", accept: { "image/png": [".png"] } }]);
}

export async function exportMapPdf() {
  const c = await renderMapImage();
  const { jsPDF } = await import("jspdf");
  const landscape = c.width >= c.height;
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "letter" });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 24;
  const k = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
  pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", (pw - c.width * k) / 2, (ph - c.height * k) / 2, c.width * k, c.height * k);
  await saveFile(pdf.output("blob"), `${stamp()}.pdf`, [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }]);
}

export async function exportLayer(id: LayerId, format: "geojson" | "csv") {
  const s = get();
  const feats = visibleFeatures(s, id);
  if (!feats.length) return toast("Nothing to export: the layer has no features for the current date and filters.", "error");
  const name = `${stamp()}_${id}.${format}`;
  const blob = format === "geojson"
    ? new Blob([JSON.stringify({ type: "FeatureCollection", features: feats })], { type: "application/geo+json" })
    : new Blob([toCsv(feats)], { type: "text/csv" });
  if (await saveFile(blob, name)) toast(`Exported ${feats.length} features`, "ok");
}

/** CSV with a representative lon/lat (first vertex) so line layers still open in a spreadsheet. */
export function toCsv(feats: Feature[]): string {
  const cols = [...new Set(feats.flatMap((f) => Object.keys(f.properties ?? {})))];
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const first = (f: Feature): number[] => {
    let c: unknown = (f.geometry as { coordinates?: unknown })?.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    return (c as number[]) ?? [];
  };
  const lines = feats.map((f) => [...cols.map((k) => esc(f.properties?.[k])), first(f)[0] ?? "", first(f)[1] ?? ""].join(","));
  return [[...cols, "lon", "lat"].join(","), ...lines].join("\n");
}

/** Serialize a Recharts SVG to PNG on the theme background. */
export async function exportChartPng(container: HTMLElement | null, name: string) {
  const svg = container?.querySelector("svg.recharts-surface") as SVGSVGElement | null;
  if (!svg) return toast("Chart is not ready", "error");
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.fontFamily = "Inter, sans-serif";
  // A standalone SVG image can't see the page's CSS variables; inline their current values.
  const text = new XMLSerializer().serializeToString(clone).replace(/var\((--[\w-]+)\)/g, (_, n) => cssVar(n));
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const scale = 2;
  const c = Object.assign(document.createElement("canvas"), { width: width * scale, height: height * scale });
  const g = c.getContext("2d")!;
  g.fillStyle = cssVar("--card");
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
  await saveFile(blob, `${stamp()}_${name}.png`);
}
