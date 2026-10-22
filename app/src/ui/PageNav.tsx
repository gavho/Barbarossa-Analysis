// Tab strip adapted from cult-ui `direction-aware-tabs`: the shared `bubble` layoutId slides between tabs.
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function PageNav<T extends string>({ items, active, onChange }: {
  items: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto scroll-thin" aria-label="Pages">
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)} aria-current={active === it.id ? "page" : undefined}
          className={cn("display relative shrink-0 px-3 py-1.5 text-[13px] transition-colors",
            active === it.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          style={{ WebkitTapHighlightColor: "transparent" }}>
          {active === it.id && (
            <motion.span layoutId="bubble" transition={{ type: "spring", bounce: 0.19, duration: 0.4 }}
              className="absolute inset-0 z-0 rounded-[var(--radius)] border-b-2 border-primary bg-primary/10" />
          )}
          <span className="relative z-10">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
