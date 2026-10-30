import { useMemo, useState } from "react";
import { POSTURE_COLORS } from "@/config/presets";
import { set, unitKey, unitLabel, useStore } from "@/state/store";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";
import { Help } from "@/ui/Help";

type SortKey = "Days_Active" | "Attack_Days" | "Defend_Days" | "Move_Days" | "Reserve_Days";
const PARTS = [["Move_Days", "Move"], ["Reserve_Days", "Reserve"], ["Attack_Days", "Attack"], ["Defend_Days", "Defend"]] as const;

/** Per-division posture breakdown from the *_division_days tables (unused by the original app). */
export function DivisionDays() {
  const page = useStore((s) => s.page);
  const data = useStore((s) => s.data);
  const unit = useStore((s) => s.unit);
  const [nation, setNation] = useState("All");
  const [branch, setBranch] = useState("All");
  const [sort, setSort] = useState<SortKey>("Days_Active");
  const [share, setShare] = useState<"days" | "share">("days");
  const all = page === "home" ? [] : data.regions[page].days;
  const nations = ["All", ...new Set(all.map((d) => d.Nation))];
  const branches = ["All", ...new Set(all.map((d) => d.Branch))];
  const rows = useMemo(() => all
    .filter((d) => (nation === "All" || d.Nation === nation) && (branch === "All" || d.Branch === branch))
    .sort((a, b) => (share === "share" && sort !== "Days_Active" ? b[sort] / b.Days_Active - a[sort] / a.Days_Active : b[sort] - a[sort])),
  [all, nation, branch, sort, share]);
  if (page === "home") return <p className="p-4 text-muted-foreground">Open a theater to see division days.</p>;
  const max = Math.max(1, ...rows.map((r) => r.Days_Active));
  const totals = PARTS.map(([k]) => rows.reduce((a, r) => a + r[k], 0));
  const sum = totals.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Select label="Nation" value={nation} options={nations} onChange={setNation} />
        <Select label="Branch" value={branch} options={branches} onChange={setBranch} />
        <Select label="Sort" value={sort} options={["Days_Active", "Attack_Days", "Defend_Days", "Move_Days", "Reserve_Days"]} onChange={(v) => setSort(v as SortKey)} />
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">{rows.length} divisions <Help id="divisionDays" /></span>
        <Segmented size="sm" value={share} onChange={setShare} items={[{ value: "days", label: "Days" }, { value: "share", label: "% of active" }]} />
      </div>
      <div className="frame p-2">
        <div className="display mb-1 text-[11px] text-muted-foreground">All shown divisions</div>
        <div className="flex h-3 overflow-hidden rounded-sm">
          {PARTS.map(([k, label], i) => <div key={k} title={`${label}: ${totals[i]} days`} style={{ width: `${(totals[i] / sum) * 100}%`, background: POSTURE_COLORS[label] }} />)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
          {PARTS.map(([k, label], i) => <span key={k} className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: POSTURE_COLORS[label] }} />{label} {Math.round((totals[i] / sum) * 100)}%</span>)}
        </div>
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const key = unitKey(r.Nation, r.Division);
          const width = share === "share" ? 100 : (r.Days_Active / max) * 100;
          return (
            <li key={key}>
              <button onClick={() => set({ unit: key, rightTab: "oob" })} title="Track this unit"
                className={cn("grid w-full grid-cols-[96px_1fr_28px] items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted", unit === key && "bg-primary/15")}>
                <span className="truncate text-[12px]">{unitLabel(key)} <span className="text-muted-foreground">{r.Branch.slice(0, 3)}</span></span>
                <span className="flex h-2.5 overflow-hidden rounded-sm bg-muted" style={{ width: `${width}%` }}>
                  {PARTS.map(([k, label]) => <span key={k} style={{ width: `${(r[k] / Math.max(1, r.Days_Active)) * 100}%`, background: POSTURE_COLORS[label] }} />)}
                </span>
                <span className="text-right font-mono text-[11px] text-muted-foreground">{r.Days_Active}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col">
      <span className="display text-[10px] text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-border bg-background px-1 py-0.5 text-[12px]">
        {options.map((o) => <option key={o} value={o}>{o.replace("_Days", "").replace("_", " ")}</option>)}
      </select>
    </label>
  );
}
