import { useMemo, useRef, useState } from "react";
import { CloudDownload, FileDown, FolderOpen, Image, Layers, Map as MapIcon, Menu, MonitorPlay, Save, Shield, Undo2 } from "lucide-react";
import { REGIONS, region, type PageId } from "@/config/regions";
import { BASEMAPS, DEFAULT_BASEMAP } from "@/map/basemaps";
import { unitsOf } from "@/lib/query";
import { exportMapPdf, exportMapPng } from "@/io/export";
import { saveWorkspace } from "@/io/workspace";
import { dataLabel, refreshFromAgol, revertToEmbedded } from "@/io/agolRefresh";
import { loadFiles } from "@/io/dropLoad";
import { startPresenting } from "@/present/Presenter";
import { get, goTo, set, toast, unitLabel, useStore, type Theme } from "@/state/store";
import { CommandSearch, type CommandItem } from "@/ui/CommandSearch";
import { PageNav } from "@/ui/PageNav";
import { Segmented } from "@/ui/Segmented";

const PAGES: { id: PageId; label: string }[] = [{ id: "home", label: "Home" }, ...REGIONS.map((r) => ({ id: r.id, label: r.title }))];

export function Header() {
  const page = useStore((s) => s.page);
  const theme = useStore((s) => s.theme);
  const basemap = useStore((s) => s.basemap);
  const data = useStore((s) => s.data);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setMenu(false);
    setBusy(label);
    try { await fn(); } catch (e) { toast(`${label} failed: ${(e as Error).message}`, "error"); } finally { setBusy(null); }
  };
  const refresh = () => run("Refresh from ArcGIS Online", async () => {
    await refreshFromAgol((m) => setBusy(m));
    toast("ArcGIS Online data loaded and cached.", "ok");
  });

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = PAGES.map((p) => ({ id: `page-${p.id}`, title: p.label, section: "Pages", icon: <MapIcon size={14} />, action: () => goTo(p.id) }));
    items.push(
      { id: "save", title: "Save workspace", section: "Actions", icon: <Save size={14} />, action: saveWorkspace },
      { id: "open", title: "Open workspace or data file", section: "Actions", icon: <FolderOpen size={14} />, action: () => fileInput.current?.click() },
      { id: "png", title: "Export map as PNG", section: "Actions", icon: <Image size={14} />, action: () => run("PNG export", exportMapPng) },
      { id: "pdf", title: "Export map as PDF", section: "Actions", icon: <FileDown size={14} />, action: () => run("PDF export", exportMapPdf) },
      { id: "theme", title: "Toggle theme (Tactical / Period)", section: "Actions", icon: <Shield size={14} />, action: () => switchTheme(get().theme === "tactical" ? "period" : "tactical") },
    );
    if (page !== "home") {
      items.push({ id: "present", title: `Present ${region(page)!.title}`, section: "Actions", icon: <MonitorPlay size={14} />, action: () => startPresenting(page) });
      for (const u of unitsOf(get(), page))
        items.push({ id: u.key, title: `${unitLabel(u.key, u.branch)} ${u.unitType}`, hint: `${u.days}d`, section: "Divisions", icon: <Layers size={14} />,
          action: () => set({ unit: u.key, rightOpen: true, rightTab: "oob" }) });
    }
    return items;
  }, [page, data]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-header px-3 text-foreground">
      <button onClick={() => goTo("home")} className="flex shrink-0 items-center gap-2" title="Home">
        <span className="grid h-7 w-7 place-items-center border border-primary text-primary" aria-hidden>✠</span>
        <span className="display hidden text-[15px] leading-none md:block">Operation Barbarossa<span className="block text-[10px] opacity-70">Digital Analysis</span></span>
      </button>
      <PageNav items={PAGES} active={page} onChange={goTo} />
      <div className="ml-auto flex items-center gap-2">
        {busy && <span className="hidden animate-pulse font-mono text-[11px] text-primary lg:inline" role="status">{busy}…</span>}
        <CommandSearch items={commands} open={cmdOpen} setOpen={setCmdOpen} />
        <select value={basemap} onChange={(e) => set({ basemap: e.target.value })} aria-label="Basemap"
          className="hidden rounded border border-border bg-background px-1 py-1 text-[12px] text-foreground lg:block">
          {BASEMAPS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <Segmented<Theme> size="sm" value={theme} onChange={switchTheme} className="bg-background"
          items={[{ value: "tactical", label: "Tactical" }, { value: "period", label: "1941" , title: "Period field-map theme" }]} />
        {page !== "home" && (
          <button onClick={() => startPresenting(page)} title="Presentation mode" className="hidden items-center gap-1 rounded-[var(--radius)] border border-primary/60 px-2 py-1 text-[12px] hover:bg-primary/15 sm:flex">
            <MonitorPlay size={14} /> Present
          </button>
        )}
        <div className="relative">
          <button aria-label="File menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="rounded-[var(--radius)] border border-border p-1.5 hover:bg-muted"><Menu size={15} /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div role="menu" className="frame absolute right-0 top-9 z-50 w-64 p-1 text-foreground shadow-2xl">
                <Item icon={<Save size={14} />} onClick={() => { setMenu(false); saveWorkspace(); }}>Save workspace…</Item>
                <Item icon={<FolderOpen size={14} />} onClick={() => { setMenu(false); fileInput.current?.click(); }}>Open workspace / add data…</Item>
                <hr className="my-1 border-border" />
                <Item icon={<Image size={14} />} onClick={() => run("PNG export", exportMapPng)}>Export map · PNG</Item>
                <Item icon={<FileDown size={14} />} onClick={() => run("PDF export", exportMapPdf)}>Export map · PDF</Item>
                <hr className="my-1 border-border" />
                <Item icon={<CloudDownload size={14} />} onClick={refresh}>Refresh from ArcGIS Online</Item>
                {data.source.kind === "agol" && <Item icon={<Undo2 size={14} />} onClick={() => { setMenu(false); revertToEmbedded(); }}>Use embedded snapshot</Item>}
                <div className="px-2 pt-1 font-mono text-[10px] text-muted-foreground">Data: {dataLabel()}</div>
              </div>
            </>
          )}
        </div>
        <input ref={fileInput} type="file" hidden multiple accept=".json,.geojson,.csv" onChange={(e) => { if (e.target.files) loadFiles(e.target.files); e.target.value = ""; }} />
      </div>
    </header>
  );
}

function switchTheme(theme: Theme) {
  const s = get();
  // Follow the theme's basemap unless the user picked something else.
  const basemap = s.basemap === DEFAULT_BASEMAP[s.theme] ? DEFAULT_BASEMAP[theme] : s.basemap;
  set({ theme, basemap });
}

function Item({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick} className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left text-[13px] hover:bg-accent">
      <span className="text-muted-foreground">{icon}</span>{children}
    </button>
  );
}
