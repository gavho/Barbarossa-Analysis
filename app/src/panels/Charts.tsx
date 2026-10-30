import { useMemo, useRef } from "react";
import { Bar, BarChart, Cell, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { BRANCH_COLORS, POSTURE_COLORS } from "@/config/presets";
import { timeWindow } from "@/config/regions";
import { matches } from "@/map/expressions";
import { countBy, visibleFeatures } from "@/lib/query";
import { addDays, daysBetween, fmtShort } from "@/lib/dates";
import { exportChartPng } from "@/io/export";
import { set, useStore, type State } from "@/state/store";
import { RollingNumber } from "@/ui/RollingNumber";
import { Help } from "@/ui/Help";

const POSTURES = Object.keys(POSTURE_COLORS);
const BRANCH_ORDER = BRANCH_COLORS.map((b) => String(b.value));
const branchColor = (k: string) => BRANCH_COLORS.find((b) => b.value === k)?.color ?? "#8d8d8d";

export function Charts() {
  const s = useStore();
  if (s.page === "home") return <HomeStats s={s} />;
  return <RegionCharts s={s} />;
}

function RegionCharts({ s }: { s: State }) {
  const daily = useMemo(() => visibleFeatures({ ...s, mode: "instant" }, "points"), [s.page, s.date, s.filters, s.data]);
  const toDate = useMemo(() => visibleFeatures({ ...s, mode: "progressive" }, "points"), [s.page, s.date, s.filters, s.data]);
  const branches = countBy(daily, "Branch_Type", BRANCH_ORDER);
  const postureDaily = countBy(daily, "Posture", POSTURES);
  const postureTotal = countBy(toDate, "Posture", POSTURES);

  // Posture-over-time series ignores the date (it is the x axis) but keeps cluster and chart filters.
  const series = useMemo(() => {
    const { start, end } = timeWindow(s.page);
    const rows = Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => ({ date: addDays(start, i), ...Object.fromEntries(POSTURES.map((p) => [p, 0])) })) as Record<string, number | string>[];
    const idx = new Map(rows.map((r, i) => [r.date as string, i]));
    if (s.page === "home") return rows;
    for (const f of s.data.regions[s.page].points.features) {
      const p = f.properties ?? {};
      if (!matches(p, "none", "members", s.mode, s.date, s.filters, true)) continue;
      const i = idx.get(p.Date);
      if (i !== undefined && p.Posture) (rows[i][p.Posture] as number)++;
    }
    return rows;
  }, [s.page, s.filters, s.data]);

  const units = new Set(daily.map((f) => `${f.properties?.Nation}|${f.properties?.Num_Name}`)).size;
  const strength = daily.reduce((a, f) => a + Number(f.properties?.Frac_Unit ?? 0), 0);
  const filter = (field: string, value: string) =>
    set({ filters: { ...s.filters, chart: s.filters.chart?.field === field && s.filters.chart.value === value ? null : { field, value } } });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Units today" value={units} />
        <Kpi label="Div. equivalents" value={Math.round(strength)} />
        <Kpi label="Records to date" value={toDate.length} />
      </div>

      <ChartCard help="branchChart" title="Total branch composition" note="Units on the selected day · click a bar to filter" name="branch_composition">
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={branches} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="key" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
            <Tooltip contentStyle={tip} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="count" onClick={(d) => filter("Branch_Type", String((d as unknown as { key: string }).key))} cursor="pointer" isAnimationActive={false}>
              {branches.map((b) => <Cell key={b.key} fill={branchColor(b.key)} fillOpacity={!s.filters.chart || s.filters.chart.value === b.key ? 1 : 0.35} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard help="postureChart" title="Total posture over time" note="Records per day · click a legend item to filter" name="posture_over_time">
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtShort} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
            <Tooltip contentStyle={tip} labelFormatter={(d) => fmtShort(String(d))} />
            <Legend wrapperStyle={{ fontSize: 11, cursor: "pointer" }} onClick={(e) => filter("Posture", String(e.value))} />
            <ReferenceLine x={s.date} stroke="var(--primary)" strokeDasharray="3 3" />
            {POSTURES.map((p) => <Line key={p} dataKey={p} stroke={POSTURE_COLORS[p]} dot={false} strokeWidth={1.8} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard help="postureDays" title="Division days by posture" note="Left: selected day · Right: total to date" name="division_days">
        <div className="grid grid-cols-2">
          {[postureDaily, postureTotal].map((data, i) => (
            <ResponsiveContainer key={i} width="100%" height={150}>
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="key" innerRadius={30} outerRadius={55} paddingAngle={1} isAnimationActive={false}
                  onClick={(d) => filter("Posture", String((d as unknown as { key: string }).key))} cursor="pointer" stroke="var(--card)">
                  {data.map((d) => <Cell key={d.key} fill={POSTURE_COLORS[d.key] ?? "#8d8d8d"} />)}
                </Pie>
                <Tooltip contentStyle={tip} />
              </PieChart>
            </ResponsiveContainer>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-x-3 text-[11px]">
          {POSTURES.map((p) => <span key={p} className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: POSTURE_COLORS[p] }} />{p}</span>)}
        </div>
      </ChartCard>
    </div>
  );
}

function HomeStats({ s }: { s: State }) {
  const today = useMemo(() => visibleFeatures({ ...s, mode: "instant" }, "heat").length, [s.date, s.data]);
  const total = s.data.overview.features.length;
  const regions = Object.entries(s.data.regions).map(([k, r]) => ({ key: k, count: r.points.features.length }));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Division records today" value={today} />
        <Kpi label="Records, all theaters" value={total} />
      </div>
      <ChartCard title="Records by theater" name="records_by_theater">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={regions} layout="vertical" margin={{ top: 4, right: 12, left: 10, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
            <YAxis type="category" dataKey="key" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={70} />
            <Tooltip contentStyle={tip} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="count" fill="var(--primary)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <p className="text-[12px] text-muted-foreground">Open a theater for the full analysis: Instant vs Progressive views, cluster filters, division days and unit tracking.</p>
    </div>
  );
}

const tip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, color: "var(--foreground)" };

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="frame px-2 py-1.5">
      <div className="text-[18px] text-foreground"><RollingNumber value={value} /></div>
      <div className="display text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ChartCard({ title, note, name, help, children }: { title: string; note?: string; name: string; help?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section className="frame p-2" ref={ref} aria-label={title}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h3 className="display flex items-center gap-1.5 text-[13px]">{title}{help && <Help id={help} />}</h3>
          {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
        </div>
        <button aria-label={`Download ${title} as PNG`} title="Download PNG" onClick={() => exportChartPng(ref.current, name)} className="text-muted-foreground hover:text-foreground"><Download size={13} /></button>
      </div>
      {children}
    </section>
  );
}
