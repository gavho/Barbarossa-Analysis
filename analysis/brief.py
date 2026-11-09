"""Bare-bones brief for Sorin (meeting of 11-6-2026), built from the analysis outputs so every number is reproducible.

Run the analyses first (compare_loa.py, phase_checkpoints.py, phase_distributions.py, figures/arrival_bars.py), and put the
dashboard screenshots in reports/screens/ (see that folder), then `python analysis/brief.py`.
Writes reports/Barbarossa brief 2026-11-09.docx.
"""
from pathlib import Path

import pandas as pd
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Mm, Pt

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / "analysis"
OUT = ROOT / "reports"
NAMES = {"6A": "6th Army", "III PzKo": "III Panzer Corps", "PzGp1(-)": "Panzer Group 1 (less III Corps)", "17A": "17th Army"}




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
                p.paragraph_format.keep_with_next = row is not t.rows[-1]  # Word then moves the table as one block
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

    screens = OUT / "screens"
    order = ["17A", "PzGp1(-)", "III PzKo", "6A"]
    p = pairs.set_index("planned").loc[order].reset_index()
    a = arrival.set_index("phase").arrived_pct
    past_divs = jbins[jbins["class"] == "past"].groupby("phase").divisions.sum().reindex(jsum.phase, fill_value=0)
    turn = lambda bd: "on course" if abs(bd) <= 5 else f"{abs(bd)}° further {'south' if bd > 0 else 'north'}"

    doc = Document()
    doc.styles["Normal"].font.size = Pt(10.5)
    for sec in doc.sections:  # 20 mm margins: the dashboard figures need the full width to stay legible
        sec.left_margin = sec.right_margin = sec.top_margin = sec.bottom_margin = Mm(20)
    bullet = lambda text: doc.add_paragraph(text, style="List Bullet")

    def question(text):
        q = doc.add_paragraph()
        q.paragraph_format.keep_with_next = True  # keep the heading and its question with the figure below
        q.add_run(text).italic = True

    def picture(path, mm, caption):
        doc.add_picture(str(path), width=Mm(mm))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.paragraphs[-1].paragraph_format.keep_with_next = True  # the caption stays under its figure
        c = doc.add_paragraph()
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c.add_run(caption).font.size = Pt(8.5)

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
    bullet(f"Natural breaks show those lines were met loosely: only a front group was all past (at most "
           f"{jsum.past.max()}% of divisions); most sat in groups only partly past the line.")
    bullet("Phase by phase the divisions fought as two to three groups: the southern one mostly 17th Army, the northern "
           "one mixing the 6th Army with the panzer formations.")

    # 1. Lines of operation
    doc.add_heading("1. Did the armies follow Rob's planned lines?", level=2)
    question("Each planned line is paired with the route its divisions actually took, and scored 0-100 on direction, "
             "route and destination (100 = within mapping error).")
    picture(screens / "plan_cards_1.png", 170, "Figure 1a. Dashboard view, 17th Army and Panzer Group 1: each planned line (dashed) "
            "and the route its divisions took (solid), with the agreement scores.")
    picture(screens / "plan_cards_2.png", 170, "Figure 1b. The same for III Panzer Corps and 6th Army.")
    reading = {"17A": "right direction and end point, different route", "PzGp1(-)": "on route, but missed the end point",
               "III PzKo": "as planned", "6A": "as planned overall, but bent north on the way"}
    table(doc, pd.DataFrame({"Planned line": [NAMES[x] for x in p.planned], "Direction": p.score_direction, "Route": p.score_route,
                             "Destination": p.score_destination, "Overall": p.score_overall,
                             "Reading": [reading[x] for x in p.planned]}), widths=[42, 17, 15, 20, 15, 51])
    doc.add_paragraph("In depth, between two phase lines only:").paragraph_format.keep_with_next = True
    table(doc, pd.DataFrame({"Stretch": [f"{NAMES[r.planned]}, phases {r.stretch}" for r in sub.itertuples()],
                             "Heading vs plan": [turn(int(r.straight_bearing_diff)) for r in sub.itertuples()],
                             "Direction": sub.score_direction, "Average gap": [f"{round(v)} km" for v in sub.mean_abs_offset_km],
                             "End gap": [f"{v} km" for v in sub.end_gap_km]}), widths=[52, 34, 20, 26, 28])

    # 2. Arrival
    doc.add_heading("2. Did the divisions reach each phase line on time?", level=2)
    question("Share of divisions past each phase line, or within 10 km of it, on its planned date.")
    picture(ROOT / "figures" / "arrival" / "arrival_bars.png", 110, "Figure 2. Arrival at each phase line on its planned date.")
    bullet(f"Phases 1-3 were reached by about half to three quarters of the divisions on time ({a[1]}%, {a[2]}%, {a[3]}%); "
           f"phase 4 by {a[4]}%; phase 5 by none.")
    bullet("Dates for phases 3-5 are our reading of vague planning dates: 22 July for 'mid-July', 25 July for 'after "
           "mid-July', 30 July for 'late July'.")

    # 3. Natural breaks
    doc.add_heading("3. How were the divisions spread around each line?", level=2)
    question("On each planned date, every division is placed along the general direction of the advance; Jenks natural "
             "breaks cut that line where the divisions clump; only then is each group read against the phase line: all past "
             "(every division in it had crossed), partly past (some had) or none past.")
    table(doc, pd.DataFrame({"Phase (date)": [f"{r.phase} ({pd.Timestamp(r.date):%d %b})" for r in jsum.itertuples()],
                             "10 km rule": [f"{a[int(x)]}%" for x in jsum.phase], "Groups": jsum.bins,
                             "In all-past groups": [f"{r.past}% ({past_divs[r.phase]} div.)" for r in jsum.itertuples()],
                             "In partly-past groups": [f"{x}%" for x in jsum.straddling], "In none-past groups": [f"{x}%" for x in jsum.behind]}))
    bullet("The 10 km rule makes phases 1-4 look roughly half met or better; the natural breaks show they were met loosely. Only a "
           "front group was all past the line, and most divisions sat in groups only partly past it.")
    bullet("The phase lines run at an angle to the advance, so a group can be partly past a line, with its southern divisions "
           "past it and its northern ones short.")
    # figures after the table, so the text fills the page before them instead of leaving a gap
    picture(screens / "natural_breaks_strips.png", 145, "Figure 3. Dashboard view, phases 1-5 on their planned dates. Left to right: distance along the "
            "advance (west to east). Each circle is a division: filled = past the phase line, open = short of it; colour = group "
            "(red = front); dashed = natural breaks; teal band = where the slanted phase line falls on this axis.")
    if (screens / "natural_breaks_phase3.png").exists():
        picture(screens / "natural_breaks_phase3.png", 130, "Figure 4. Dashboard view, phase 3 on 22 July: each dot is a division, "
                "coloured by its natural-breaks group (key on the map).")

    # 4. Fighting groups
    doc.add_heading("4. Who fought together from phase to phase?", level=2)
    question("At each phase line, divisions that crossed it close together in place and time form a fighting group. "
             "The chart follows those groups from line to line (the dashboard chart, as is).")
    picture(screens / "flow_chart_app.png", 100, "Figure 5. Blocks: fighting groups at each line (number = divisions), split by army; "
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
    picture(screens / "local_groups_chart.png", 110, "Figure 6. Dashboard view: local groups day by day; strong colours: groups "
            "that held together 10 days or more.")
    if (screens / "local_groups_0721.png").exists():
        picture(screens / "local_groups_0721.png", 150, "Figure 7. Dashboard view, 21 July: local groups (outlined) on the density of divisions (shading).")

    # 6. Done so far
    doc.add_heading("6. What we have done so far", level=2)
    for item in ["Digitized and cleaned daily division positions for four theaters; built the interactive dashboard (Barbarossa.html).",
                 "The four analyses above: plan vs actual lines of operation, arrival at the phase lines, natural breaks around "
                 "each line, and fighting groups from phase to phase.",
                 "Black-and-white posture-over-time charts for the four theaters, for the paper."]:
        bullet(item)

    path = OUT / "Barbarossa brief 2026-11-09.docx"
    doc.save(path)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
