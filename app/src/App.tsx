import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeft, PanelRight, Upload } from "lucide-react";
import { MapView } from "@/map/MapView";
import { Header } from "@/panels/Header";
import { LeftPanel } from "@/panels/LeftPanel";
import { RightPanel } from "@/panels/RightPanel";
import { Timeline } from "@/timeline/Timeline";
import { Presenter } from "@/present/Presenter";
import { loadFiles } from "@/io/dropLoad";
import { startAutosave } from "@/io/workspace";
import { loadCachedRefresh } from "@/io/agolRefresh";
import { set, useStore } from "@/state/store";
import { cn } from "@/lib/utils";

export function App() {
  const theme = useStore((s) => s.theme);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const presenting = useStore((s) => s.presenting);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { loadCachedRefresh(); return startAutosave(); }, []);
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragging(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files.length) loadFiles(e.dataTransfer.files); };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, []);

  return (
    <div className="grid-bg flex h-full flex-col">
      {!presenting && <Header />}
      <main className="relative flex min-h-0 flex-1 gap-2 p-2">
        <Side open={leftOpen} side="left"><LeftPanel /></Side>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="frame relative min-h-0 flex-1 overflow-hidden">
            <MapView />
            {!presenting && (
              <div className="absolute left-2 top-2 z-10 flex gap-1">
                <PanelToggle label={leftOpen ? "Hide left panel" : "Show left panel"} onClick={() => set({ leftOpen: !leftOpen })}><PanelLeft size={15} /></PanelToggle>
                <PanelToggle label={rightOpen ? "Hide right panel" : "Show right panel"} onClick={() => set({ rightOpen: !rightOpen })}><PanelRight size={15} /></PanelToggle>
              </div>
            )}
            <Presenter />
          </div>
          <Timeline />
        </div>
        <Side open={rightOpen} side="right"><RightPanel /></Side>
      </main>
      <Toasts />
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/70">
          <div className="display flex items-center gap-2 text-[20px]"><Upload /> Drop GeoJSON, CSV or a .barbarossa.json workspace</div>
        </div>
      )}
    </div>
  );
}

/** Collapsible side column; the cult-ui side-panel's width/opacity tween, driven by store state. */
function Side({ open, side, children }: { open: boolean; side: "left" | "right"; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside key={side} initial={{ width: 0, opacity: 0 }} animate={{ width: side === "left" ? 340 : 380, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
          transition={{ type: "tween", ease: [0.42, 0, 0.58, 1], duration: 0.3 }}
          className={cn("frame shrink-0 overflow-hidden max-lg:absolute max-lg:inset-y-2 max-lg:z-20 max-lg:shadow-2xl", side === "left" ? "max-lg:left-2" : "max-lg:right-2")}>
          <div className="h-full w-[340px] max-lg:w-[min(340px,85vw)]" style={side === "right" ? { width: 380 } : undefined}>{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PanelToggle({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} title={label} onClick={onClick} className="rounded-[var(--radius)] border border-border bg-card p-1.5 text-muted-foreground shadow hover:text-foreground">{children}</button>;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed left-1/2 top-14 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          // Dynamic-island style pill (cult-ui), one per message.
          <motion.div key={t.id} layout initial={{ opacity: 0, y: -12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.9 }}
            className={cn("pointer-events-auto flex items-center gap-3 rounded-full bg-black px-4 py-2 text-[12px] text-white shadow-2xl",
              t.kind === "error" && "ring-1 ring-danger", t.kind === "ok" && "ring-1 ring-ok")}>
            <span>{t.msg}</span>
            {t.action && <button onClick={() => { t.action!.run(); set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })); }}
              className="rounded-full bg-white/15 px-2 py-0.5 font-semibold hover:bg-white/25">{t.action.label}</button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
