// Adapted from watermelon-ui `fluid-tabs`: shared-layout active pill with blur pulse; controlled, compact.
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> { id: T; label: string; icon: ReactNode }

export function FluidTabs<T extends string>({ tabs, active, onChange, layoutId = "fluid-pill" }: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  layoutId?: string;
}) {
  return (
    <div role="tablist" className="relative flex items-center gap-0.5 rounded-[var(--radius)] border border-border bg-background p-0.5">
      {tabs.map((tab) => {
        const on = active === tab.id;
        return (
          <button key={tab.id} role="tab" aria-selected={on} title={tab.label} onClick={() => onChange(tab.id)}
            className="group relative flex-1 rounded-[var(--radius)] px-2 py-1.5 outline-none">
            {on && (
              <motion.div layoutId={layoutId} transition={{ type: "spring", stiffness: 280, damping: 25, mass: 0.8 }}
                className="absolute inset-0 rounded-[var(--radius)] border border-primary/50 bg-primary/15" />
            )}
            <motion.div
              animate={{ filter: on ? ["blur(0px)", "blur(3px)", "blur(0px)"] : "blur(0px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={cn("relative z-10 flex items-center justify-center gap-1.5", on ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}
            >
              {tab.icon}
              <span className="display hidden text-[12px] xl:inline">{tab.label}</span>
            </motion.div>
          </button>
        );
      })}
    </div>
  );
}
