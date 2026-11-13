import type { Feature, Point } from "geojson";
import { MapPin, RotateCcw } from "lucide-react";
import { BREAK_COLORS, BREAK_LABELS, GROUP_COLORS } from "@/config/presets";
import { PHASE_PROFILES } from "@/data";
import { mapRef } from "@/map/MapView";
import { get, set, showOnly, useStore } from "@/state/store";
import { breaksOf, plannedDate } from "@/state/lines";
import { timeWindow } from "@/config/regions";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { addDays, daysBetween, fmtShort } from "@/lib/dates";

const J = PHASE_PROFILES.jenks;
const PHASES = J.summary.map((x) => x.phase);
const binColour = (b: number) => GROUP_COLORS.find((c) => c.value === b)?.color ?? GROUP_COLORS[0].color;

// One km axis along the general direction of advance for every phase, so the strips can be compared.
// Dots on top, a histogram of the same divisions on the same axis below (STEP km per bar), then the axis labels.
const W = 320, PAD = 6, DOT_B = 58, HIST_T = 64, BASE = 100, H = BASE + 26, STEP = 25;
const kms = J.dots.features.map((f) => Number(f.properties?.km));
const XMIN = Math.min(...kms, ...J.summary.map((x) => x.line_from)) - 10, XMAX = Math.max(...kms, ...J.summary.map((x) => x.line_to)) + 10;
const jitter = (i: number) => ((i * 37) % 23) / 23; // fixed scatter so dots don't stack
const bucket = (km: number) => Math.floor((km - XMIN) / STEP);
const tally = (fs: Feature[]) => {
  const out = new Map<number, Map<number, number>>(); // bucket -> bin -> divisions
  for (const f of fs) {
    const b = bucket(Number(f.properties?.km)), bin = Number(f.properties?.bin), row = out.get(b) ?? new Map<number, number>();
    out.set(b, row.set(bin, (row.get(bin) ?? 0) + 1));
  }
  return out;
};
const total = (row: Map<number, number>) => [...row.values()].reduce((a, b) => a + b, 0);
// One bar scale for every phase, so the histograms can be compared.
const MAXC = Math.max(...PHASES.flatMap((p) => [...tally(J.dots.features.filter((f) => f.properties?.phase === p)).values()]
  .map(total)));
const WIN = timeWindow("frontier");

/** Natural breaks: on a phase's planned date, the divisions on one line along the direction of the whole advance,
 * cut by Jenks where they clump; only then is each bin read against the phase line (past / on the line / short). */
export function NaturalBreaks() {
  const step = useStore((s) => s.phaseStep);
  const phaseDates = useStore((s) => s.phaseDates);
  const B = useStore((s) => breaksOf(s, PHASES.includes(step) ? step : PHASES[0]));
  const L = PHASES.includes(step) ? step : PHASES[0];
  const planned = plannedDate(L), date = phaseDates[L] ?? planned;
  const setDate = (d: string) => {
    const { [L]: _, ...rest } = phaseDates;
    set({ phaseDates: d === planned ? rest : { ...rest, [L]: d } });
  };
  const live = useStore((s) => date !== planned || (s.lineEdits.phase[L]?.length ?? 0) >= 2);

  const show = (p: string) => {
    set({ phaseStep: p });
    showOnly(["jenksdots", "jenkslines", "checklines"]);
    const pts = (breaksOf(get(), p)?.dots.features ?? []).map((f) => (f.geometry as Point).coordinates);
    if (!pts.length) return;
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    mapRef?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 50, duration: 800 });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display flex items-center gap-1.5 text-[15px]">Natural breaks <Help id="naturalBreaks" /></h3>
        <button onClick={() => show(L)} className="flex shrink-0 items-center gap-1 rounded-[var(--radius)] border border-border px-2 py-1 text-[12px] hover:bg-muted">
          <MapPin size={13} /> Show on map
        </button>
      </div>
      <Segmented<string> size="sm" value={L} onChange={show} items={PHASES.map((p) => ({ value: p, label: `Phase ${p}` }))} />
      <label className="flex items-center gap-2 text-[12px]">
        <span className="shrink-0 text-muted-foreground">Date</span>
        <input type="range" min={0} max={daysBetween(WIN.start, WIN.end)} value={daysBetween(WIN.start, date)} className="min-w-0 flex-1"
          onChange={(e) => setDate(addDays(WIN.start, Number(e.target.value)))} aria-label={`Date for phase ${L}`} />
        <span className="w-12 shrink-0 font-mono">{fmtShort(date)}</span>
        <button onClick={() => setDate(planned)} disabled={date === planned} title={`Back to the planned date, ${fmtShort(planned)}`}
          className="shrink-0 rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Back to the planned date"><RotateCcw size={13} /></button>
      </label>
      {B ? <Chart L={L} B={B} live={live} /> : <p className="text-[12px] text-muted-foreground">Fewer than 5 divisions have a position on {fmtShort(date)}.</p>}
    </div>
  );
}

function Chart({ L, B, live }: { L: string; B: NonNullable<ReturnType<typeof breaksOf>>; live: boolean }) {
  const { summary: sum, bins } = B, dots = B.dots.features, cuts = B.breaklines.features.map((f) => Number(f.properties?.km));
  // The published axis and bar scale, widened when a moved date or redrawn line reaches past them.
  const here = dots.map((f) => Number(f.properties?.km));
  const xmin = Math.min(XMIN, ...here, sum.line_from - 10), xmax = Math.max(XMAX, ...here, sum.line_to + 10);
  const xOf = (km: number) => PAD + ((km - xmin) / (xmax - xmin)) * (W - 2 * PAD);
  const maxc = Math.max(MAXC, ...[...tally(dots).values()].map(total));
  const barH = (n: number) => (n / maxc) * (BASE - HIST_T - 8);
  return (
    <>

      <section className="frame p-2.5" aria-label={`Natural breaks, phase ${L}`}>
        <p className="flex flex-wrap items-center gap-x-2 text-[12px]">
          <span className="text-muted-foreground">{fmtShort(sum.date)}{live ? " (recomputed)" : ""} · {sum.divisions} divisions in {sum.bins} bins (explain {Math.round(sum.gvf * 100)}%). Divisions in bins that are:</span>
          {BREAK_COLORS.map((c) => (
            <span key={c.value} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{BREAK_LABELS[c.value]} {sum[c.value as "past"]}%
            </span>
          ))}
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full" role="img" aria-label="Divisions along the direction of advance">
          <rect x={xOf(sum.line_from)} y={PAD} width={xOf(sum.line_to) - xOf(sum.line_from)} height={BASE - PAD} fill="#00c2a8" fillOpacity={0.15} />
          <text x={(xOf(sum.line_from) + xOf(sum.line_to)) / 2} y={PAD + 7} textAnchor="middle" fontSize={7} fill="#00c2a8">phase {L} line</text>
          {cuts.map((k) => <line key={k} x1={xOf(k)} x2={xOf(k)} y1={PAD} y2={BASE} stroke="var(--foreground)" strokeWidth={0.8} strokeDasharray="3 2" />)}
          {dots.map((f, i) => {
            const cx = xOf(Number(f.properties?.km)), cy = PAD + 12 + jitter(i) * (DOT_B - PAD - 14), c = binColour(Number(f.properties?.bin));
            return f.properties?.past ? <circle key={i} cx={cx} cy={cy} r={2.4} fill={c} />
              : <circle key={i} cx={cx} cy={cy} r={2.1} fill="none" stroke={c} strokeWidth={1} />;
          })}
          <line x1={PAD} x2={W - PAD} y1={DOT_B + 3} y2={DOT_B + 3} stroke="var(--border)" strokeOpacity={0.5} />
          <text x={PAD} y={HIST_T + 4} fontSize={7} fill="var(--muted-foreground)">divisions per {STEP} km</text>
          {[...tally(dots)].map(([b, row]) => {
            const x = xOf(XMIN + b * STEP) + 0.4, w = xOf(XMIN + (b + 1) * STEP) - xOf(XMIN + b * STEP) - 0.8;
            let y = BASE;
            return [...row].sort(([a], [c]) => c - a).map(([bin, n]) => {
              y -= barH(n);
              return <rect key={`${b}-${bin}`} x={x} y={y} width={w} height={barH(n)} fill={binColour(bin)} />;
            }).concat(<text key={`${b}-n`} x={x + w / 2} y={y - 1.5} textAnchor="middle" fontSize={7} fill="var(--muted-foreground)">
              {total(row)}</text>);
          })}
          <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--border)" />
          {[0, 200, 400, 600].map((t) => <text key={t} x={xOf(t)} y={BASE + 10} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">{t} km</text>)}
          <text x={PAD} y={H - 2} fontSize={9} fill="var(--muted-foreground)">← rear (west)</text>
          <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">along the advance ({J.heading}°)</text>
          <text x={W - PAD} y={H - 2} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">front (east) →</text>
        </svg>
        <p className="text-[10px] text-muted-foreground">Top: each circle is a division, filled = past the phase line, open = short of it. Bottom: the same divisions counted every {STEP} km, stacked by bin. Colour = bin · dashed = natural break · teal band = where the phase line falls on this axis (it is slanted, so it spans a range)</p>

        <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px]">
          {bins.map((b) => (
            <li key={b.bin} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: binColour(b.bin) }} />
              <span>Bin {b.bin}{b.bin === 1 ? " (front)" : ""} · {b.divisions} divisions · {b.from_km}–{b.to_km} km · {b.past} of {b.divisions} past the line: {BREAK_LABELS[b.class]}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
