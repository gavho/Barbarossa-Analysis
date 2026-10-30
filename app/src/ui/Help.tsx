// "?" button that explains what a number or control is and how it is computed. Text lives in config/help.ts.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { HELP } from "@/config/help";

const W = 300;

export function Help({ id, className = "" }: { id: string; className?: string }) {
  const entry = HELP[id];
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!at) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setAt(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); window.removeEventListener("resize", close); };
  }, [at]);

  if (!entry) return null;
  const open = () => {
    if (at) return setAt(null);
    const r = btn.current!.getBoundingClientRect();
    // Below the button, kept inside the window; flips above when there is no room underneath.
    const left = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8);
    const top = r.bottom + 220 > window.innerHeight ? Math.max(8, r.top - 8 - 220) : r.bottom + 6;
    setAt({ top, left });
  };

  return (
    <>
      <button ref={btn} type="button" onClick={(e) => { e.stopPropagation(); open(); }} aria-label={`What is ${entry.title}?`} aria-expanded={!!at}
        className={`inline-grid h-4 w-4 shrink-0 place-items-center rounded-full border border-muted-foreground/50 align-middle font-mono text-[9px] leading-none text-muted-foreground hover:border-primary hover:text-primary ${className}`}>
        ?
      </button>
      {createPortal(
        <AnimatePresence>
          {at && (
            <motion.div ref={pop} role="dialog" aria-label={entry.title} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }} style={{ position: "fixed", top: at.top, left: at.left, width: W }}
              className="frame z-[70] max-h-[60vh] overflow-y-auto p-3 text-left normal-case tracking-normal shadow-2xl">
              <div className="display mb-1 text-[13px] text-primary">{entry.title}</div>
              <p className="text-[12px] leading-relaxed text-foreground">{entry.body}</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
