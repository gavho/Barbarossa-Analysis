// Adapted from watermelon-ui `command-search`: layoutId morph from trigger to palette, arrow-key navigation,
// grouped sections. Controlled open state, Ctrl/⌘+K shortcut, items supplied by the caller.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CommandItem { id: string; title: string; hint?: string; section: string; icon?: ReactNode; action: () => void }

const tween = { type: "tween" as const, ease: "easeOut" as const, duration: 0.15 };

export function CommandSearch({ items, open, setOpen }: { items: CommandItem[]; open: boolean; setOpen: (o: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(!open); }
      else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);
  useEffect(() => { if (open) { setQuery(""); setTimeout(() => input.current?.focus(), 80); } }, [open]);
  useEffect(() => setActive(0), [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? items.filter((i) => `${i.title} ${i.hint ?? ""} ${i.section}`.toLowerCase().includes(q)) : items;
    return hits.slice(0, 200);
  }, [items, query]);
  const sections = useMemo(() => {
    const g = new Map<string, CommandItem[]>();
    for (const i of filtered) g.set(i.section, [...(g.get(i.section) ?? []), i]);
    return [...g];
  }, [filtered]);

  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const run = (i: CommandItem | undefined) => { if (i) { i.action(); setOpen(false); } };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!filtered.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter") run(filtered[active]);
  };

  return (
    <>
      <AnimatePresence>
        {open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />}
      </AnimatePresence>
      <div className="relative z-50 h-8 w-44 lg:w-56">
        <AnimatePresence mode="popLayout">
          {!open ? (
            <motion.button key="trigger" layoutId="command-palette" transition={tween} onClick={() => setOpen(true)}
              className="group absolute inset-0 flex items-center gap-2 overflow-hidden rounded-[var(--radius)] border border-border bg-background px-2.5 text-muted-foreground hover:text-foreground">
              <motion.span layoutId="cmd-icon" transition={tween}><Search size={14} /></motion.span>
              <motion.span layoutId="cmd-text" transition={tween} className="truncate whitespace-nowrap pr-12 text-[12px]">Find unit, page, action…</motion.span>
              <kbd className="absolute right-1.5 rounded border border-border bg-muted px-1 font-mono text-[10px]">Ctrl K</kbd>
            </motion.button>
          ) : (
            <motion.div key="palette" layoutId="command-palette" transition={tween} onClick={(e) => e.stopPropagation()}
              className="absolute -top-1 right-0 flex h-[420px] w-[min(440px,90vw)] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-2xl">
              <div className="flex items-center border-b border-border px-3 py-2.5">
                <motion.span layoutId="cmd-icon" transition={tween}><Search size={16} className="mr-2 text-muted-foreground" /></motion.span>
                <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                  aria-label="Search" placeholder="Search divisions, pages, actions"
                  className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground" />
                <kbd className="ml-2 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">Esc</kbd>
              </div>
              <div ref={list} className="scroll-thin flex-1 overflow-y-auto p-1">
                {!filtered.length && <div className="py-10 text-center text-muted-foreground">No results for "{query}"</div>}
                {sections.map(([name, its]) => (
                  <div key={name} className="mb-2">
                    <h3 className="display px-2 py-1 text-[11px] text-muted-foreground">{name}</h3>
                    {its.map((it) => {
                      const i = filtered.indexOf(it);
                      return (
                        <button key={it.id} data-i={i} onMouseEnter={() => setActive(i)} onClick={() => run(it)}
                          className={cn("flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2 py-1.5 text-left",
                            i === active ? "bg-accent text-foreground" : "text-muted-foreground")}>
                          <span className="shrink-0">{it.icon}</span>
                          <span className="truncate text-[13px]">{it.title}</span>
                          {it.hint && <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{it.hint}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
