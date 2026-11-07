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
        for i, cell in enumerate(row.cells):
            if widths:
                cell.width = Mm(widths[i])  # Word reads widths per cell; equal columns wasted space on short numbers
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

    fig_loa_overview(OUT / "fig_loa_overview.png")
    screens = OUT / "screens"
    order = ["17A", "PzGp1(-)", "III PzKo", "6A"]
    p = pairs.set_index("planned").loc[order].reset_index()
    a = arrival.set_index("phase").arrived_pct
    past_divs = jbins[jbins["class"] == "past"].groupby("phase").divisions.sum().reindex(jsum.phase, fill_value=0)
    turn = lambda bd: "on course" if abs(bd) <= 5 else f"{abs(bd)}° further {'south' if bd > 0 else 'north'}"

    doc = Document()
    doc.styles["Normal"].font.size = Pt(10.5)
    bullet = lambda text: doc.add_paragraph(text, style="List Bullet")

    def question(text):
        doc.add_paragraph().add_run(text).italic = True

    def picture(path, mm, caption):
        doc.add_picture(str(path), width=Mm(mm))
        doc.add_paragraph().add_run(caption).font.size = Pt(8.5)

    doc.add_heading("Army Group South, June-July 1941: plan versus what happened", level=1)
    doc.add_paragraph("For Sorin, ahead of the 10 November meeting. Frontier Breakthrough only; every number comes from the "
                      "project data and matches the dashboard (Barbarossa.html).")
    doc.add_heading("In short", level=2)
    worst = sub.loc[sub.straight_bearing_diff.abs().idxmax()]
    bullet(f"Rob's four lines of operation were broadly followed (overall {p.score_overall.min()}-{p.score_overall.max()} of 100), "
           f"but the {NAMES[worst.planned]} turned {turn(int(worst.straight_bearing_diff))} than planned between phases "
           f"{worst.stretch.replace('-', ' and ')}.")
    bullet(f"On the planned dates, {a[1]}%, {a[2]}%, {a[3]}% and {a[4]}% of divisions had reached phases 1-4 (within 10 km or "
           f"past); none reached phase 5.")
    bullet(f"Natural breaks show those lines were met loosely: only a front group was clearly past (at most "
           f"{jsum.past.max()}% of divisions); most sat in groups straddling the line.")
    bullet("Phase by phase the divisions fought as two to three groups: the southern one mostly 17th Army, the northern "
           "one mixing the 6th Army with the panzer formations.")

    # 1. Lines of operation
    doc.add_heading("1. Did the armies follow Rob's planned lines?", level=2)
    question("Each planned line is paired with the route its divisions actually took, and scored 0-100 on direction, "
             "route and destination (100 = within mapping error).")
    picture(screens / "plan_cards.png", 160, "Figure 1. Dashboard view: each planned line (dashed) and the route its divisions took (solid), "
            "with the agreement scores.")
    reading = {"17A": "right direction and end point, different route", "PzGp1(-)": "on route, but missed the end point",
               "III PzKo": "as planned", "6A": "as planned overall, but bent north on the way"}
    table(doc, pd.DataFrame({"Planned line": [NAMES[x] for x in p.planned], "Direction": p.score_direction, "Route": p.score_route,
                             "Destination": p.score_destination, "Overall": p.score_overall,
                             "Reading": [reading[x] for x in p.planned]}), widths=[42, 17, 15, 20, 15, 51])
    doc.add_paragraph("In depth, between two phase lines only:")
    table(doc, pd.DataFrame({"Stretch": [f"{NAMES[r.planned]}, phases {r.stretch}" for r in sub.itertuples()],
                             "Heading vs plan": [turn(int(r.straight_bearing_diff)) for r in sub.itertuples()],
                             "Direction": sub.score_direction, "Average gap": [f"{round(v)} km" for v in sub.mean_abs_offset_km],
                             "End gap": [f"{v} km" for v in sub.end_gap_km]}), widths=[52, 34, 20, 26, 28])

    # 2. Arrival
    doc.add_heading("2. Did the divisions reach each phase line on time?", level=2)
    question("Share of divisions past each phase line, or within 10 km of it, on its planned date.")
    picture(ROOT / "figures" / "arrival" / "arrival_bars.png", 130, "Figure 2. Arrival at each phase line on its planned date.")
    bullet(f"Phases 1-3 were reached by about half to three quarters of the divisions on time ({a[1]}%, {a[2]}%, {a[3]}%); "
           f"phase 4 by {a[4]}%; phase 5 by none.")
    bullet("Dates for phases 3-5 are our reading of vague planning dates: 22 July for 'mid-July', 25 July for 'after "
           "mid-July', 30 July for 'late July'.")

    # 3. Natural breaks
    doc.add_heading("3. How were the divisions spread around each line?", level=2)
    question("On each planned date, every division is placed along the general direction of the advance; Jenks natural "
             "breaks cut that line where the divisions clump; only then is each group read against the phase line.")
    picture(screens / "natural_breaks_strips.png", 160, "Figure 3. Dashboard view, phases 1-5: divisions along the advance on each "
            "planned date. Filled: past the phase line. Dashed: natural breaks; groups numbered from the front.")
    table(doc, pd.DataFrame({"Phase (date)": [f"{r.phase} ({pd.Timestamp(r.date):%d %b})" for r in jsum.itertuples()],
                             "10 km rule": [f"{a[int(x)]}%" for x in jsum.phase], "Groups": jsum.bins,
                             "Clearly past": [f"{r.past}% ({past_divs[r.phase]} div.)" for r in jsum.itertuples()],
                             "Straddling": [f"{x}%" for x in jsum.straddling], "Behind": [f"{x}%" for x in jsum.behind]}))
    bullet("The 10 km rule makes phases 1-4 look roughly half met or better; the natural breaks show they were met loosely. Only a "
           "front group was clearly past the line, and most divisions sat in groups straddling it.")
    bullet("The phase lines run at an angle to the advance, so a group can straddle a line with its southern divisions "
           "past it and its northern ones short.")
    if (screens / "natural_breaks_phase3.png").exists():
        picture(screens / "natural_breaks_phase3.png", 150, "Figure 4. Dashboard view, phase 3 on 22 July: the phase line "
                "(teal), the natural breaks (dashed) and the divisions coloured by group: red = 1 (front, all past), "
                "blue = 2 (mostly past), green = 3, purple = 4 (behind).")

    # 4. Fighting groups
    doc.add_heading("4. Who fought together from phase to phase?", level=2)
    question("At each phase line, divisions that crossed it close together in place and time form a fighting group. "
             "The chart follows those groups from line to line (the dashboard chart, as is).")
    picture(screens / "flow_chart_app.png", 120, "Figure 5. Blocks: fighting groups at each line (number = divisions), split by army; "
            "bands: where their divisions went next. Grey blocks: did not reach the next line by 5 August.")
    mixed = ent.dropna(subset=["entropy"]).query("divisions >= 5")  # the small groups say little about mixing
    bullet("They fought as two to three groups at each line (III Panzer Corps merged with Panzer Group 1), with an "
           "occasional small fourth.")
    bullet("How mixed each group of 5+ divisions was (0 = one army on its own, 1 = all four mixed; unidentified divisions left out): " + "; ".join(
        f"phase {ph}: " + ", ".join(f"{g.sector} ({g.divisions} div.) {g.entropy:.1f}" for g in mixed[mixed.phase == ph].itertuples())
        for ph in ["1", "2", "3", "4"] if (mixed.phase == ph).any()) + ".")

    # 5. Also explored
    doc.add_heading("5. Also explored: local groups, day by day", level=2)
    doc.add_paragraph("Beyond what we discussed: on every day, divisions within 30 km of each other (directly or through "
                      "neighbours) form a local group, and the groups are followed from day to day. Most lasted only a "
                      "few days; the 17th Army group held together for all 45 days, and 6th Army, panzer and mixed groups "
                      "formed in July.")
    picture(screens / "local_groups_chart.png", 120, "Figure 6. Dashboard view: local groups day by day; strong colours: groups "
            "that held together 10 days or more.")
    if (screens / "local_groups_0721.png").exists():
        picture(screens / "local_groups_0721.png", 150, "Figure 7. Dashboard view, 21 July: local groups (outlined, "
                "labelled number · divisions) on the density of divisions (shading).")

    # 6. Done so far
    doc.add_heading("6. What we have done so far", level=2)
    for item in ["Digitized and cleaned daily division positions for four theaters; built the interactive dashboard (Barbarossa.html).",
                 "Compared Rob's planned lines of operation with the routes the divisions took (section 1).",
                 "Measured arrival at Rob's phase lines on their planned dates, and the spread around each line (sections 2-3).",
                 "Followed the fighting groups from phase line to phase line, and how mixed they were (section 4).",
                 "Black-and-white posture-over-time charts for the four theaters, for the paper."]:
        bullet(item)

    path = OUT / "Barbarossa brief 2026-11-09.docx"
    doc.save(path)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
