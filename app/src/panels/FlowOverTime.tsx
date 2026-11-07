import { useState } from "react";
import { FORMATION_COLORS, GROUP_COLORS } from "@/config/presets";
import { LOCAL_GROUPS, type DailyGroup } from "@/data";
import { set, useStore } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { fmtShort } from "@/lib/dates";

const { groups: GROUPS, links: LINKS, dots: DOTS } = LOCAL_GROUPS;
export const DAYS = [...new Set(GROUPS.map((g) => g.date))].sort();
const LIFE = GROUPS.reduce((m, g) => m.set(g.id, (m.get(g.id) ?? 0) + 1), new Map<number, number>());
const LASTING = 10; // days a group must hold together to count as one of the story's groups
const GREY = GROUP_COLORS[0].color;

// Layout: one column per day; groups stacked north (top) to south, height = divisions; a gap of two divisions between.
const W = 320, H = 210, PAD = 6, BAR = 3, GAP = 2, AXIS = 12;
const xOf = (i: number) => PAD + (i * (W - 2 * PAD - 40)) / (DAYS.length - 1); // 40 px on the right for labels
const totals = DAYS.map((d) => GROUPS.filter((g) => g.date === d).reduce((n, g) => n + g.divisions + GAP, -GAP));
const K = (H - AXIS - 2 * PAD) / Math.max(...totals);
interface Box { x: number; y: number; h: number; out: number; in: number; g: DailyGroup }
const BOX = new Map<string, Box>();
DAYS.forEach((d, i) => {
  let top = PAD;
  for (const g of GROUPS.filter((x) => x.date === d).sort((a, b) => b.y - a.y)) {
    BOX.set(`${d}|${g.id}`, { x: xOf(i), y: top, h: g.divisions * K, out: 0, in: 0, g });
    top += (g.divisions + GAP) * K;
  }
});
const BANDS = LINKS.map((l) => {
  const a = BOX.get(`${l.from_date}|${l.from_id}`)!, b = BOX.get(`${l.to_date}|${l.to_id}`)!, h = l.divisions * K;
  const y0 = a.y + a.out, y1 = b.y + b.in, x0 = a.x + BAR, x1 = b.x, xm = (x0 + x1) / 2;
  a.out += h;
  b.in += h;
  return { d: `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h}Z`,
    same: l.from_id === l.to_id, g: a.g };
});

type ColourBy = "group" | "formation";
const colourOf = (g: DailyGroup, by: ColourBy) =>
  by === "formation" ? FORMATION_COLORS[g.dominant] ?? GREY : GROUP_COLORS.find((c) => c.value === (g.id % 8) + 1)!.color;

/** Every day's groups as a flow through time: a bar per group, bands for the divisions that stayed together into the next
 * day. Groups that held together for 10+ days are drawn strong and labelled; the rest stay faint. Click a day to show it. */
export function FlowOverTime() {
  const date = useStore((s) => s.date);
  const [by, setBy] = useState<ColourBy>("group");
  const day = DAYS.indexOf(date);
  const today = GROUPS.filter((g) => g.date === date).sort((a, b) => b.y - a.y);
  const lone = DOTS.features.filter((f) => f.properties?.date === date && Number(f.properties?.group) < 0).length;
  const lasting = [...LIFE].filter(([, n]) => n >= LASTING).map(([id]) => id);

  return (
    <section className="frame p-2.5" aria-label="Groups through time">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
        <h4 className="flex items-center gap-1.5 text-[12px]">Groups through time <Help id="flowOverTime" /></h4>
        <Segmented<ColourBy> size="sm" value={by} onChange={setBy} items={[{ value: "group", label: "By group" }, { value: "formation", label: "By formation" }]} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-pointer" role="img" aria-label="Groups of divisions from day to day">
        {BANDS.map((b, i) => (
          <path key={i} d={b.d} fill={b.same ? colourOf(b.g, by) : GREY}
            fillOpacity={b.same && (LIFE.get(b.g.id) ?? 0) >= LASTING ? 0.55 : 0.18} />
        ))}
        {[...BOX.values()].map((b) => (
          <rect key={`${b.g.date}|${b.g.id}`} x={b.x} y={b.y} width={BAR} height={Math.max(1, b.h)}
            fill={(LIFE.get(b.g.id) ?? 0) >= LASTING ? colourOf(b.g, by) : GREY}>
            <title>{`${fmtShort(b.g.date)} · group ${b.g.id + 1} · ${b.g.divisions} divisions (${b.g.formations})`}</title>
          </rect>
        ))}
        {lasting.map((id) => {
          const last = [...BOX.values()].filter((b) => b.g.id === id).at(-1)!;
          return <text key={id} x={last.x + BAR + 2} y={last.y + last.h / 2 + 3} fontSize={8} fill="var(--foreground)">
            {last.g.dominant === "other" ? "unident." : last.g.dominant}</text>;
        })}
        {day >= 0 && <line x1={xOf(day) + BAR / 2} x2={xOf(day) + BAR / 2} y1={PAD - 3} y2={H - AXIS} stroke="var(--primary)" strokeWidth={1} />}
        {DAYS.map((d, i) => (
          <rect key={d} x={xOf(i) - 2} y={0} width={(W - 2 * PAD - 40) / (DAYS.length - 1)} height={H} fill="transparent"
            onClick={() => set({ date: d })}><title>{fmtShort(d)}</title></rect>
        ))}
        {DAYS.map((d, i) => (i % 7 === 0 ? <text key={d} x={xOf(i)} y={H - 2} fontSize={8} fill="var(--muted-foreground)">{fmtShort(d)}</text> : null))}
      </svg>
      <p className="text-[10px] text-muted-foreground">North at top · bar height = divisions · strong = held together 10+ days · click a day</p>

      <p className="mt-2 text-[12px] text-muted-foreground">{day >= 0 ? `${fmtShort(date)}: ${today.length} groups + ${lone} lone` : "Pick a day between 22 June and 5 August."}</p>
      <ul className="mt-0.5 flex flex-col gap-0.5 text-[12px]">
        {today.map((g) => (
          <li key={g.id} className="flex items-start gap-1.5">
            <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colourOf(g, by) }} />
            <span>Group {g.id + 1} · {g.divisions} divisions ({g.formations}){(LIFE.get(g.id) ?? 0) >= LASTING ? ` · held ${LIFE.get(g.id)} days` : ""}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
