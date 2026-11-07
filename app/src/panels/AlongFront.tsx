import { PHASE_CHECKS, PHASE_PROFILES } from "@/data";
import { ChartCard } from "./Charts";
import { color } from "./Phases";

// Both charts share one north-south axis: km north of 50N, top = north.
const { profiles, positions, towns, bin_km, bins_from_km } = PHASE_PROFILES;
const W = 360, H = 230, LEFT = 30, TOP = 16, BOTTOM = 6;
const lo = bins_from_km, hi = bins_from_km + bin_km * profiles[0].share.length;
const yOf = (km: number) => TOP + ((hi - km) / (hi - lo)) * (H - TOP - BOTTOM);
const colW = (W - LEFT) / profiles.length;
const short = (s: string) => s.replace("Frontier", "Fr.").replace("-", "→");

function Axis() {
  return (
    <g fontSize={8} fill="var(--muted-foreground)">
      {towns.map((t) => (
        <g key={t.km}>
          <line x1={LEFT} x2={W} y1={yOf(t.km)} y2={yOf(t.km)} stroke="var(--border)" strokeWidth={0.5} />
          <text x={LEFT - 3} y={yOf(t.km) + 3} textAnchor="end"><title>{t.name}</title>{t.name.split(" ")[0]}</text>
        </g>
      ))}
      {profiles.map((p, i) => <text key={p.stretch} x={LEFT + colW * (i + 0.5)} y={9} textAnchor="middle">{short(p.stretch)}</text>)}
    </g>
  );
}
const TownsNote = () => (
  <p className="mt-1 text-[10px] text-muted-foreground">{towns.filter((t) => t.name.includes("(")).map((t) => t.name).join(" · ")}</p>
);

/** One panel per stretch: where the division-days were along the front, the previous stretch dashed. */
export function FrontProfile() {
  const peak = Math.max(...profiles.flatMap((p) => p.share));
  const outline = (share: number[], x0: number) => {
    const pts = share.map((v, j) => `${x0 + (v / peak) * (colW - 8)},${yOf(lo + bin_km * (j + 0.5))}`);
    return `${x0},${yOf(lo + bin_km * 0.5)} ${pts.join(" ")} ${x0},${yOf(lo + bin_km * (share.length - 0.5))}`;
  };
  return (
    <ChartCard title="Where along the front" note="Share of division-days, north at top" help="frontProfile" name="front_profile">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Front profile per stretch between phase lines">
        <Axis />
        {profiles.map((p, i) => {
          const x0 = LEFT + colW * i + 2;
          return (
            <g key={p.stretch}>
              <polygon points={outline(p.share, x0)} fill="var(--primary)" fillOpacity={0.55} />
              {i > 0 && <polyline points={outline(profiles[i - 1].share, x0)} fill="none" stroke="var(--foreground)" strokeOpacity={0.5} strokeWidth={0.8} strokeDasharray="2 2" />}
              <line x1={x0} x2={x0 + colW - 6} y1={yOf(p.mean_km)} y2={yOf(p.mean_km)} stroke="var(--foreground)" strokeWidth={1.4} />
            </g>
          );
        })}
      </svg>
      <TownsNote />
    </ChartCard>
  );
}

/** Each division's average north-south place per stretch, joined; coloured by the group it crossed the phase line with. */
export function PlacesInLine() {
  const stretches = profiles.map((p) => p.stretch);
  const groupAt = new Map(PHASE_CHECKS.crossings.features.map((f) => [`${f.properties?.division}|${f.properties?.line}`, f.properties?.group as number]));
  const broke = new Set(PHASE_CHECKS.splits.map((x) => `${x.division}|${x.to_line}`));
  const byDivision = new Map<string, Map<string, number>>();
  for (const p of positions) {
    if (!byDivision.has(p.division)) byDivision.set(p.division, new Map());
    byDivision.get(p.division)!.set(p.stretch, p.km);
  }
  const xOf = (i: number) => LEFT + colW * (i + 0.5);
  const segments = [...byDivision].flatMap(([division, km]) => stretches.slice(1).flatMap((to, i) => {
    const from = stretches[i];
    if (!km.has(from) || !km.has(to)) return [];
    const line = to.split("-")[0]; // the phase line between the two stretches
    const g = groupAt.get(`${division}|${line}`);
    return [{ key: `${division}|${to}`, division, line, x1: xOf(i), x2: xOf(i + 1), y1: yOf(km.get(from)!), y2: yOf(km.get(to)!),
      stroke: g === undefined ? "var(--muted-foreground)" : color(g), thick: broke.has(`${division}|${line}`) }];
  }));
  return (
    <ChartCard title="Did divisions keep their places?" note="One line per division · thick = broke away at that line" help="placesInLine" name="places_in_line">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Each division's place along the front, stretch by stretch">
        <Axis />
        {segments.sort((a, b) => Number(a.thick) - Number(b.thick)).map((s) => (
          <line key={s.key} x1={s.x1} x2={s.x2} y1={s.y1} y2={s.y2} stroke={s.stroke}
            strokeWidth={s.thick ? 2.4 : 0.9} strokeOpacity={s.thick ? 1 : 0.6}>
            <title>{`${s.division} · crossed line ${s.line}${s.thick ? " · broke away" : ""}`}</title>
          </line>
        ))}
      </svg>
      <TownsNote />
    </ChartCard>
  );
}
