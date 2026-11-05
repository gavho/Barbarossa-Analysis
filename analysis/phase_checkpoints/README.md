# Phase lines as checkpoints

`python analysis/phase_checkpoints.py` — who crossed each AGS phase line together, where along it, and when.
Shown in the app's Phases tab (map layers "Checkpoint ·", a flow chart, and one card per line).

## Method
1. Each Wehrmacht/SS division's daily position: its day's locations (Frontier_Points) averaged, weighted by strength.
2. Its first crossing of each phase line (lines extended straight north and south): the crossing point, and a day
   interpolated between the daily positions either side of the line. A division already past a line on its first
   recorded day has no crossing for that line.
3. At each line, crossings are grouped by place along the line and by day (both standardized; k-means, `random_state=42`).
   The number of groups (2–5) is the one with the best silhouette among splits that leave no division on its own.
4. Groups at line A are numbered north to south. At each later line a group takes the number of the earlier group it
   shares most divisions with (`phase_clusters.follow_groups`), so one map colour follows one group.
5. Flows between consecutive lines feed the flow chart. A small flow (at most 2 divisions, under a quarter of the group)
   to a different group is a breakaway, listed by name; a larger one shows as the group dividing.

## Outputs
- `crossings.csv` — division, line, crossing point (km), day, group
- `groups.csv` — per line and group: divisions, sector, first / median / last crossing date, members
- `flows.csv` — divisions from each group at one line to each group at the next (or not reaching it)
- `breakaways.csv`

## Caveats
- Positions are daily, so a crossing day is good to about a day; the lines are hand-drawn (±5–10 km).
- A division counts as crossing only when its track passes the line; the Plan vs Actual tab's reach distance is not applied.
- Only one division had crossed line E by 5 August, so line E has no groups.
- Grouping uses place and day scaled alike, so a week apart weighs about as much as the spread of the line; a first and a
  second wave crossing the same sector show as separate groups.

The between-the-lines clusters (`analysis/phase_clusters/`) stay as a method check, under "Method check" in the tab.
