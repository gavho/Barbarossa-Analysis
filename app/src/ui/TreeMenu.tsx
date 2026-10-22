// Adapted from watermelon-ui `tree-menu`: drill-down list with animated breadcrumb and directional exit.
// Sized for a side panel; leaf count badges; lucide icon instead of react-icons.
import { useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem { id: string; label: string; badge?: string | number; children?: MenuItem[] }

export function TreeMenu({ data, activeId, onSelect }: { data: MenuItem[]; activeId?: string | null; onSelect: (item: MenuItem) => void }) {
  const [path, setPath] = useState<MenuItem[]>([]);
  const clicked = useRef<number | null>(null);
  const items = path.length ? path[path.length - 1].children ?? [] : data;

  const forward = (item: MenuItem, i: number) => {
    if (item.children?.length) { clicked.current = i; setPath((p) => [...p, item]); }
    else onSelect(item);
  };

  const itemVariants: Variants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: (i: number) => {
      const c = clicked.current;
      if (c === null) return { opacity: 0, y: -8, transition: { duration: 0.15 } };
      return { opacity: 0, y: i < c ? -60 : i > c ? 60 : 0, transition: { duration: 0.25, ease: "easeOut" } };
    },
  };

  return (
    <div className="flex w-full flex-col">
      <div className="mb-2 flex flex-col items-start">
        <AnimatePresence mode="popLayout">
          {path.map((p, i) => (
            <motion.button key={`crumb-${p.id}`} layout="position" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }} onClick={() => { clicked.current = null; setPath(path.slice(0, i)); }}
              className="display flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[13px] text-muted-foreground hover:bg-muted"
              style={{ marginLeft: i * 10 }}>
              <CornerUpLeft size={13} />
              <motion.span layoutId={`tree-${p.id}`}>{p.label}</motion.span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="popLayout">
        <motion.ul key={path.length ? path[path.length - 1].id : "root"} initial="initial" animate="animate" exit="exit"
          variants={{ initial: { opacity: 0 }, animate: { opacity: 1, transition: { staggerChildren: 0.03 } }, exit: {} }}
          className="flex flex-col gap-0.5" style={{ paddingLeft: path.length * 10 }}>
          {items.map((it, i) => {
            const branch = !!it.children?.length;
            return (
              <motion.li key={it.id} custom={i} variants={itemVariants}>
                <button onClick={() => forward(it, i)}
                  className={cn("flex w-full items-center justify-between rounded-[var(--radius)] px-2 py-1.5 text-left transition-colors",
                    branch ? "display text-[14px] text-foreground hover:bg-muted"
                      : activeId === it.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <motion.span layoutId={branch ? `tree-${it.id}` : undefined}>{it.label}</motion.span>
                  {it.badge !== undefined && <span className="font-mono text-[10px] text-muted-foreground">{it.badge}</span>}
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      </AnimatePresence>
    </div>
  );
}
