"""Significance tests for the Frontier analyses, and the statistics write-up (analysis/STATISTICS.md).

Small samples (44-51 divisions), so permutation and bootstrap methods throughout, with effect sizes and 95% intervals,
and a Holm correction across the family of tests. Seeded: a re-run gives the same numbers.

  A. Planned vs actual: are the realized groups closer to the planned lines than groups of divisions picked at random?
  B. Chain of command: do the groups line up with the planned formations (6A, III PzKo, PzGp1(-), 17A)?
  C. Are the clusters real? Gap statistic and silhouette against structureless data; bootstrap stability of each group.
  D. Phase lines: did the front shift at each line (Wilcoxon, paired by division)? Did divisions keep their order
     (Spearman, permutation)? How stable are the checkpoint groups and the natural breaks between the lines (bootstrap)?

Run the analyses first (compare_loa.py, phase_distributions.py, phase_checkpoints.py), then:
  python analysis/significance.py            (writes analysis/significance/results.csv and analysis/STATISTICS.md)
  python analysis/significance.py --quick    (fewer permutations, for checking the script)
"""
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency, spearmanr, wilcoxon
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

sys.path.insert(0, str(Path(__file__).parent))
import compare_loa as c  # noqa: E402
import phase_clusters as pc  # noqa: E402
import phase_distributions as pdist  # noqa: E402

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "significance"
QUICK = "--quick" in sys.argv
N_PLAN = 100 if QUICK else 1000  # each permutation re-pairs average paths (Frechet), the slow step
N_PERM = 1000 if QUICK else 10000
N_BOOT = 50 if QUICK else 300
N_REF = 20 if QUICK else 100
rng = np.random.default_rng(2026)


def perm_p(observed, null, smaller_is_extreme=True):
    """One-sided permutation p with the +1 correction (never exactly 0)."""
    null = np.asarray(null)
    hits = (null <= observed).sum() if smaller_is_extreme else (null >= observed).sum()
    return (hits + 1) / (len(null) + 1)


def holm(ps):
    order = np.argsort(ps)
    adj, running = np.empty(len(ps)), 0.0
    for rank, i in enumerate(order):
        running = max(running, (len(ps) - rank) * ps[i])
        adj[i] = min(1.0, running)
    return adj


def ci(x):
    lo, hi = np.percentile(x, [2.5, 97.5])
    return f"{lo:.2f} to {hi:.2f}"


# ---------------------------------------------------------------- A. planned vs actual vs chance
def plan_stat(labels, keys, flines, planned):
    """Mean route gap (km) and mean bearing difference (deg) over the planned lines, for one grouping of divisions."""
    groups = {g: c.average_line([flines[k] for k, l in zip(keys, labels) if l == g]) for g in set(labels)}
    pairing, _ = c.pair_lines(planned, groups)
    gaps, bds = [], []
    for p, g in pairing.items():
        a, b = c.common_clip(planned[p], groups[g])
        if a is None:
            gaps.append(150.0)  # no shared stretch: count as far off (beyond the 100 km zero of the route score)
            bds.append(90.0)
            continue
        _, off = c.signed_offsets(a, b)
        gaps.append(float(np.abs(off).mean()))
        bds.append(abs(c.wrap(c.bearing(b.coords[0], b.coords[-1]) - c.bearing(a.coords[0], a.coords[-1]))))
    return float(np.mean(gaps)), float(np.mean(bds))


def test_plan(f, flines, planned):
    rows = []
    for name, col in (("Published 5 (DV)", "DV"), ("Recommended 4 (DV4)", "DV4")):
        sub = f[f[col].notna()]
        keys = [k for k in zip(sub.Nation, sub.Branch, sub.Num_Name) if k in flines]
        labels = np.array([int(sub.set_index(["Nation", "Branch", "Num_Name"]).loc[k, col]) for k in keys])
        gap, bd = plan_stat(labels, keys, flines, planned)
        null = np.array([plan_stat(rng.permutation(labels), keys, flines, planned) for _ in range(N_PLAN)])
        rows.append({"family": "A", "test": f"Plan vs actual closer than random groups — {name}", "statistic": "mean route gap (km)",
                     "estimate": round(gap, 1), "null_median": round(float(np.median(null[:, 0])), 1), "p": perm_p(gap, null[:, 0]),
                     "n": len(keys), "detail": f"bearing diff {bd:.1f}° vs null median {np.median(null[:, 1]):.1f}° "
                                               f"(p = {perm_p(bd, null[:, 1]):.3f}); {N_PLAN} permutations"})
        print(f"  A {name}: gap {gap:.1f} km vs random {np.median(null[:, 0]):.1f}; p = {rows[-1]['p']:.4f}")
    return rows


# ---------------------------------------------------------------- B. chain of command
def cramers_v(table):
    chi2 = chi2_contingency(table, correction=False)[0]
    n = table.values.sum()
    return float(np.sqrt(chi2 / (n * (min(table.shape) - 1)))), chi2


def test_command(f):
    rows = []
    unit = f.Group.map(lambda g: next((u for u, t in c.PLANNED_UNIT.items() if t(g)), None))
    for name, col in (("Published 5 (DV)", "DV"), ("Published 5 (geometric)", "GEO"), ("Recommended 4 (DV4)", "DV4")):
        ok = unit.notna() & f[col].notna()
        u, g = unit[ok].values, f.loc[ok, col].astype(int).values
        table = pd.crosstab(g, u)
        v, chi2 = cramers_v(table)
        ari = adjusted_rand_score(u, g)
        null_chi, null_ari = [], []
        for _ in range(N_PERM):
            s = rng.permutation(u)
            null_chi.append(chi2_contingency(pd.crosstab(g, s), correction=False)[0])
            null_ari.append(adjusted_rand_score(s, g))
        rows.append({"family": "B", "test": f"Groups follow the planned formations — {name}", "statistic": "Cramér's V",
                     "estimate": round(v, 2), "null_median": round(float(np.median([np.sqrt(x / (ok.sum() * (min(table.shape) - 1))) for x in null_chi])), 2),
                     "p": perm_p(chi2, null_chi, smaller_is_extreme=False), "n": int(ok.sum()),
                     "detail": f"adjusted Rand {ari:.2f} (p = {perm_p(ari, null_ari, smaller_is_extreme=False):.4f}); "
                               f"exact test by {N_PERM} permutations of the formation labels"})
        print(f"  B {name}: V = {v:.2f}, ARI = {ari:.2f}, p = {rows[-1]['p']:.4f}")
    return rows


# ---------------------------------------------------------------- C. are the clusters real?
def dv_features(flines, keys):
    paths = [c.dense(flines[k]) for k in keys]
    return np.array([[*p[-1], *p.mean(axis=0)] for p in paths])


def km(X, k, n_init=10):
    return KMeans(n_clusters=k, random_state=0, n_init=n_init).fit(X)


def gap_statistic(X, ks):
    """Tibshirani's gap statistic with a uniform reference over the data's bounding box."""
    lo, hi = X.min(axis=0), X.max(axis=0)
    out = []
    for k in ks:
        wk = np.log(km(X, k).inertia_)
        ref = [np.log(km(rng.uniform(lo, hi, X.shape), k).inertia_) for _ in range(N_REF)]
        sil_ref = [silhouette_score(R, km(R, k).labels_) for R in (rng.uniform(lo, hi, X.shape) for _ in range(N_REF))]
        lab = km(X, k).labels_
        sil = silhouette_score(X, lab)
        out.append({"k": k, "gap": np.mean(ref) - wk, "s": np.std(ref) * np.sqrt(1 + 1 / N_REF), "silhouette": sil,
                    "sil_null_median": float(np.median(sil_ref)), "sil_p": perm_p(sil, sil_ref, smaller_is_extreme=False)})
    return pd.DataFrame(out)


def stability(X, k):
    """Bootstrap stability (Hennig's clusterboot): resample divisions, re-cluster, and for each original group take the
    best Jaccard overlap among the bootstrap groups, over the divisions drawn. Mean per group; >= 0.75 = stable."""
    base = km(X, k, 50).labels_
    jac = {g: [] for g in range(k)}
    for _ in range(N_BOOT):
        idx = np.unique(rng.integers(0, len(X), len(X)))
        lab = km(X[idx], k).labels_
        for g in range(k):
            A = set(idx[base[idx] == g])
            if not A:
                continue
            jac[g].append(max(len(A & set(idx[lab == h])) / len(A | set(idx[lab == h])) for h in range(k)))
    return base, {g: float(np.mean(v)) for g, v in jac.items() if v}


def test_clusters(flines):
    rows, tables = [], {}
    keys_all = list(flines)
    keys_adv = [k for k in keys_all if c.displacement(flines[k]) >= c.STAYED_BEHIND_KM]
    for name, keys, k in (("all divisions", keys_all, 5), (f"moved >= {c.STAYED_BEHIND_KM} km", keys_adv, 4)):
        X = dv_features(flines, keys)
        g = gap_statistic(X, range(2, 7))
        tables[name] = g
        best = next((r.k for r, nxt in zip(g.itertuples(), g.iloc[1:].itertuples()) if r.gap >= nxt.gap - nxt.s), int(g.k.iloc[-1]))
        row = g[g.k == k].iloc[0]
        _, jac = stability(X, k)
        rows.append({"family": "C", "test": f"Clusters stronger than in structureless data — k = {k}, {name}", "statistic": "silhouette",
                     "estimate": round(row.silhouette, 2), "null_median": round(row.sil_null_median, 2), "p": row.sil_p, "n": len(keys),
                     "detail": f"gap statistic picks k = {best}; bootstrap Jaccard per group {', '.join(f'{v:.2f}' for v in jac.values())} "
                               f"(>= 0.75 stable, 0.6-0.75 a pattern, < 0.5 dissolves); {N_BOOT} resamples"})
        print(f"  C {name}: k={k} silhouette {row.silhouette:.2f} vs null {row.sil_null_median:.2f}; gap picks k={best}; Jaccard {list(jac.values())}")
    return rows, tables


# ---------------------------------------------------------------- D. phase lines
def test_phases():
    rows = []
    p, stretches = pdist.load_points()
    zs = sorted(z for z, g in p.groupby("zone") if g.division.nunique() >= pdist.MIN_DIVISIONS)
    means = {z: p[p.zone == z].groupby("division").y.mean() for z in zs}
    for a, b in zip(zs, zs[1:]):
        if b != a + 1:
            continue
        both = means[a].index.intersection(means[b].index)
        x, y = means[a][both].values, means[b][both].values
        d = y - x
        w = wilcoxon(d)
        boots = [np.median(rng.choice(d, len(d))) for _ in range(N_BOOT)]
        line = stretches[b].split("-")[0]
        rows.append({"family": "D", "test": f"Front shifted north-south at line {line}", "statistic": "median shift per division (km, + north)",
                     "estimate": round(float(np.median(d)), 1), "null_median": 0.0, "p": float(w.pvalue), "n": len(d),
                     "detail": f"Wilcoxon signed-rank, paired by division; 95% bootstrap CI {ci(boots)} km"})
        rho = spearmanr(x, y).statistic
        null = [spearmanr(x, rng.permutation(y)).statistic for _ in range(N_PERM)]
        rows.append({"family": "D", "test": f"Divisions kept their north-south order at line {line}", "statistic": "Spearman rho",
                     "estimate": round(float(rho), 2), "null_median": round(float(np.median(null)), 2),
                     "p": perm_p(rho, null, smaller_is_extreme=False), "n": len(d), "detail": f"{N_PERM} permutations"})
        print(f"  D line {line}: shift {np.median(d):.0f} km p={w.pvalue:.4f}; rho {rho:.2f}")
    return rows, stability_phase(p, stretches, zs)


def stability_phase(p, stretches, zs):
    """Descriptive: bootstrap the checkpoint groups (Jaccard) and the natural-break positions (95% intervals)."""
    notes = []
    cr = pd.read_csv(ROOT / "analysis" / "phase_checkpoints" / "crossings.csv").dropna(subset=["group"])
    for L, df in cr.groupby("line"):
        X = df[["along", "day"]].values
        X = (X - X.mean(axis=0)) / X.std(axis=0)
        k = df.group.nunique()
        _, jac = stability(X, k)
        notes.append(f"Checkpoint groups at line {L} (k = {k}): bootstrap Jaccard {', '.join(f'{v:.2f}' for v in jac.values())}")
    lines = pc.phase_lines()
    for z in zs:
        g = p[p.zone == z]
        bands, breaks, _, _, _ = pdist.stretch_bands(g, z, lines, stretches[z])
        t = pdist.position(g.x.values, g.y.values, z, lines)
        scale = 100 if bands[0]["unit"] == "%" else 1
        idx = list(g.groupby("division").indices.values())  # row positions of each division
        boot = []
        for _ in range(max(20, N_BOOT // 3)):  # Jenks is the slow step
            rows = np.concatenate([idx[i] for i in rng.choice(len(idx), len(idx))])
            boot.append(pdist.jenks(t[rows], g.w.values[rows], len(bands))[0])
        boot = np.array(boot) * scale
        notes.append(f"Natural breaks across {stretches[z]} ({len(bands)} bands): " + "; ".join(
            f"{b} {bands[0]['unit']} (95% {np.percentile(boot[:, i], 2.5):.0f} to {np.percentile(boot[:, i], 97.5):.0f})" for i, b in enumerate(breaks)))
    for n in notes:
        print("  " + n)
    return notes


# ---------------------------------------------------------------- write-up
def fmt_p(p):
    return "< 0.001" if p < 0.001 else f"{p:.3f}"


def write_md(res, gaps, notes, f):
    plan = res[res.family == "A"]
    cmd = res[res.family == "B"]
    clu = res[res.family == "C"]
    ph = res[res.family == "D"]
    sig = lambda r: "significant" if r.p_holm < 0.05 else "not significant"
    table = lambda d: "\n".join(f"| {r.test} | {r.statistic} | {r.estimate} | {r.null_median} | {fmt_p(r.p)} | {fmt_p(r.p_holm)} | {r.n} |"
                                for r in d.itertuples())
    head = "| Test | Statistic | Observed | Expected by chance | p | p (Holm) | n |\n|---|---|---|---|---|---|---|"
    summary = []
    for r in plan.itertuples():
        summary.append(f"- **{r.test.split(' — ')[1]}**: the realized groups run on average **{r.estimate} km** from the planned lines, "
                       f"against **{r.null_median} km** for groups of the same divisions picked at random — {sig(r)} (p {fmt_p(r.p_holm)} after correction).")
    for r in cmd.itertuples():
        summary.append(f"- **{r.test.split(' — ')[1]}** and the planned formations: association **V = {r.estimate}** "
                       f"({'strong' if r.estimate >= 0.5 else 'moderate' if r.estimate >= 0.3 else 'weak'}), {sig(r)}.")
    shifts = ph[ph.test.str.startswith("Front")]
    orders = ph[ph.test.str.startswith("Divisions")]
    summary.append(f"- **Phase lines**: the front's north–south position shifted significantly at "
                   f"{', '.join(r.test[-1] for r in shifts.itertuples() if r.p_holm < 0.05) or 'no line'}; divisions kept their order at "
                   f"{', '.join(r.test[-1] for r in orders.itertuples() if r.p_holm < 0.05) or 'no line'} (ρ {', '.join(str(r.estimate) for r in orders.itertuples())}).")
    gap_lines = "\n".join(f"**{name}**\n\n| k | gap | s.e. | silhouette | silhouette, structureless data | p |\n|---|---|---|---|---|---|\n" + "\n".join(
        f"| {int(r.k)} | {r.gap:.3f} | {r.s:.3f} | {r.silhouette:.2f} | {r.sil_null_median:.2f} | {fmt_p(r.sil_p)} |" for r in g.itertuples())
        for name, g in gaps.items())
    md = f"""# Statistics for the Frontier analyses

Generated by `python analysis/significance.py` (seeded, so a re-run reproduces every number). Raw results:
`analysis/significance/results.csv`. Permutations: {N_PLAN} for the plan comparison, {N_PERM} elsewhere; bootstrap resamples: {N_BOOT}.

## In plain words
{chr(10).join(summary)}
{chr(10).join(f"- **How many clusters ({name})**: silhouette is highest at k = {int(g.loc[g.silhouette.idxmax(), 'k'])}; the gap statistic picks "
              f"k = {next((int(r.k) for r, nxt in zip(g.itertuples(), g.iloc[1:].itertuples()) if r.gap >= nxt.gap - nxt.s), int(g.k.iloc[-1]))}. "
              "The two criteria disagree, so the count is a modelling choice to be reported as one, with the stability of each group (C)." for name, g in gaps.items())}

Significance means: a pattern this strong would rarely appear if the thing tested were absent (p < 0.05 after the Holm
correction for running {len(res)} tests together). It does not mean the effect is large; the effect sizes and intervals do that.

## A. Are the realized groups closer to the planned lines than chance?
**What it measures.** For each grouping, every planned AGS line of advance is paired with the realized group whose average
path is closest (least total Fréchet distance), and the gap between them is averaged along the planned line (every 10 km).
**Null hypothesis.** The groups carry no information about where divisions went relative to the plan: the same divisions
in groups of the same sizes, assigned at random, would match the planned lines as well. **Test.** Permutation test:
divisions shuffled between groups {N_PLAN} times; each time the average paths, the pairing and the gap are recomputed.
p = share of random groupings at least as close as observed (one-sided). The bearing difference is reported alongside.

{head}
{table(plan)}

{chr(10).join(f"- {r.test.split(' — ')[1]}: {r.detail}" for r in plan.itertuples())}

The reader scores in the app (0–100 for direction, route and destination) are descriptive cut-offs tied to the 20 km /
10° mapping-error band; they are not tests. This permutation test is the test.

## B. Do the groups follow the planned formations?
**What it measures.** Whether divisions of the same planned formation (6th Army, III Panzer Corps, Panzer Group 1 less III
Corps, 17th Army; from the researched unit roster, {int(cmd.n.iloc[0])}–{int(cmd.n.max())} identified divisions) fall in the same group.
**Statistic.** Cramér's V (0 = no association, 1 = groups are the formations) and the adjusted Rand index (0 = chance
agreement). **Test.** Exact permutation test of the chi-square statistic ({N_PERM} shuffles of the formation labels), valid
with the small cell counts here where the chi-square approximation is not.

{head}
{table(cmd)}

{chr(10).join(f"- {r.test.split(' — ')[1]}: {r.detail}" for r in cmd.itertuples())}

## C. Are the clusters real, and how many are there?
**What it measures.** Whether the directional-vector groups (k-means on each path's end point and centre) are tighter than
k-means would find in data with no groups at all, and whether each group survives resampling. **Tests.** (1) Silhouette
against {N_REF} structureless reference data sets drawn uniformly over the same range (one-sided p). (2) Gap statistic
(Tibshirani et al. 2001): the smallest k with Gap(k) ≥ Gap(k+1) − s(k+1). (3) Bootstrap stability (Hennig 2007): mean Jaccard
overlap of each group with its best match after resampling the divisions {N_BOOT} times.

{head}
{table(clu)}

{chr(10).join(f"- {r.test.split(' — ')[1]}: {r.detail}" for r in clu.itertuples())}

{gap_lines}

## D. Phase lines
**Shift.** Each division's average north–south position in the stretch before a phase line and in the stretch after it,
paired by division; Wilcoxon signed-rank test of the paired differences (median shift with a 95% bootstrap interval).
This replaces the two-sample Kolmogorov–Smirnov p-values shown earlier, which assumed independent samples.
**Order.** Spearman rank correlation of the same paired positions; permutation p ({N_PERM} shuffles). ρ near 1 = divisions
kept their places along the front.

{head}
{table(ph)}

{chr(10).join(f"- {r.test}: {r.detail}" for r in ph.itertuples())}

**Natural breaks between the phase lines.** In each stretch, every division location's position across it (% of the way
from the western phase line to the eastern one, at its latitude; km west of line A in the first stretch) is split by
weighted Jenks natural breaks into the fewest bands (2–5) with goodness of variance fit ≥ 0.8. Divisions are resampled
({max(20, N_BOOT // 3)} times) for a 95% interval on each break.

**Stability (descriptive).**
{chr(10).join(f"- {n}" for n in notes)}

## Limits — please keep with the results
- **Small n.** 44–51 divisions; tests have little power, so "not significant" is weak evidence of no effect.
- **Divisions are not independent.** Divisions of one corps moved together by order, so the effective sample is smaller
  than the count; permutation tests that shuffle single divisions can overstate significance. Treat p-values near 0.05 with
  caution.
- **Positions are autocorrelated** day to day; that is why the phase tests use one average position per division per stretch.
- **Inputs carry error.** Hand-drawn planned lines (±5–10 km), georeferencing (3–40 km), position merging (~17 km). Gaps
  under ~20 km cannot be told apart from zero.
- **Unknown formation for {int((f.Group.map(lambda g: next((u for u, t in c.PLANNED_UNIT.items() if t(g)), None)).isna()).sum())} of {len(f)} divisions**,
  excluded from B.
- **Choices that are not tests.** The number of clusters, the 200 km "stayed behind" cut, the 50 km corridor and the score
  cut-offs are modelling or presentation choices; C reports how well the data support the cluster count.
- **Multiple testing.** Holm-adjusted p-values are given for the {len(res)} tests above; the bearing and adjusted-Rand
  p-values in the notes are supporting detail and are not corrected.
"""
    (ROOT / "analysis" / "STATISTICS.md").write_text(md, encoding="utf8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    f = c.formations()
    flines = c.formation_lines()
    c.advancing_clusters(f, flines)  # adds f["DV4"]
    planned = c.planned_lines()
    print("A. planned vs actual")
    rows = test_plan(f, flines, planned)
    print("B. chain of command")
    rows += test_command(f)
    print("C. clusters")
    r, gaps = test_clusters(flines)
    rows += r
    print("D. phase lines")
    r, notes = test_phases()
    rows += r
    res = pd.DataFrame(rows)
    res["p_holm"] = holm(res.p.values)
    res.to_csv(OUT / "results.csv", index=False)
    write_md(res, gaps, notes, f)
    print(f"\n{res[['test', 'estimate', 'p', 'p_holm']].to_string(index=False)}\n\nwrote {OUT} and analysis/STATISTICS.md in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
