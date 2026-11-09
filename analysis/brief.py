"""Progress report for Sorin (meeting of 11-6-2026): what has been done, how each analysis works and how to read its
figures, written so it can be passed on to the historians. Built from the analysis outputs, so every number is reproducible.

Run the analyses first (compare_loa.py, phase_checkpoints.py, phase_distributions.py, figures/arrival_bars.py,
significance.py), and put the dashboard screenshots in reports/screens/ (see that folder), then `python analysis/brief.py`.
Writes reports/Barbarossa brief 2026-11-09.docx.
"""
import json
from pathlib import Path

import pandas as pd
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Mm, Pt

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / "analysis"
OUT = ROOT / "reports"
NAMES = {"6A": "6th Army", "III PzKo": "III Panzer Corps", "PzGp1(-)": "Panzer Group 1 (less III Corps)", "17A": "17th Army"}
ALPHA = 0.05


def table(doc, df, widths=None):
    t = doc.add_table(rows=1, cols=len(df.columns))
    t.style = "Light Grid Accent 1"
    for cell, name in zip(t.rows[0].cells, df.columns):
        cell.text = str(name)
    for row in df.itertuples(index=False):
        for cell, v in zip(t.add_row().cells, row):
            cell.text = "" if pd.isna(v) else str(v)
    rows = t.rows
    for r, row in enumerate(rows):
        for i, cell in enumerate(row.cells):
            if widths:
                cell.width = Mm(widths[i])  # Word reads widths per cell; equal columns wasted space on short numbers
            for p in cell.paragraphs:
                p.paragraph_format.keep_with_next = r < len(rows) - 1  # Word moves the table as one block, not tied to what follows
                for run in p.runs:
                    run.font.size = Pt(8)
    return t


def tests_summary(res):
    """One row per question on the Statistics page: what was found and whether it could be chance (Holm-corrected)."""
    p_text = lambda p: "< 0.001" if p < 0.001 else f"{p:.3f}"
    which = lambda r: r.test.split(" — ")[1] if " — " in r.test else "phase " + r.test.split("phase ")[1].split()[0]
    groups = [
        ("Are the groups closer to the planned routes than random groups of the same divisions?", res.test.str.startswith("Plan vs actual"),
         lambda r: f"{r.estimate:g} km vs {r.null_median:g} km"),
        ("Do the groups follow the planned formations?", res.test.str.startswith("Groups follow"),
         lambda r: f"V = {r.estimate:g} vs {r.null_median:g}"),
        ("Are the groups tighter than in data with no groups?", res.test.str.startswith("Clusters"),
         lambda r: f"silhouette {r.estimate:g} vs {r.null_median:g}"),
        ("Did the front shift north or south at each phase line?", res.test.str.startswith("Front shifted"),
         lambda r: f"{abs(r.estimate):.0f} km {'south' if r.estimate < 0 else 'north'}"),
        ("Did divisions keep their north-south order at each line?", res.test.str.startswith("Divisions kept"),
         lambda r: f"ρ = {r.estimate:g}"),
        ("On the planned dates, are the natural breaks real gaps?", res.test.str.startswith("Natural breaks"),
         lambda r: f"{r.estimate:.0%} empty vs {r.null_median:.0%}"),
    ]
    rows = []
    for q, mask, found in groups:
        d = res[mask]
        yes = [which(r) for r in d.itertuples() if r.p_holm < ALPHA]
        no = [which(r) for r in d.itertuples() if r.p_holm >= ALPHA]
        verdict = ("Yes" if not no else "No" if not yes else f"Yes for {', '.join(yes)}; not for {', '.join(no)}")
        rows.append([q, "; ".join(f"{which(r)}: {found(r)}" for r in d.itertuples()), verdict,
                     f"{p_text(d.p_holm.min())}–{p_text(d.p_holm.max())}" if len(d) > 1 else p_text(d.p_holm.iloc[0])])
    return pd.DataFrame(rows, columns=["Question", "What we found", "Beyond chance?", "p (corrected)"])


def main():
    OUT.mkdir(exist_ok=True)
    pairs = pd.read_csv(A / "loa_frontier" / "pairs.csv").query("clustering == 'DV'")
    sub = pd.read_csv(A / "loa_frontier" / "substretch.csv")
    arrival = pd.read_csv(ROOT / "figures" / "arrival" / "arrival.csv")
    jsum = pd.read_csv(A / "phase_distributions" / "jenks_by_phase_summary.csv", dtype={"phase": str})
    jbins = pd.read_csv(A / "phase_distributions" / "jenks_by_phase.csv", dtype={"phase": str})
    ent = pd.read_csv(A / "phase_checkpoints" / "entropy.csv")
    res = pd.read_csv(A / "significance" / "results.csv")
    meta = json.loads((A / "significance" / "notes.json").read_text(encoding="utf8"))

    screens = OUT / "screens"
    order = ["17A", "PzGp1(-)", "III PzKo", "6A"]
    p = pairs.set_index("planned").loc[order].reset_index()
    a = arrival.set_index("phase").arrived_pct
    past_divs = jbins[jbins["class"] == "past"].groupby("phase").divisions.sum().reindex(jsum.phase, fill_value=0)
    turn = lambda bd: "on course" if abs(bd) <= 5 else f"{abs(bd)}° further {'south' if bd > 0 else 'north'}"
    gaps = res[res.test.str.startswith("Natural breaks")].reset_index(drop=True)
    gap_sig = [r.test.split("phase ")[1].split()[0] for r in gaps.itertuples() if r.p_holm < ALPHA]
    gap_hint = [r.test.split("phase ")[1].split()[0] for r in gaps.itertuples() if r.p < ALPHA and r.p_holm >= ALPHA]

    doc = Document()
    doc.styles["Normal"].font.size = Pt(10.5)
    for sec in doc.sections:  # 20 mm margins: the dashboard figures need the full width to stay legible
        sec.left_margin = sec.right_margin = sec.top_margin = sec.bottom_margin = Mm(20)
    bullet = lambda text: doc.add_paragraph(text, style="List Bullet")

    def lead(label, text):
        """A paragraph with a bold run-in label: 'What we did.', 'How to read it.', 'What it shows.'"""
        q = doc.add_paragraph()
        q.add_run(label + " ").bold = True
        q.add_run(text)
        return q

    def keep(par):
        par.paragraph_format.keep_with_next = True  # stays on the page of what follows (a figure or table)
        return par

    def picture(path, mm, caption):
        doc.add_picture(str(path), width=Mm(mm))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.paragraphs[-1].paragraph_format.keep_with_next = True  # the caption stays under its figure
        c = doc.add_paragraph()
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c.add_run(caption).font.size = Pt(8.5)

    # Title
    doc.add_heading("Army Group South, June–July 1941: plan versus what happened", level=1)
    doc.add_paragraph("Progress report for Dr. Sorin Adam Matei, prepared by Gavin Ho, 9 November 2026. It explains what we have "
                      "done since the meeting of 6 November, how each analysis works, and how to read its figures, so that it can be "
                      "shared with the historians on the project. Frontier Breakthrough only. Every number comes from the project "
                      "data and can be explored in the interactive dashboard (Barbarossa.html); the significance tests are set out "
                      "in full on its Statistics page (Statistics.html).")

    doc.add_heading("In short", level=2)
    worst = sub.loc[sub.straight_bearing_diff.abs().idxmax()]
    bullet(f"The four planned lines of operation were broadly followed (overall agreement {p.score_overall.min()}–{p.score_overall.max()} "
           f"out of 100), but the {NAMES[worst.planned]} turned {turn(int(worst.straight_bearing_diff))} than planned between "
           f"phases {worst.stretch.replace('-', ' and ')}.")
    bullet(f"On their planned dates, {a[1]}%, {a[2]}%, {a[3]}% and {a[4]}% of divisions had reached phase lines 1–4 (past the line "
           f"or within 10 km of it); none had reached phase 5.")
    bullet(f"Looked at more closely, those lines were met loosely: only a front group was entirely past each line (at most "
           f"{jsum.past.max()}% of divisions), while most divisions sat in groups on the line, some past it and some short.")
    bullet("From line to line the divisions advanced as two to three groups: a southern one built around the 17th Army and a "
           "northern one mixing the 6th Army with the panzer formations.")
    bullet("The statistical tests confirm that the groups follow the planned routes and formations far better than chance, and "
           "that the front shifted south at most phase lines. The natural-break groups on the planned dates are mostly a "
           f"description: only at phase {' and '.join(gap_sig) or 'none'} do they mark real gaps between clumps of divisions (section 6).")

    # About the data
    doc.add_heading("The data in brief", level=2)
    doc.add_paragraph(f"{meta['divisions']} German divisions of Army Group South, each with a daily position from 22 June to 5 August "
                      "1941, taken from georeferenced period maps and averaged when a division appears more than once on a day. The "
                      "four planned lines of operation and the five phase lines were digitized by Rob from the planning maps. Each "
                      "planned line is assigned to one formation: the 6th Army, III Panzer Corps, Panzer Group 1 without III Corps, "
                      "and the 17th Army. Planned dates for phase lines 1 and 2 come from the documents; for phases 3–5 the documents "
                      "only say 'mid-July', 'after mid-July' and 'late July', which we read as 22, 25 and 30 July. Positions carry "
                      "a mapping error of about 20 km, so differences smaller than that cannot be told apart from zero.")

    # 1. Lines of operation
    doc.add_heading("1. Did the armies follow the planned lines of operation?", level=2)
    lead("What we did.", "Divisions that moved alike were grouped by the computer (k-means on where each division's path ended "
         "and the middle of its path), giving the five groups published earlier. Each planned line is paired with the group whose "
         "average path lies closest to it, and the pair is scored from 0 to 100 on three things: direction (the start-to-end "
         "bearing; 100 within 5° of the plan, 0 at 45°), route (the average gap along the planned line; 100 within 20 km, 0 at "
         "100 km) and destination (the gap between end points; 100 within 20 km, 0 at 150 km). The overall score is their average. "
         "A score of 100 means the difference is inside the mapping error.")
    reading = {"17A": "right direction and end point, by a different route", "PzGp1(-)": "on route, but missed the end point",
               "III PzKo": "as planned", "6A": "as planned overall, but bent north on the way"}
    keep(lead("What it shows.", "All four lines were broadly followed. The scores differ in where the difference lies:"))
    table(doc, pd.DataFrame({"Planned line": [NAMES[x] for x in p.planned], "Direction": p.score_direction, "Route": p.score_route,
                             "Destination": p.score_destination, "Overall": p.score_overall,
                             "Reading": [reading[x] for x in p.planned]}), widths=[46, 16, 13, 19, 14, 68])
    keep(lead("How to read Figure 1.", "Each card is one planned line. In the small map, the dashed white line is the plan, the "
              "coloured line is the average path of the paired group, and the grey band is a 50 km corridor around the plan. "
              "The bars below give the three scores."))
    picture(screens / "plan_cards_1.png", 160, "Figure 1a. Dashboard view, 17th Army and Panzer Group 1: planned line (dashed), "
            "paired group's path (coloured) and agreement scores.")
    picture(screens / "plan_cards_2.png", 160, "Figure 1b. The same for III Panzer Corps and 6th Army.")
    keep(doc.add_paragraph("A start-to-end score can hide a bend on the way, so two stretches were also compared on their own, "
                           "between two phase lines:"))
    table(doc, pd.DataFrame({"Stretch": [f"{NAMES[r.planned]}, phases {r.stretch.replace('-', ' to ')}" for r in sub.itertuples()],
                             "Heading vs plan": [turn(int(r.straight_bearing_diff)) for r in sub.itertuples()],
                             "Direction score": sub.score_direction, "Average gap": [f"{round(v)} km" for v in sub.mean_abs_offset_km],
                             "End gap": [f"{v} km" for v in sub.end_gap_km]}), widths=[56, 34, 26, 24, 24])
    doc.add_paragraph(f"Between phases 2 and 3 the 6th Army headed {abs(int(sub.straight_bearing_diff.iloc[0]))}° north of its plan "
                      "while staying within about 25 km of it: it bent north and came back, which the whole-route score of "
                      f"{p.set_index('planned').score_overall['6A']} does not show.")

    # 2. Arrival
    doc.add_heading("2. Did the divisions reach each phase line on time?", level=2)
    lead("What we did.", "On each phase line's planned date we counted the divisions that were past the line (east of it) or "
         "within 10 km short of it.")
    keep(lead("How to read Figure 2.", "One bar per phase line, labelled with its planned date; the height is the share of "
              "divisions that had reached the line by then."))
    picture(ROOT / "figures" / "arrival" / "arrival_bars.png", 110, "Figure 2. Share of divisions at or past each phase line on its "
            "planned date (10 km rule).")
    lead("What it shows.", f"About half to three quarters of the divisions reached phases 1–3 on time ({a[1]}%, {a[2]}%, {a[3]}%), "
         f"{a[4]}% reached phase 4, and none had reached phase 5 by 30 July. The 10 km margin is a fixed rule, though, and the same "
         "share can hide very different situations, which is what section 3 looks at.")

    # 3. Natural breaks
    doc.add_heading("3. How were the divisions spread around each line?", level=2)
    lead("Why.", "The 10 km rule counts a division as 'arrived' whether it was 9 km short or 100 km beyond the line. Two phase lines "
         "can both score 60% when in one most divisions barely reached the line and in the other most were far past it. Instead "
         "of a fixed margin, this analysis lets the spacing of the divisions decide the categories, the way Jenks natural breaks "
         "set the classes of a colour ramp in a GIS map.")
    lead("What we did.", "Three steps on each phase line's planned date. (1) Each division is placed on one line: its distance along "
         "the general direction of the whole advance (a bearing of about 101°, from the divisions' average starting position to "
         "their average final one). The shape of the phase line plays no part in this. (2) Jenks natural breaks cut that line where "
         "the divisions are farthest apart, into the fewest groups (bins) that together explain at least 90% of the spread; bin 1 "
         "is the one furthest forward. (3) Only then is each bin read against the phase line: past (every division in it had "
         "crossed), on the line (some had, some had not) or short (none had).")
    keep(lead("How to read Figure 3.", "One panel per phase line. Left to right is distance along the advance in km, rear (west) "
              "to front (east). In the upper half each circle is a division: filled if it had crossed the phase line, open if not; "
              "its colour is its bin (red = the front bin). Up and down in the upper half means nothing; the circles are only "
              "spread out so they do not overlap. The lower half counts the same divisions every 25 km, with each bar split by "
              "bin colour, so clumps and thin stretches show as tall and short bars. Dashed lines are the natural breaks. The teal "
              "band is where the phase line falls on this axis: it is a band rather than a line because the phase line runs at an "
              "angle to the advance."))
    picture(screens / "natural_breaks_strips.png", 160, "Figure 3. Dashboard view, phases 1–5 on their planned dates: divisions "
            "along the advance (top) and their count every 25 km (bottom), coloured by natural-break bin.")
    keep(lead("What it shows.", "The share of divisions in bins that were past, on or short of each line, next to the 10 km rule:"))
    table(doc, pd.DataFrame({"Phase (date)": [f"{r.phase} ({pd.Timestamp(r.date):%d %b})" for r in jsum.itertuples()],
                             "10 km rule": [f"{a[int(x)]}%" for x in jsum.phase], "Bins": jsum.bins,
                             "Past": [f"{r.past}% ({past_divs[r.phase]} div.)" for r in jsum.itertuples()],
                             "On the line": [f"{x}%" for x in jsum.straddling], "Short": [f"{x}%" for x in jsum.behind]}))
    bullet("Where the 10 km rule makes phases 1–4 look half met or better, the natural breaks show they were met loosely: only a "
           "front group was entirely past each line, and most divisions sat in groups on the line, some ahead of it and some short.")
    bullet("A bin can be on the line simply because the phase lines are slanted relative to the advance: its southern divisions may be past "
           "the line while its northern ones, at the same distance along the advance, are still short of it.")
    bullet("How firm are the bins? Jenks always finds breaks, so we tested whether they fall in real gaps (section 6). On the "
           "dates of phases 1–3 the divisions were spread fairly evenly, and the breaks are no wider than chance spacing would "
           "leave: the bins describe where the divisions stood but are not separate clumps. "
           + (f"At phase {' and '.join(gap_sig)} the gaps are clearly wider than chance would leave: a front group had pulled "
              "ahead of the rest. " if gap_sig else "")
           + (f"At phase {' and '.join(gap_hint)} they are wider too, but not beyond chance once corrected for the number of tests."
              if gap_hint else ""))
    keep(lead("How to read Figure 4.", "The same analysis on the map for phase 3 on 22 July: each dot is a division, coloured by "
              "its bin; the grey dashed lines are the natural breaks, drawn across the direction of the advance; the teal dashed "
              "line is the planned phase line."))
    picture(screens / "natural_breaks_phase3.png", 130, "Figure 4. Dashboard view, phase 3 on 22 July (key on the map).")

    # 4. Fighting groups
    doc.add_heading("4. Who advanced together from phase line to phase line?", level=2)
    lead("What we did.", "For every division we found the place and day it first crossed each phase line. At each line, divisions "
         "that crossed close together in place and in time were grouped (k-means on the two, choosing the number of groups that "
         "separates them best without leaving any division on its own). The groups at one line are then linked to the groups at the "
         "next by the divisions they share. A 'Start' column groups the divisions by where they stood on 22 June.")
    keep(lead("How to read Figure 5.", "Columns are the start line-up and phase lines 1–4. Each block is a group at that line; the "
              "number is how many divisions it had, and the coloured strips inside it show which formation they belonged to "
              "(6th Army, III Panzer Corps, Panzer Group 1, 17th Army, other or unidentified). The bands show where each group's "
              "divisions crossed the next line: a band splitting means a group divided, bands joining mean groups merged. Grey "
              "blocks are divisions that had not reached the next line by 5 August."))
    picture(screens / "flow_chart_app.png", 100, "Figure 5. Dashboard view: groups that crossed each phase line together, and "
            "where their divisions went next.")
    mixed = ent.dropna(subset=["entropy"]).query("divisions >= 5")  # the small groups say little about mixing
    lead("What it shows.", "The divisions advanced as two to three groups at each line, with an occasional small fourth. III Panzer "
         "Corps travelled with Panzer Group 1 rather than on its own. The southern group stayed mostly 17th Army throughout; the "
         "northern one mixed the 6th Army with the panzer formations.")
    bullet("How mixed each group of five or more divisions was, from 0 (one formation only) to 1 (all four in equal numbers), "
           "leaving out unidentified divisions: " + "; ".join(
               f"phase {ph}: " + ", ".join(f"{g.sector} ({g.divisions} div.) {g.entropy:.1f}" for g in mixed[mixed.phase == ph].itertuples())
               for ph in ["1", "2", "3", "4"] if (mixed.phase == ph).any()) + ".")

    # 5. Also explored
    doc.add_heading("5. Also explored: local groups, day by day", level=2)
    lead("What we did.", "Beyond what was discussed on 6 November: on every day, divisions within 30 km of each other, directly or "
         "through a neighbour, form a local group. The groups are followed from day to day by the divisions they share. The 30 km "
         "link is a choice, not an estimate.")
    keep(lead("How to read Figure 6.", "Time runs left to right, one column per day. Each bar is a local group, stacked from north "
              "(top) to south, its height the number of divisions in it. Groups that held together for 10 days or more are "
              "coloured by their main formation (labelled at the right, 'mixed' when no formation dominates); short-lived groups "
              "are grey. The faint bands link a group from one day to the next."))
    picture(screens / "local_groups_chart.png", 110, "Figure 6. Dashboard view: local groups day by day.")
    keep(lead("How to read Figure 7.", "One day on the map: outlines are local groups, labelled with their number and size; the "
              "shading is the density of divisions, from blue-grey (few) to amber (many)."))
    picture(screens / "local_groups_0721.png", 150, "Figure 7. Dashboard view, 21 July (key on the map).")
    lead("What it shows.", "Most local groups lasted only a few days. The 17th Army's group held together for all 45 days, while 6th "
         "Army, panzer and mixed groups formed in July as the front moved east.")

    # 6. Statistics
    doc.add_heading("6. How sure can we be? The significance tests", level=2)
    lead("What we did.", "For each pattern above that could be a coincidence, we compared the real data with many versions in which "
         "the pattern was removed on purpose: divisions shuffled into random groups, formation labels shuffled, or positions "
         "scattered at random. The p-value is how often those versions matched the real data; below 0.05 means the pattern is "
         f"unlikely to be chance. Because {len(res)} tests were run, every p-value is corrected (Holm method) so that a lucky "
         "result is not mistaken for a real one.")
    keep(lead("What it shows.", "The main patterns hold up:"))
    table(doc, tests_summary(res), widths=[50, 62, 38, 26])
    bullet("The agreement scores in section 1 and the shares in sections 2 and 3 are descriptions, not tests; the tests above are "
           "what say whether the patterns could be chance.")
    bullet("Divisions of one corps moved together under one order, so there are effectively fewer independent cases than "
           "divisions; p-values close to 0.05 should be read with care. With about 50 divisions, 'not significant' is weak evidence "
           "that there is no effect.")

    # 7. Done so far
    doc.add_heading("7. What we have done so far", level=2)
    for item in ["Digitized and cleaned daily division positions for four theaters, and built the interactive dashboard "
                 "(Barbarossa.html) with its Statistics page.",
                 "The analyses in this report: planned versus actual lines of operation, arrival at the phase lines, natural breaks "
                 "around each line, groups from phase line to phase line, and local groups day by day, each with its significance "
                 "test where one applies.",
                 "Black-and-white posture-over-time charts for the four theaters, for the paper."]:
        bullet(item)

    path = OUT / "Barbarossa brief 2026-11-09.docx"
    doc.save(path)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
