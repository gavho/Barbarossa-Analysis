"""Write Statistics.html (repo root, next to Barbarossa.html): the significance results for non-technical readers.

Each question gets a plain answer first, then the numbers with a verdict per row, then a fold-out "How this was worked
out" with the method, the null hypothesis and the test. A glossary defines every term; the limits close the page.
Reads what significance.py saved (analysis/significance/results.csv, gaps.csv, notes.json) and the descriptive outputs
(phase_distributions/natural_breaks.csv, figures/arrival/arrival.csv, loa_frontier/substretch.csv,
phase_checkpoints/entropy.csv), so the page can be rebuilt in a second without re-running the tests.
significance.py calls this at the end; on its own: python analysis/stats_page.py
"""
import json
import re
from datetime import date
from html import escape
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SIG = ROOT / "analysis" / "significance"
OUT = ROOT / "Statistics.html"
ALPHA = 0.05


# ---------------------------------------------------------------- wording
def p_text(p):
    return "below 0.001" if p < 0.001 else f"{p:.3f}"


def chip(ok, yes="Significant", no="Not significant"):
    return f'<span class="chip {"ok" if ok else "no"}">{yes if ok else no}</span>'


def strength_v(v):
    return "strong" if v >= 0.5 else "moderate" if v >= 0.3 else "weak"


def strength_rho(r):
    return "very strong" if r >= 0.8 else "strong" if r >= 0.6 else "moderate" if r >= 0.4 else "weak"


def jaccard_word(j):
    return "stable" if j >= 0.75 else "a real pattern, less sharp" if j >= 0.6 else "weak" if j >= 0.5 else "dissolves"


def separation(s):
    return "clearly separate" if s >= 0.5 else "fairly separate" if s >= 0.25 else "overlapping"


def name_of(test):
    return test.split(" — ")[1] if " — " in test else test


def as_close(p, n):
    """How many of n random tries were at least as extreme, from a permutation p = (count + 1) / (n + 1)."""
    k = max(0, round(p * (n + 1)) - 1)
    return f"none of the {n:,} random groupings" if k == 0 else f"{k:,} of {n:,} random groupings"


# ---------------------------------------------------------------- small graphics (inline SVG / CSS)
def compare_bars(obs, null, unit="km", obs_label="Found groups", null_label="Random groups"):
    top = max(obs, null) * 1.1
    bar = lambda v, cls, label: (f'<div class="bar-row"><span class="bar-label">{label}</span>'
                                 f'<span class="bar"><span class="{cls}" style="width:{100 * v / top:.1f}%"></span></span>'
                                 f'<b class="mono">{v:g} {unit}</b></div>')
    return f'<div class="bars">{bar(obs, "fill-obs", obs_label)}{bar(null, "fill-null", null_label)}</div>'


def shift_chart(rows):
    """One row per phase line: median shift (dot) with its 95% interval (line); zero = no shift."""
    vals = [(r["line"], r["est"], r["lo"], r["hi"], r["sig"]) for r in rows]
    lo_all = min(v[2] for v in vals) - 10
    hi_all = max(max(v[3] for v in vals), 0) + 10
    W, H, left, right = 560, 34 * len(vals) + 34, 70, 20
    x = lambda v: left + (v - lo_all) / (hi_all - lo_all) * (W - left - right)
    out = [f'<svg viewBox="0 0 {W} {H}" class="chart" role="img" aria-label="Median north-south shift at each phase line with 95% intervals">',
           f'<line x1="{x(0):.1f}" x2="{x(0):.1f}" y1="6" y2="{H - 24}" class="zero"/>',
           f'<text x="{x(0):.1f}" y="{H - 8}" class="tick" text-anchor="middle">no shift</text>',
           f'<text x="{x(lo_all + 5):.1f}" y="{H - 8}" class="tick">← further south</text>']
    for i, (line, est, lo, hi, sig) in enumerate(vals):
        y = 22 + 34 * i
        cls = "sig" if sig else "nosig"
        out += [f'<text x="8" y="{y + 4}" class="lab">Phase {line}</text>',
                f'<line x1="{x(lo):.1f}" x2="{x(hi):.1f}" y1="{y}" y2="{y}" class="ci {cls}"/>',
                f'<circle cx="{x(est):.1f}" cy="{y}" r="5" class="dot {cls}"/>',
                f'<text x="{x(est):.1f}" y="{y - 9}" class="val" text-anchor="middle">{est:+.0f} km</text>']
    return "\n".join(out + ["</svg>"])


def bands_chart(nb, intervals):
    """One stacked bar per stretch: the natural-break bands, shaded by share of division-days, with each break's 95%
    interval as a translucent strip. Interior stretches run 0-100% of the way between the two phase lines."""
    out = []
    for stretch, g in nb.groupby("stretch", sort=False):
        lo, hi = g["from"].min(), g["to"].max()
        pos = lambda v: 100 * (v - lo) / (hi - lo)
        segs = "".join(
            f'<span class="band" style="left:{pos(r["from"]):.1f}%;width:{pos(r["to"]) - pos(r["from"]):.1f}%;'
            f'--a:{min(max((r["share"] - 15) / 35, 0.08), 1):.2f}" title="{escape(r["band"])}: {r["share"]}% of division-days">'
            f'<span class="band-text">{escape(r["band"])}<b>{r["share"]}%</b></span></span>' for _, r in g.iterrows())
        ivs = "".join(f'<span class="iv" style="left:{pos(a):.1f}%;width:{max(pos(b) - pos(a), 0.6):.1f}%" title="95% range of this break: {a} to {b} {g.unit.iloc[0]}"></span>'
                      for _, a, b in intervals.get(stretch, []))
        unit = g.unit.iloc[0]
        ends = (f"{lo} km", "phase 1") if unit == "km" else (f"phase {stretch.split('-')[0]}", f"phase {stretch.split('-')[1]}")
        out.append(f'<div class="stretch"><div class="stretch-name">{escape(stretch.replace("-", " → "))}</div>'
                   f'<div class="track">{segs}{ivs}</div><div class="ends"><span>{ends[0]}</span><span>{ends[1]}</span></div></div>')
    return "\n".join(out)


def table(head, rows):
    th = "".join(f"<th>{h}</th>" for h in head)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="table-wrap"><table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table></div>'


def how(*paras):
    return '<details class="how"><summary>How this was worked out</summary>' + "".join(f"<p>{p}</p>" for p in paras) + "</details>"


# ---------------------------------------------------------------- page
def build(res, gaps, meta, nb, extra):
    n_plan, n_perm, n_boot, n_ref = meta["n_plan"], meta["n_perm"], meta["n_boot"], meta["n_ref"]
    fam = {f: res[res.family == f] for f in "ABCDE"}
    sig = lambda r: r.p_holm < ALPHA
    notes = meta["notes"]

    # A. plan vs actual
    A_rows, A_cards = [], []
    for r in fam["A"].itertuples():
        bearing = re.search(r"bearing diff ([\d.]+)° vs null median ([\d.]+)° \(p = ([\d.]+)\)", r.detail)
        A_rows.append([escape(name_of(r.test)), f"<b>{r.estimate:g} km</b>", f"{r.null_median:g} km", p_text(r.p_holm), chip(sig(r))])
        A_cards.append(f'<div class="card"><h4>{escape(name_of(r.test))}</h4>{compare_bars(r.estimate, r.null_median)}'
                       f'<p>The groups the computer found ran on average <b>{r.estimate:g} km</b> from the planned lines; the same divisions '
                       f'shuffled into random groups ran <b>{r.null_median:g} km</b> away. In {n_plan:,} tries, {as_close(r.p, n_plan)} came as close.'
                       + (f' Directions agree about as well as random groups do ({bearing[1]}° off the plan vs {bearing[2]}°), because '
                          f'every division advanced roughly eastward; the real difference is <i>where</i> the groups went.' if bearing else "")
                       + "</p></div>")
    A_ok = all(sig(r) for r in fam["A"].itertuples())

    # B. formations
    B_rows, B_text = [], []
    for r in fam["B"].itertuples():
        ari = re.search(r"adjusted Rand ([\d.-]+) \(p = ([\d.]+)\)", r.detail)
        B_rows.append([escape(name_of(r.test)), f"<b>{r.estimate:g}</b> ({strength_v(r.estimate)})", f"{r.null_median:g}",
                       ari[1] if ari else "–", p_text(r.p_holm), chip(sig(r))])
        B_text.append(f"<li><b>{escape(name_of(r.test))}</b>: {strength_v(r.estimate)} link to the planned formations"
                      f"{'' if sig(r) else ', but not clear enough to rule out chance'} (V = {r.estimate:g}; random labels give about {r.null_median:g}).</li>")
    B_n = int(fam["B"].n.iloc[0])

    # C. clusters
    C_rows, C_text = [], []
    for r in fam["C"].itertuples():
        jac = [float(v) for v in re.search(r"Jaccard per group ([\d., ]+)", r.detail)[1].split(", ")]
        gap_k = re.search(r"gap statistic picks k = (\d+)", r.detail)[1]
        label = name_of(r.test)
        C_rows.append([escape(label), f"<b>{r.estimate:g}</b> ({separation(r.estimate)})", f"{r.null_median:g}", p_text(r.p_holm), chip(sig(r)),
                       " ".join(f'<span class="pill {"good" if j >= 0.75 else "mid" if j >= 0.6 else "bad"}">{j:.2f}</span>' for j in jac)])
        g = gaps[gaps.clustering == label.split(", ", 1)[1]] if ", " in label else gaps.iloc[:0]
        best_sil = int(g.loc[g.silhouette.idxmax(), "k"]) if len(g) else None
        C_text.append(f"<li><b>{escape(label)}</b>: the groups are {separation(r.estimate)} (silhouette {r.estimate:g}, against about "
                      f"{r.null_median:g} in made-up data with no groups). {sum(j >= 0.75 for j in jac)} of {len(jac)} groups are stable when the "
                      f"divisions are resampled. The best number of groups depends on the yardstick: {best_sil} by silhouette, {gap_k} by the gap statistic.</li>")
    gap_tables = "".join(
        f"<h4>{escape(name)}</h4>" + table(["Groups (k)", "Gap", "± s.e.", "Silhouette", "Silhouette, made-up data", "p"],
                                          [[int(r.k), f"{r.gap:.3f}", f"{r.s:.3f}", f"{r.silhouette:.2f}", f"{r.sil_null_median:.2f}", p_text(r.sil_p)]
                                           for r in g.itertuples()]) for name, g in gaps.groupby("clustering", sort=False))

    # D. phase lines
    shifts = [r for r in fam["D"].itertuples() if r.test.startswith("Front")]
    orders = [r for r in fam["D"].itertuples() if r.test.startswith("Divisions")]
    D_shift = []
    for r in shifts:
        lo, hi = (float(v) for v in re.search(r"CI (-?[\d.]+) to (-?[\d.]+)", r.detail).groups())
        D_shift.append({"line": r.test[-1], "est": r.estimate, "lo": lo, "hi": hi, "sig": sig(r), "p": r.p_holm, "n": r.n})
    D_rows = [[f"Phase {d['line']}", f"<b>{abs(d['est']):.0f} km {'south' if d['est'] < 0 else 'north'}</b>",
               f"{abs(d['hi']):.0f}–{abs(d['lo']):.0f} km" if d["hi"] < 0 else f"{d['lo']:.0f} to {d['hi']:.0f} km",
               d["n"], p_text(d["p"]), chip(d["sig"])] for d in D_shift]
    O_rows = [[f"Phase {r.test[-1]}", f"<b>{r.estimate:g}</b> ({strength_rho(r.estimate)})", r.n, p_text(r.p_holm), chip(sig(r))] for r in orders]
    sig_lines = [d["line"] for d in D_shift if d["sig"]]
    unclear = [d for d in D_shift if not d["sig"]]
    unclear_txt = "".join(
        f" At phase {d['line']} most divisions did move south (median {abs(d['est']):.0f} km), but a minority moved a long way north, "
        "so the test, which weighs how far each division moved, cannot rule out chance." for d in unclear)

    # natural breaks
    intervals = {n["label"]: n["values"] for n in notes if n["kind"] == "breaks"}
    checkpoints = [n for n in notes if n["kind"] == "checkpoint"]
    CP_rows = [[escape(n["label"][:1].upper() + n["label"][1:]), " ".join(f'<span class="pill {"good" if j >= 0.75 else "mid" if j >= 0.6 else "bad"}">{j:.2f}</span>' for j in n["values"]),
                f"{sum(j >= 0.75 for j in n['values'])} of {len(n['values'])} stable"] for n in checkpoints]
    NB_rows = [[escape(k.replace("-", " → ")), "; ".join(f"{b} {u} <span class=muted>({lo} to {hi})</span>" for b, lo, hi in v)]
               for k, v, u in ((n["label"], n["values"], n["unit"]) for n in notes if n["kind"] == "breaks")]

    # E. planned dates
    E_rows = [[f"Phase {r.test.split('phase ')[1].split()[0]}", f"<b>{r.estimate:.0%}</b>", f"{r.null_median:.0%}", r.n, p_text(r.p_holm), chip(sig(r))]
              for r in fam["E"].itertuples()]
    E_sig = [r.test.split("phase ")[1].split()[0] for r in fam["E"].itertuples() if sig(r)]
    arr, jsum, sub, ent = extra["arrival"], extra["jenks"], extra["substretch"], extra["entropy"]
    W_rows = [[f"Phase {r.phase} ({pd.Timestamp(r.date):%d %b})", f"{arr.set_index('phase').arrived_pct[int(r.phase)]}%", r.bins,
               f"{r.past}%", f"{r.straddling}%", f"{r.behind}%"] for r in jsum.itertuples()]
    names = {"6A": "6th Army", "III PzKo": "III Panzer Corps", "PzGp1(-)": "Panzer Group 1 (less III Corps)", "17A": "17th Army"}
    turn = lambda bd: "on course" if abs(bd) <= 5 else f"{abs(bd)}° further {'south' if bd > 0 else 'north'}"
    S_rows = [[f"{names[r.planned]}, phases {r.stretch.replace('-', ' → ')}", turn(int(r.straight_bearing_diff)), r.score_direction,
               f"{round(r.mean_abs_offset_km)} km", f"{r.end_gap_km} km"] for r in sub.itertuples()]
    mixed = ent.dropna(subset=["entropy"]).query("divisions >= 5")
    M_rows = [[("Start" if ph == "Start" else f"Phase {ph}"),
               "; ".join(f"{g.sector} ({g.divisions} div.) <b>{g.entropy:.1f}</b>" for g in grp.itertuples())]
              for ph, grp in mixed.groupby("phase", sort=False)]

    glance = [
        ("Are the computer's groups closer to the planned routes than chance?", "Yes" if A_ok else "Partly", A_ok,
         f"{fam['A'].estimate.min():g}–{fam['A'].estimate.max():g} km from the plan vs {fam['A'].null_median.min():g}–{fam['A'].null_median.max():g} km for random groups.", "plan"),
        ("Do the groups follow the planned armies and corps?", "Partly", None,
         "Yes for the directional-vector groups; not clear for the geometric groups.", "formations"),
        ("Are the groups real, and how many are there?", "Yes — the number is a choice", None,
         "Tighter than made-up data with no groups; different yardsticks favour 2–3 or 5–6 groups.", "clusters"),
        ("Did the front shift north or south at each phase line?",
         "Yes at " + ", ".join(sig_lines) if sig_lines else "No clear shift", bool(sig_lines) and not unclear,
         "Southward at every phase; " + (f"not clear enough at phase {', '.join(d['line'] for d in unclear)}." if unclear else "all clear."), "shift"),
        ("Did divisions keep their places in the line?", "Yes" if all(sig(r) for r in orders) else "Mostly", all(sig(r) for r in orders),
         f"Order kept at every line (ρ {min(r.estimate for r in orders):g}–{max(r.estimate for r in orders):g}).", "order"),
        ("Where did divisions bunch between phase lines?", "Described, not tested", None,
         "Natural breaks show where divisions slowed; their positions are steady when resampled.", "bunching"),
        ("On the planned dates, are the natural breaks real gaps?", ("Only at phase " + ", ".join(E_sig)) if E_sig else "Not clearly",
         None if E_sig else False,
         "Jenks always finds breaks; on most dates randomly scattered divisions would leave gaps as wide.", "dates"),
    ]
    glance_html = "".join(
        f'<a class="glance" href="#{a}"><span class="q">{q}</span><span class="verdict {"ok" if ok else "no" if ok is False else "mid"}">{v}</span>'
        f'<span class="g-sub">{s}</span></a>' for q, v, ok, s, a in glance)

    glossary = [
        ("p-value", "How often a pattern at least this strong would turn up by chance if the thing being tested were not there. "
                    "Small = unlikely to be luck. It does not say how big or important the effect is."),
        ("Significant", f"A p-value below {ALPHA} after the Holm correction: by the usual research convention, the pattern is unlikely to be chance."),
        ("Holm correction", f"Running {len(res)} tests makes a lucky result more likely somewhere. The Holm method raises each p-value to allow for "
                            "this; the page reports the corrected values."),
        ("Permutation test", "Shuffle the labels many times (for example, put divisions into random groups) and see how often the shuffled data "
                             "match as well as the real data. The share of shuffles that do is the p-value. It makes no assumptions about bell curves."),
        ("Null hypothesis", "The 'nothing is going on' explanation the test tries to rule out, such as 'the groups are no closer to the plan than random groups'."),
        ("Bootstrap / 95% interval", "Re-draw the divisions at random, with replacement, hundreds of times and redo the calculation each time. "
                                     "The middle 95% of the results is the range the number would plausibly fall in with a different sample."),
        ("Fréchet distance", "The distance between two routes, like the shortest leash that lets a person walk one route and a dog the other, "
                             "both only moving forward. Used to pair each planned line with its nearest group."),
        ("Mean route gap", "The average distance between a planned line and its paired group's average path, measured every 10 km along the planned line."),
        ("Cramér's V", "How strongly two groupings go together, from 0 (unrelated) to 1 (identical). Here: the computer's groups and the planned "
                       "formations. Above 0.5 is strong."),
        ("Adjusted Rand index", "Another measure of agreement between two groupings: 0 = no better than chance, 1 = identical."),
        ("Silhouette", "How well each division fits its own group compared with the next-nearest group, from −1 to 1. Above 0.5 = clearly separate "
                       "groups; 0.25–0.5 = fairly separate."),
        ("Gap statistic", "Compares how tight the groups are with groups found in made-up data that has no groups at all, for each possible number "
                          "of groups; picks the smallest number after which adding groups stops helping."),
        ("Made-up data with no groups", f"Sets of random points spread evenly over the same area ({n_perm // 10:,} for the tested number of groups, {n_ref} for each other number), used as the 'no real groups' benchmark."),
        ("Jaccard stability", "Resample the divisions, regroup, and measure how much each group overlaps its best match (0–1). "
                              "0.75 or more = stable; 0.6–0.75 = a real pattern but less sharp; below 0.5 = falls apart."),
        ("Wilcoxon signed-rank test", "Compares each division's position before and after a line, one pair per division, and asks whether the "
                                      "moves lean one way more than chance would allow. Bigger moves count for more."),
        ("Median shift", "The middle value of the divisions' north–south moves at a line: half moved more, half less."),
        ("Spearman's ρ (rho)", "Whether divisions kept their order from north to south, from −1 (completely reversed) to 1 (same order). "
                               "Above 0.8 = very strong."),
        ("Jenks natural breaks", "Splits values into groups so each group is as tight as possible. Here the breaks fall where few division-days "
                                 "were spent, i.e. ground the divisions crossed quickly."),
        ("Goodness of variance fit", "How much of the spread the natural-break bands explain (0–1). The stretch bands use the fewest bands "
                                     "reaching 0.8, the planned-date bins the fewest reaching 0.9. A high fit alone does not show clumps: "
                                     "randomly scattered points reach about 0.95 with four bins."),
        ("Past / on the line / short", "A natural-break bin read against the phase line: every division in it past the line, some past and some short of it, or none past it."),
        ("10 km rule", "A division counts as having reached a phase line if it is past it or within 10 km of it on the planned date."),
        ("Mix (normalized entropy)", "How mixed a group is by planned formation, from 0 (one formation only) to 1 (all four in equal numbers). "
                                     "Divisions of unknown formation are left out."),
        ("Division-days", "One division at one place for one day, weighted by strength (a one-tenth detachment counts a tenth)."),
    ]

    css = CSS
    today = date.today().isoformat()
    quick = '<p class="warn">Quick run: fewer permutations than the published numbers. Re-run without --quick.</p>' if meta.get("quick") else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Statistics · Operation Barbarossa</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>{css}</style>
</head>
<body>
<header class="top"><a href="Barbarossa.html" class="back">← Back to the map</a><span class="brand">Operation Barbarossa · Digital Analysis</span></header>
<main>
<section class="hero">
<p class="eyebrow">Frontier Breakthrough · Army Group South</p>
<h1>The statistics, explained</h1>
<p class="lead">The map shows patterns: groups of divisions, gaps from the planned routes, shifts at the phase lines. This page asks of each
pattern: <b>could it be a coincidence?</b> Each question starts with a plain answer, then the numbers, then a fold-out explaining how it
was worked out. Every term is defined in the <a href="#glossary">glossary</a>.</p>
{quick}
</section>

<section><h2>At a glance</h2><div class="glance-grid">{glance_html}</div>
<p class="note">"Significant" means a pattern this strong would turn up by chance less than 1 time in 20, after allowing for running
{len(res)} tests at once. It says the pattern is real, not that it is large; the numbers and ranges say how large.</p></section>

<section id="plan"><h2><span class="tag">A</span>Are the groups closer to the planned routes than chance?</h2>
<p class="answer"><b>{"Yes." if A_ok else "Not clearly."}</b> The groups of divisions found from their movements follow the planned AGS
lines of advance much more closely than the same divisions put into random groups.</p>
<div class="cards">{"".join(A_cards)}</div>
{table(["Grouping", "Gap from plan", "Random groups", "p (corrected)", ""], A_rows)}
{how(f"Each planned line of advance (digitized from a planning map, ±5–10 km) is paired with the group whose average path is nearest "
     f"overall (least total Fréchet distance, one group per line). The gap between them is measured every 10 km along the planned line and averaged.",
     f"<b>Null hypothesis:</b> the groups tell us nothing about where divisions went relative to the plan. <b>Test:</b> permutation test — the "
     f"divisions were shuffled between groups of the same sizes {n_plan:,} times, and each time the average paths, the pairing and the gap were "
     f"recomputed. The p-value is the share of shuffles at least as close as the real groups.",
     "The 0–100 scores on the app's plan cards are reading aids tied to the ~20 km mapping error; they are not tests. This is the test.")}
</section>

<section id="formations"><h2><span class="tag">B</span>Do the groups follow the planned armies and corps?</h2>
<p class="answer"><b>Partly.</b> Divisions of the same planned formation tend to end up in the same group:</p>
<ul class="answers">{"".join(B_text)}</ul>
{table(["Grouping", "Cramér's V", "Random labels", "Adjusted Rand", "p (corrected)", ""], B_rows)}
{how(f"Each division's planned formation (6th Army, III Panzer Corps, Panzer Group 1 without III Corps, 17th Army) comes from the researched "
     f"unit roster; {B_n} divisions could be identified ({meta['unknown_formation']} could not and are left out). A table counts how many "
     f"divisions of each formation fell in each group.",
     f"<b>Null hypothesis:</b> group and formation are unrelated. <b>Test:</b> exact permutation test — the formation labels were shuffled "
     f"{n_perm:,} times; the p-value is the share of shuffles with as strong an association. This is valid with the small counts here, where "
     f"the usual chi-square formula is not.")}
</section>

<section id="clusters"><h2><span class="tag">C</span>Are the groups real, and how many are there?</h2>
<p class="answer"><b>The groups are real; the number of groups is a choice.</b></p>
<ul class="answers">{"".join(C_text)}</ul>
{table(["Grouping", "Silhouette", "Made-up data", "p (corrected)", "", "Stability of each group"], C_rows)}
<p class="note">Stability: <span class="pill good">0.75+</span> stable · <span class="pill mid">0.60–0.75</span> a pattern, less sharp ·
<span class="pill bad">below 0.60</span> weak.</p>
{how(f"The directional-vector groups come from k-means on each division's end point and the centre of its path. "
     f"<b>Are they real?</b> The silhouette of the real groups was compared with {n_perm // 10:,} made-up data sets with no groups, spread evenly over "
     f"the same area (null hypothesis: no grouping structure). <b>How many?</b> The gap statistic (Tibshirani et al. 2001) and the silhouette "
     f"were computed for 2–6 groups. <b>Stable?</b> The divisions were resampled {n_boot} times and regrouped; each group's overlap with its "
     f"best match is its Jaccard stability (Hennig 2007).",
     "The silhouette favours few groups and the gap statistic more, so the data do not settle the number: the published 5 and the "
     "one-per-line 4 (which sets aside divisions that moved under 200 km) are both defensible choices, to be reported as choices.",
     gap_tables)}
</section>

<section id="shift"><h2><span class="tag">D</span>Did the front shift at each phase line?</h2>
<p class="answer"><b>{"Yes at line" + ("s " if len(sig_lines) > 1 else " ") + ", ".join(sig_lines) if sig_lines else "No clear shift"}.</b>
After crossing each line, the weight of the advance sat further south than before.{unclear_txt}</p>
<div class="card wide">{shift_chart(D_shift)}<p class="chart-note">Dot = median shift of the divisions; line = 95% range.
Blue = significant; grey = not clear enough to rule out chance.</p></div>
{table(["Line", "Median shift", "95% range", "Divisions", "p (corrected)", ""], D_rows)}
{how("For each division, its average north–south position in the stretch before a phase line and in the stretch after it. One pair per "
     "division, so the same division is compared with itself.",
     f"<b>Null hypothesis:</b> no consistent north–south shift. <b>Test:</b> Wilcoxon signed-rank test on the paired differences; the 95% range "
     f"of the median shift is a bootstrap interval ({n_boot} resamples).")}
</section>

<section id="order"><h2><span class="tag">D</span>Did divisions keep their places in the line?</h2>
<p class="answer"><b>{"Yes, at every line." if all(sig(r) for r in orders) else "Mostly."}</b> A division in the north of the line before a phase
line was still in the north after it, and so on down the line, even as the whole front shifted.</p>
{table(["Line", "Spearman's ρ", "Divisions", "p (corrected)", ""], O_rows)}
{how("The same paired positions as above, ranked north to south before and after each line.",
     f"<b>Null hypothesis:</b> the order after a line is unrelated to the order before it. <b>Test:</b> Spearman rank correlation with a "
     f"permutation p-value ({n_perm:,} shuffles).")}
</section>

<section id="bunching"><h2><span class="tag">D</span>Where did divisions bunch between phase lines?</h2>
<p class="answer"><b>This is a description, not a test.</b> In each stretch between two phase lines, the bands show where the divisions
spent their days, measured as how far across the stretch they were. Darker = more division-days, where they slowed or paused; the
breaks between bands are ground they crossed quickly. The thin highlighted strips show how far each break moves when the divisions are
resampled (95% range): narrow strips mean the break is firm.</p>
<div class="card wide">{bands_chart(nb, intervals)}</div>
{table(["Stretch", "Breaks (95% range)"], NB_rows)}
{how("Every daily division location (weighted by strength) gets a position across its stretch: 0% at the western phase line, 100% at the "
     "eastern one, measured at its own latitude (before phase 1: km west of it). Jenks natural breaks split the positions into the fewest "
     "bands (2–5) that explain at least 80% of their spread.",
     f"Divisions were resampled {max(20, n_boot // 3)} times and the breaks recomputed; the 95% range is the middle 95% of those breaks.")}
<h3>Checkpoint groups</h3>
<p>The groups of divisions that crossed each phase line together (the crossing groups in the app's Groups tab), tested the same way:</p>
{table(["Phase line", "Stability of each group", ""], CP_rows)}
</section>

<section id="dates"><h2><span class="tag">E</span>On the planned dates, are the natural breaks real gaps?</h2>
<p class="answer"><b>{("Only at phase " + ", ".join(E_sig) + ".") if E_sig else "Not clearly."}</b> Jenks always finds breaks; the question is
whether they fall in real gaps. On each planned date the share of the stretch left empty at the breaks is compared with the same
measure for divisions scattered at random over the same stretch. {"Elsewhere the" if E_sig else "The"} gaps are no wider than chance
would leave, so the bins there describe where the divisions stood without showing that they formed separate clumps.</p>
{table(["Planned date", "Empty at the breaks", "Random scatter", "Divisions", "p (corrected)", ""], E_rows)}
<p>What the bins show against each phase line (share of divisions in bins that were past, on or short of it), next to the
simpler 10 km rule:</p>
{table(["Phase (date)", "10 km rule", "Bins", "Past", "On the line", "Short"], W_rows)}
{how("On each phase line's planned date, every division is placed on one line: its distance along the general direction of the whole "
     "advance (the bearing from the divisions' average 22 June position to their average last position). Jenks natural breaks cut that line "
     "into the fewest bins that explain at least 90% of the spread; only then is each bin read against the phase line.",
     f"<b>Null hypothesis:</b> the divisions were scattered at random along that stretch. <b>Test:</b> the share of the stretch left empty at the "
     f"breaks (from the last division before each break to the first after it), against {meta['n_perm'] // 10:,} random scatters of as many "
     "positions over the same range, cut into the same number of bins. The goodness of variance fit is no test here: scattered positions "
     "reach about 0.95 with four bins too.",
     "Dates for phases 3–5 read vague planning dates: 22 July for mid-July, 25 July for after mid-July, 30 July for late July.")}
</section>

<section id="described"><h2>Described, not tested</h2>
<p class="answer">Three further results in the app are descriptions: they say what happened, not whether it could be chance.</p>
<h3>Plan agreement between two phase lines</h3>
<p>Two stretches of the planned lines compared on their own (0–100 direction score; 100 within 5° of the plan):</p>
{table(["Stretch", "Heading vs plan", "Direction score", "Average gap", "End gap"], S_rows)}
<h3>How mixed were the groups that crossed each line together?</h3>
<p>Groups of five or more divisions, from 0 (one planned formation) to 1 (all four mixed evenly):</p>
{table(["Line", "Groups (divisions) and mix"], M_rows)}
<h3>Local groups day by day</h3>
<p>On every day, divisions within 30 km of each other (directly or through neighbours) form a local group, followed from day to day
in the Groups tab. The 30 km link is a choice, not an estimate; most groups last a few days.</p>
</section>

<section id="glossary"><h2>Glossary</h2><dl class="glossary">{"".join(f"<dt>{t}</dt><dd>{d}</dd>" for t, d in glossary)}</dl></section>

<section id="limits"><h2>Limits — please keep with the results</h2><ul class="limits">
<li><b>Small numbers.</b> {fam['C'].n.min()}–{fam['C'].n.max()} divisions. With so few, "not significant" is weak evidence that there is no effect.</li>
<li><b>Divisions did not move independently.</b> Divisions of one corps moved together under one order, so there are effectively fewer
independent cases than divisions. Shuffling single divisions can make results look stronger than they are; treat p-values near 0.05 with care.</li>
<li><b>The inputs carry error.</b> Hand-drawn planned lines (±5–10 km), georeferenced maps (3–40 km) and merged positions (~17 km). Gaps under
about 20 km cannot be told apart from zero.</li>
<li><b>Unknown formation for {meta['unknown_formation']} of {meta['divisions']} divisions</b>, left out of question B.</li>
<li><b>Choices that are not tests.</b> The number of groups, the 200 km "stayed behind" cut, the 50 km corridor and the app's 0–100 scores are
modelling or presentation choices. Question C reports how well the data support the number of groups.</li>
<li><b>Several tests at once.</b> The {len(res)} p-values in the tables are corrected (Holm); the supporting numbers (bearing differences,
adjusted Rand) are not.</li>
</ul></section>
</main>
<footer>Generated {today} by <code>analysis/stats_page.py</code> from <code>analysis/significance/</code> (seeded; re-running
<code>python analysis/significance.py</code> reproduces every number). Technical write-up: <code>analysis/STATISTICS.md</code>.</footer>
</body>
</html>
"""


CSS = """
:root { --bg:#0a0a0b; --card:#121315; --muted:#1a1b1e; --border:#2a2b30; --fg:#e4e6e9; --mfg:#8b9099; --primary:#69b9f8;
  --ok:#46a758; --danger:#e5484d; --warn:#ffb224; --display:"Barlow Condensed","Arial Narrow",sans-serif; color-scheme:dark; }
@media (prefers-color-scheme: light) { :root { --bg:#f4f1ea; --card:#fffdf8; --muted:#ece7dc; --border:#d9d1c1; --fg:#1d1b17;
  --mfg:#6a645a; --primary:#1f6fb2; --ok:#2f7d3a; --danger:#b4232a; --warn:#a86b00; color-scheme:light; } }
* { box-sizing:border-box; }
html { background:var(--bg); }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 Inter,system-ui,sans-serif; }
a { color:var(--primary); }
.top { position:sticky; top:0; z-index:5; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 16px;
  background:color-mix(in srgb,var(--bg) 88%,transparent); backdrop-filter:blur(6px); border-bottom:1px solid var(--border); }
.back { font-weight:600; text-decoration:none; }
.brand { font-family:var(--display); text-transform:uppercase; letter-spacing:.08em; color:var(--mfg); font-size:13px; }
main { max-width:920px; margin:0 auto; padding:0 16px 48px; }
section { padding-top:28px; scroll-margin-top:56px; }
h1,h2,h3,h4 { font-family:var(--display); font-weight:700; line-height:1.15; margin:0 0 10px; }
h1 { font-size:clamp(32px,6vw,46px); text-transform:uppercase; letter-spacing:.04em; }
h2 { font-size:24px; display:flex; align-items:center; gap:10px; border-top:1px solid var(--border); padding-top:22px; }
h3 { font-size:19px; margin-top:22px; } h4 { font-size:16px; margin-top:8px; }
.hero { padding-top:36px; }
.eyebrow { font-family:var(--display); text-transform:uppercase; letter-spacing:.15em; color:var(--primary); margin:0 0 6px; }
.lead { font-size:17px; color:var(--fg); max-width:70ch; }
.warn { border:1px solid var(--warn); color:var(--warn); padding:8px 12px; border-radius:4px; }
.tag { display:inline-grid; place-items:center; min-width:28px; height:28px; border-radius:4px; background:var(--muted); color:var(--primary); font-size:16px; }
.answer { font-size:16px; max-width:75ch; }
.answers { padding-left:20px; max-width:75ch; } .answers li { margin-bottom:6px; }
.note, .chart-note { color:var(--mfg); font-size:13px; }
.muted { color:var(--mfg); }
.mono, code { font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.9em; }
.glance-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; }
.glance { display:flex; flex-direction:column; gap:6px; padding:14px; background:var(--card); border:1px solid var(--border); border-radius:6px;
  text-decoration:none; color:var(--fg); transition:border-color .15s; }
.glance:hover { border-color:var(--primary); }
.q { font-weight:600; }
.g-sub { color:var(--mfg); font-size:13px; }
.verdict { font-family:var(--display); font-size:20px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.verdict.ok { color:var(--ok); } .verdict.no { color:var(--danger); } .verdict.mid { color:var(--warn); }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:10px; margin:12px 0; }
.card { background:var(--card); border:1px solid var(--border); border-radius:6px; padding:14px; }
.card.wide { margin:12px 0; }
.card p { margin:8px 0 0; font-size:14px; }
.bars { display:flex; flex-direction:column; gap:6px; }
.bar-row { display:grid; grid-template-columns:110px 1fr auto; align-items:center; gap:8px; font-size:13px; }
.bar { height:12px; background:var(--muted); border-radius:3px; overflow:hidden; }
.bar > span { display:block; height:100%; }
.fill-obs { background:var(--primary); } .fill-null { background:var(--mfg); }
.table-wrap { overflow-x:auto; margin:12px 0; border:1px solid var(--border); border-radius:6px; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th { text-align:left; font-family:var(--display); text-transform:uppercase; letter-spacing:.06em; font-size:13px; color:var(--mfg);
  background:var(--muted); padding:8px 10px; white-space:nowrap; }
td { padding:8px 10px; border-top:1px solid var(--border); vertical-align:top; }
.chip { display:inline-block; padding:1px 8px; border-radius:99px; font-size:12px; font-weight:600; white-space:nowrap; }
.chip.ok { background:color-mix(in srgb,var(--ok) 22%,transparent); color:var(--ok); }
.chip.no { background:var(--muted); color:var(--mfg); }
.pill { display:inline-block; padding:0 6px; margin:1px; border-radius:3px; font-family:"JetBrains Mono",monospace; font-size:12px; }
.pill.good { background:color-mix(in srgb,var(--ok) 25%,transparent); }
.pill.mid { background:color-mix(in srgb,var(--warn) 25%,transparent); }
.pill.bad { background:color-mix(in srgb,var(--danger) 25%,transparent); }
details.how { margin:10px 0; border:1px solid var(--border); border-radius:6px; background:var(--card); }
details.how summary { cursor:pointer; padding:10px 14px; font-weight:600; color:var(--primary); }
details.how[open] summary { border-bottom:1px solid var(--border); }
details.how > p, details.how > h4, details.how > .table-wrap { margin-left:14px; margin-right:14px; }
details.how > p { font-size:14px; max-width:78ch; }
.chart { width:100%; height:auto; display:block; }
.chart .zero { stroke:var(--mfg); stroke-dasharray:3 3; }
.chart .tick, .chart .val { fill:var(--mfg); font-size:11px; } .chart .val { fill:var(--fg); font-weight:600; }
.chart .lab { fill:var(--fg); font-size:13px; font-family:var(--display); text-transform:uppercase; letter-spacing:.05em; }
.chart .ci { stroke-width:4; stroke-linecap:round; } .chart .ci.sig { stroke:color-mix(in srgb,var(--primary) 55%,transparent); }
.chart .ci.nosig { stroke:color-mix(in srgb,var(--mfg) 50%,transparent); }
.chart .dot.sig { fill:var(--primary); } .chart .dot.nosig { fill:var(--mfg); }
.stretch { margin:4px 0 14px; }
.stretch-name { font-family:var(--display); text-transform:uppercase; letter-spacing:.06em; font-size:14px; margin-bottom:4px; }
.track { position:relative; height:44px; background:var(--muted); border-radius:4px; overflow:hidden; }
.band { position:absolute; top:0; bottom:0; background:color-mix(in srgb,var(--primary) calc(var(--a) * 70%),transparent);
  border-right:2px solid var(--bg); display:flex; align-items:center; justify-content:center; }
.band-text { font-size:11px; line-height:1.15; text-align:center; color:var(--fg); padding:0 2px; }
.band-text b { display:block; font-size:13px; }
.iv { position:absolute; bottom:0; height:6px; background:var(--warn); opacity:.85; }
.ends { display:flex; justify-content:space-between; color:var(--mfg); font-size:12px; margin-top:2px; }
.glossary { display:grid; grid-template-columns:minmax(150px,220px) 1fr; gap:6px 16px; }
.glossary dt { font-weight:600; } .glossary dd { margin:0; color:var(--fg); }
@media (max-width:600px) { .glossary { grid-template-columns:1fr; } .glossary dd { margin-bottom:8px; } .bar-row { grid-template-columns:90px 1fr auto; }
  .brand { display:none; } }
.limits li { margin-bottom:8px; max-width:78ch; }
footer { max-width:920px; margin:0 auto; padding:20px 16px 40px; color:var(--mfg); font-size:13px; border-top:1px solid var(--border); }
@media print { .top { position:static; } details.how { break-inside:avoid; } details.how:not([open]) > *:not(summary) { display:block; } }
"""


def main():
    res = pd.read_csv(SIG / "results.csv")
    gaps = pd.read_csv(SIG / "gaps.csv")
    meta = json.loads((SIG / "notes.json").read_text(encoding="utf8"))
    nb = pd.read_csv(ROOT / "analysis" / "phase_distributions" / "natural_breaks.csv")
    extra = {"arrival": pd.read_csv(ROOT / "figures" / "arrival" / "arrival.csv"),
             "jenks": pd.read_csv(ROOT / "analysis" / "phase_distributions" / "jenks_by_phase_summary.csv", dtype={"phase": str}),
             "substretch": pd.read_csv(ROOT / "analysis" / "loa_frontier" / "substretch.csv"),
             "entropy": pd.read_csv(ROOT / "analysis" / "phase_checkpoints" / "entropy.csv", dtype={"phase": str})}
    OUT.write_text(build(res, gaps, meta, nb, extra), encoding="utf8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
