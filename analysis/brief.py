"""Bare-bones brief for Sorin (meeting of 11-6-2026), built from the analysis outputs so every number is reproducible.

Run the analyses first (compare_loa.py, phase_checkpoints.py, phase_distributions.py, figures/arrival_bars.py), then
`python analysis/brief.py`. Writes reports/Barbarossa brief 2026-11-09.docx and reports/flow_chart.png (the app's
Phases-tab flow chart redrawn at print resolution from the same data and colours).
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from docx import Document  # noqa: E402
from docx.shared import Mm, Pt  # noqa: E402
from matplotlib.patches import PathPatch  # noqa: E402
from matplotlib.path import Path as MplPath  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / "analysis"
OUT = ROOT / "reports"
NAMES = {"6A": "6th Army", "III PzKo": "III Panzer Corps", "PzGp1(-)": "Panzer Group 1 (less III Corps)", "17A": "17th Army"}
# The app's colours (app/src/config/presets.ts FORMATION_COLORS, CLUSTER_COLORS); grey = other / did not reach.
FORMATION_COLORS = {"6A": "#149ECE", "III PzKo": "#ED5151", "PzGp1(-)": "#FC921F", "17A": "#A7C636"}
GROUP_COLORS = ["#ED5151", "#149ECE", "#A7C636", "#9E559C", "#FC921F"]
GREY = "#888888"


def flow_chart(path):
    """The app's Sankey: columns = phases, blocks = fighting groups north to south (+ grey 'did not reach'), bands split
    by greater unit."""
    d = json.loads((ROOT / "app" / "src" / "data" / "phase_checkpoints.json").read_text(encoding="utf8"))
    cols = d["lines"]
    nodes = {}  # (line, group or 'stop') -> [column, value, colour]
    for j, L in enumerate(cols):
        for g in sorted((g for g in d["groups"] if g["line"] == L), key=lambda g: -g["lonlat"][1]):
            nodes[(L, g["group"])] = [j, g["divisions"], GROUP_COLORS[g["group"] % 5], g["formations"]]
        stopped = [f for f in d["flows"] if f["to_line"] == L and f["to_group"] is None]
        if stopped:
            counts = {}
            for f in stopped:
                for u, n in f["formations"].items():
                    counts[u] = counts.get(u, 0) + n
            nodes[(L, "stop")] = [j, sum(counts.values()), GREY, counts]
    scale, pad, width, gap = 1.0, 3.0, 0.06, 1.0
    y, top = {}, {}
    for j in range(len(cols)):
        cursor = 0.0
        for k, (col, v, _, _) in nodes.items():
            if col == j:
                y[k] = cursor
                cursor += v * scale + pad
    out_used, in_used = {k: 0.0 for k in nodes}, {k: 0.0 for k in nodes}
    fig, ax = plt.subplots(figsize=(129 / 25.4, 3.2))
    for f in sorted(d["flows"], key=lambda f: (cols.index(f["from_line"]), y[(f["from_line"], f["from_group"])])):
        s, t = (f["from_line"], f["from_group"]), (f["to_line"], f["to_group"] if f["to_group"] is not None else "stop")
        for unit, n in f["formations"].items():
            h = n * scale
            x0, x1 = nodes[s][0] * gap + width, nodes[t][0] * gap
            y0, y1 = y[s] + out_used[s], y[t] + in_used[t]
            out_used[s] += h
            in_used[t] += h
            xm = (x0 + x1) / 2
            verts = [(x0, y0), (xm, y0), (xm, y1), (x1, y1), (x1, y1 + h), (xm, y1 + h), (xm, y0 + h), (x0, y0 + h), (x0, y0)]
            codes = [MplPath.MOVETO, MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4, MplPath.LINETO,
                     MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4, MplPath.CLOSEPOLY]
            ax.add_patch(PathPatch(MplPath(verts, codes), fc=FORMATION_COLORS.get(unit, GREY), alpha=0.6, lw=0))
    for k, (j, v, colour, parts) in nodes.items():
        ax.add_patch(plt.Rectangle((j * gap, y[k]), width * 0.3, v * scale, fc=colour, lw=0))  # the group's map colour
        top = y[k]
        for unit in [*FORMATION_COLORS, "other"]:  # the block split by greater unit, like the bands leaving it
            h = parts.get(unit, 0) / sum(parts.values()) * v * scale
            ax.add_patch(plt.Rectangle((j * gap + width * 0.35, top), width * 0.65, h, fc=FORMATION_COLORS.get(unit, GREY), lw=0))
            top += h
        ax.text(j * gap + width + 0.015, y[k] + v * scale / 2, str(v), va="center", fontsize=7)
    for j, L in enumerate(cols):
        ax.text(j * gap + width / 2, -2, "Start (22 Jun)" if L == "Start" else f"Phase {L}", ha="center", va="bottom", fontsize=8)
    handles = [plt.Rectangle((0, 0), 1, 1, fc=c, alpha=0.6) for c in [*FORMATION_COLORS.values(), GREY]]
    ax.legend(handles, [*FORMATION_COLORS, "other / unidentified"], loc="upper center", bbox_to_anchor=(0.5, -0.06),
              ncol=5, frameon=False, fontsize=7)
    ax.set_xlim(-0.05, (len(cols) - 1) * gap + 0.2)
    ax.set_ylim(max(y[k] + nodes[k][1] for k in nodes) + 2, -6)
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(path, dpi=300)
    plt.close(fig)


def fig_loa_overview(path):
    """Section 1 at a glance: one panel per planned line, Rob's plan dashed and the matched realized route solid, the
    phase lines for reference, and the stretch compared in depth drawn thick. Black and white, readable at 150 mm."""
    import sys
    sys.path.insert(0, str(A))
    import compare_loa as c
    import phase_clusters as pc
    from shapely.geometry import Point
    planned, clusters = c.planned_lines(), c.cluster_lines(c.CLUSTERINGS["DV"])
    match = pd.read_csv(A / "loa_frontier" / "pairs.csv").query("clustering == 'DV'").set_index("planned").cluster
    lines = pc.phase_lines()
    towns = {n: c.to_km(Point(lon, lat)) for n, (lat, lon) in c.CITIES.items()}
    plt.rcParams.update({"font.size": 8, "pdf.fonttype": 42})
    fig, axes = plt.subplots(2, 2, figsize=(150 / 25.4, 118 / 25.4), sharex=True, sharey=True)
    for ax, p in zip(axes.flat, ["6A", "III PzKo", "PzGp1(-)", "17A"]):
        real = clusters[int(match[p])]  # pairs.csv holds unit names in other rows, so the column is text
        for L in ("1", "2", "3", "4"):
            xy = np.array(lines[L][1:-1])
            ax.plot(*xy.T, color="0.7", lw=0.8)
            ax.text(*xy[0], f" {L}", color="0.45", fontsize=7, va="bottom")
        if p in c.SUBSTRETCHES:
            w, e = c.SUBSTRETCHES[p]
            stretch = real.intersection(pc.east_polygon(lines[w]).difference(pc.east_polygon(lines[e])))
            for part in getattr(stretch, "geoms", [stretch]):
                ax.plot(*np.array(part.coords).T, color="0.55", lw=5, solid_capstyle="round", zorder=1)
            ax.text(0.02, 0.04, f"thick: phases {w}-{e}, compared in depth", transform=ax.transAxes, fontsize=7)
        ax.plot(*np.array(planned[p].coords).T, color="black", lw=1.3, ls=(0, (4, 2)), zorder=2)
        ax.plot(*np.array(real.coords).T, color="black", lw=1.5, zorder=3)
        for n, t in towns.items():
            ax.plot(t.x, t.y, "o", color="0.4", ms=2.5)
            ax.text(t.x + 6, t.y + 5, n, fontsize=6.5, color="0.35")
        ax.set_title(NAMES[p], fontsize=9, fontweight="bold")
        ax.set_aspect("equal")
        ax.set_xticks([])
        ax.set_yticks([])
    handles = [plt.Line2D([], [], color="black", lw=1.3, ls=(0, (4, 2))), plt.Line2D([], [], color="black", lw=1.5),
               plt.Line2D([], [], color="0.7", lw=0.8)]
    fig.legend(handles, ["Planned line (Rob)", "What the divisions did", "Phase lines 1-4"], loc="lower center", ncol=3, frameon=False)
    fig.tight_layout(rect=(0, 0.05, 1, 1))
    fig.savefig(path, dpi=300)
    plt.close(fig)


def pair_sentence(r):
    bd = int(r.straight_bearing_diff)
    way = "the same way as planned" if bd == 0 else f"{abs(bd)}° further {'south' if bd > 0 else 'north'} than planned"
    return (f"{NAMES[r.planned]}: direction {r.score_direction}, route {r.score_route}, destination {r.score_destination} "
            f"(overall {r.score_overall}). Start to end it headed {way}; along the way it ran on average "
            f"{round(r.mean_abs_offset_km)} km from the planned line; it ended {r.end_gap_km} km from the planned end point.")


NOTES = {  # what the numbers mean, as discussed on 11-6
    "17A": "Simple story: right direction and right destination, by a somewhat different route.",
    "PzGp1(-)": "Route and direction as intended, but the destination was missed, so the planned closing of the gap did not happen neatly.",
    "III PzKo": "Behaved as planned on all three measures.",
    "6A": "The single start-to-end bearing hides a bend: the army drifted north part of the way. See the in-depth stretch below.",
}


def table(doc, df, widths=None):
    t = doc.add_table(rows=1, cols=len(df.columns))
    t.style = "Light Grid Accent 1"
    for cell, name in zip(t.rows[0].cells, df.columns):
        cell.text = str(name)
    for row in df.itertuples(index=False):
        for cell, v in zip(t.add_row().cells, row):
            cell.text = "" if pd.isna(v) else str(v)
    for row in t.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(8)
    return t


def main():
    OUT.mkdir(exist_ok=True)
    pairs = pd.read_csv(A / "loa_frontier" / "pairs.csv").query("clustering == 'DV'")
    sub = pd.read_csv(A / "loa_frontier" / "substretch.csv")
    arrival = pd.read_csv(ROOT / "figures" / "arrival" / "arrival.csv")
    jsum = pd.read_csv(A / "phase_distributions" / "jenks_by_phase_summary.csv", dtype={"phase": str})
    jbins = pd.read_csv(A / "phase_distributions" / "jenks_by_phase.csv", dtype={"phase": str})
    ent = pd.read_csv(A / "phase_checkpoints" / "entropy.csv")
    flow_chart(OUT / "flow_chart.png")

    doc = Document()
    doc.styles["Normal"].font.size = Pt(10.5)
    doc.add_heading("Army Group South, June-July 1941: plan versus what happened", level=1)
    doc.add_paragraph("Bare-bones summary of the analyses discussed on 6 November 2026, for Sorin. Frontier Breakthrough "
                      "(Army Group South) only. Numbers come from the project's scripts and data; the dashboard shows the same.")

    # 1. Lines of operation
    doc.add_heading("1. Planned versus realized lines of operation", level=2)
    doc.add_paragraph("Each of Rob's four planned lines of operation is paired with the realized line (the average path of the "
                      "closest cluster of divisions) and scored 0-100 on three things: direction (start-to-end bearing; 100 "
                      "within 5°, 0 at 45°), route (average gap along the way; 100 within 20 km, 0 at 100 km) and destination "
                      "(gap between end points; 100 within 20 km, 0 at 150 km). 100 means the difference is within mapping error.")
    order = ["17A", "PzGp1(-)", "III PzKo", "6A"]
    p = pairs.set_index("planned").loc[order].reset_index()
    table(doc, pd.DataFrame({"Planned line": [NAMES[x] for x in p.planned], "Direction": p.score_direction,
                             "Route": p.score_route, "Destination": p.score_destination, "Overall": p.score_overall}))
    for r in p.itertuples():
        doc.add_paragraph(f"{pair_sentence(r)} {NOTES[r.planned]}", style="List Bullet")
    doc.add_paragraph("In depth, between two phase lines only (the same measures on that stretch):")
    for r in sub.itertuples():
        bd = int(r.straight_bearing_diff)
        doc.add_paragraph(f"{NAMES[r.planned]}, phases {r.stretch.replace('-', ' to ')}: direction {r.score_direction} (headed "
                          f"{abs(bd)}° further {'south' if bd > 0 else 'north'} than planned), route {r.score_route} "
                          f"(average gap {round(r.mean_abs_offset_km)} km), destination {r.score_destination} "
                          f"(ended {r.end_gap_km} km off).", style="List Bullet")
    doc.add_picture(str(A / "loa_frontier" / "plan_vs_actual_DV.png"), width=Mm(150))

    # 2. Arrival
    doc.add_heading("2. Arrival at the phase lines on the planned dates", level=2)
    doc.add_paragraph("For each phase line, the share of divisions that were past it or within 10 km of it on the date they "
                      "were meant to be there (among divisions in the line's north-south span).")
    doc.add_picture(str(ROOT / "figures" / "arrival" / "arrival_bars.png"), width=Mm(140))
    a = arrival.set_index("phase").arrived_pct
    doc.add_paragraph(f"Phase 1 (30 June): {a[1]}%. Phase 2 (7 July): {a[2]}%. Phase 3 (22 July, the middle of 'mid-July'): "
                      f"{a[3]}%. Phase 4 (25 July): {a[4]}%. Phase 5 (30 July): {a[5]}%, no division came within 10 km. "
                      "The advance was roughly on schedule to phase 3, slipped at 4 and never reached 5. The dates for 3-5 are our "
                      "reading of vague planning dates ('mid-July', 'after mid-July', 'late July').")

    # 3. Natural breaks
    doc.add_heading("3. Natural breaks at each phase line", level=2)
    doc.add_paragraph("The 10 km rule gives one number per phase line; it cannot tell a line barely reached by a crowd "
                      "from one clearly beaten by a group. So, on each planned date, every division is placed on one line: "
                      "its distance along the general direction of the whole advance (bearing 101 degrees). Jenks natural "
                      "breaks then cut that line where the divisions clump, into the fewest bins that explain at least 90% "
                      "of the spread. Only then is each bin read against the phase line: past (all its divisions had "
                      "crossed), straddling (some had) or behind (none had). Bins are numbered from the front.")
    doc.add_picture(str(A / "phase_distributions" / "jenks_by_phase.png"), width=Mm(150))
    a10 = arrival.set_index("phase").arrived_pct
    for r in jsum.itertuples():
        b = jbins[jbins.phase == r.phase].sort_values("bin")
        bins_txt = "; ".join(f"bin {x['bin']}: {x['divisions']} divisions, {x['past']} past ({x['class']})" for x in b.to_dict("records"))
        doc.add_paragraph(f"Phase {r.phase} ({pd.Timestamp(r.date):%d %b}), {r.bins} bins: {bins_txt}. In all, {r.past}% of "
                          f"divisions were in bins clearly past the line, {r.straddling}% straddling it and {r.behind}% behind "
                          f"(the 10 km rule: {a10[int(r.phase)]}%).", style="List Bullet")
    table(doc, pd.DataFrame({"Phase": jbins.phase, "Bin": jbins.bin, "km along the advance": [f"{x}-{y}" for x, y in zip(jbins.from_km, jbins.to_km)],
                             "Divisions": jbins.divisions, "Past the line": jbins.past, "Class": jbins["class"]}))
    doc.add_paragraph("So most of each phase was reached loosely: the bins around each line hold divisions on both sides of "
                      "it. Only a front bin was clearly past: 3 divisions at phase 1, 15 at phase 2 and 13 at phase 3. "
                      "Phase 4 was met by about half of the leading bin, and phase 5 by none.")

    # 4. Groups of divisions
    doc.add_heading("4. Groups of divisions", level=2)
    doc.add_heading("4a. Crossing groups: who crossed each phase line together", level=3)
    doc.add_paragraph("At each phase line, divisions that crossed it close together in place and time form a fighting group "
                      "(blocks, numbers = divisions; each block is split by greater unit, with the group's map colour as a thin "
                      "strip on its left). Bands show where each group's divisions went next, coloured by the "
                      "greater unit they belonged to (grey bands: other or unidentified divisions; grey blocks: divisions that did not reach the next phase line by 5 August). Diversity is the entropy of the greater units within a group, scaled "
                      "0-1: 0 = one greater unit fighting as itself, 1 = all four equally mixed.")
    doc.add_picture(str(OUT / "flow_chart.png"), width=Mm(150))
    e = ent.dropna(subset=["entropy"])
    table(doc, pd.DataFrame({"Phase": e.phase, "Group": e.sector, "Divisions": e.divisions, "6A": e["6A"],
                             "III PzKo": e["III PzKo"], "PzGp1(-)": e["PzGp1(-)"], "17A": e["17A"], "Other": e.other,
                             "Diversity": e.entropy}))
    doc.add_paragraph("Over the whole period the divisions follow four lines of operation, but phase by phase they fought as "
                      "two to three groups (III Panzer Corps merged with Panzer Group 1), with an occasional small fourth. The "
                      "southern group stays mostly 17th Army (diversity near 0 by phases 3 and 4); the northern group mixes "
                      "6th Army and the panzer formations (diversity about 0.8 to 0.95).")

    doc.add_heading("4b. Local groups: who stood together, day by day", level=3)
    doc.add_paragraph("A second way of grouping, independent of the phase lines: on every day from 22 June to 5 August, two "
                      "divisions belong to the same group when they stood within 30 km of each other, directly or through a "
                      "chain of neighbours (30 km is one and a half times the mapping error). A group keeps its identity while "
                      "it shares most of its divisions with the day before, so the figure shows groups forming, holding, "
                      "splitting and merging. Most lasted only a few days; the ones that held together for ten days or more were:")
    doc.add_picture(str(A / "phase_distributions" / "groups_daily.png"), width=Mm(150))
    daily = pd.read_csv(A / "phase_distributions" / "groups_daily.csv")
    life = daily.groupby("id").agg(first=("date", "min"), last=("date", "max"), days=("date", "size"), peak=("divisions", "max"),
                                    dominant=("dominant", lambda x: x.mode()[0])).query("days >= 10").sort_values("first")
    for r in life.itertuples():
        who = {"other": "Unidentified divisions", "mixed": "Mixed formations"}.get(r.dominant, NAMES.get(r.dominant, r.dominant))
        doc.add_paragraph(f"{who}: {pd.Timestamp(r.first):%d %b} to {pd.Timestamp(r.last):%d %b} ({r.days} days, up to "
                          f"{r.peak} divisions).", style="List Bullet")

    # 5. Done so far
    doc.add_heading("5. What we have done so far", level=2)
    for item in ["Digitized and cleaned division positions for the four theaters; interactive dashboard (Barbarossa.html).",
                 "Clustered the division paths into lines of operation and compared them with Rob's planned lines (scores above).",
                 "Measured arrival at Rob's phase lines on their planned dates (10 km rule) and the spread around each line (natural breaks).",
                 "Grouped divisions at each phase line into fighting groups, followed them from phase to phase, and measured how mixed each group was.",
                 "Black-and-white posture-over-time charts for the four theaters (for the paper)."]:
        doc.add_paragraph(item, style="List Bullet")

    path = OUT / "Barbarossa brief 2026-11-09.docx"
    doc.save(path)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
