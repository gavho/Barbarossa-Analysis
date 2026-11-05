# Planned lines of advance vs realized paths (Frontier box, Army Group South)

Run from the repo root: `python analysis/compare_loa.py` (checks: `python analysis/test_compare_loa.py`).

**Inputs.** Planned lines: `milestones/AGS_Milestones.gdb` (hand-digitized from the historian's slide, roughly ±5-10 km).
Realized: cluster average paths in `data/agol_export/` (directional-vector = DV, primary; geometric = GEO, robustness) and each
formation's own path (`Frontier_Paths`). Which army a formation belongs to comes from `agol/frontier_unit_names.csv`;
formations whose group is not identified count as "unknown" and are left out of the unit lines.

## Three comparisons
| Run | Realized line | Pairing |
|---|---|---|
| `DV`, `GEO` | the stored cluster average paths | one-to-one, minimum Frechet distance (Hungarian assignment) |
| `UNIT` | the average path of each planned unit's own divisions (the paper's 50-point average, rebuilt from member paths) | fixed: 6A, III PzKo, PzGp1(-), 17A |

`UNIT` does not depend on how k-means grouped the divisions. The script checks that rebuilding the stored cluster paths from
their members reproduces them (`reconstruction_check.csv`, mean gap 3-9 km) and stops if that ever exceeds 20 km.

## Method
1. All geometry in one azimuthal-equidistant projection (km, origin 50N 29E), lines oriented west to east.
2. Each pair is clipped to the stretch of both lines between the same two x positions (at least 100 km shared).
3. Each clipped line is simplified to at most 3 straight vectors (dynamic program, each vector at least 60 km; also run at 40 and 80 km).
4. Differences: per-vector bearing, turn and end-point gap; Frechet and Hausdorff distance; signed cross-track offset (north +) every
   10 km along the planned line; share of the realized line within 25 / 50 km of the plan; spacing between adjacent lines at transects.
5. Anything under 20 km or 10 degrees is flagged as within mapping error (`beyond_noise`, `share_beyond_noise_pct`).

## Files
- `pairs.csv` one row per planned line per run (start with `UNIT`); `segments.csv` the vectors (`min_seg_km` 60 is primary, 40/80 are the sensitivity)
- `membership.csv` army mix and planned-unit precision/recall per cluster; `frechet_matrix.csv`; `spacing.csv`; `reconstruction_check.csv`
- `frontier_loa_comparison.*` (DV clusters) and `frontier_loa_units.*` (unit lines): plan view above, offset profile below, black and white, 129 mm wide

## How many clusters? (`cluster_count.csv`, run `DV4`)
The published Frontier clusters use 5. Two of them are divisions that barely advanced: rear-area and security divisions in the
west, and 22, 76 and 239 ID in the far south (start-to-end 19–192 km, against 400–750 km for most). The silhouette does not
single out 5 (DV 0.45 at 5, 0.45–0.51 at 2–3). Recommended alternative, run as `DV4`: set aside the 7 divisions that moved
under 200 km ("stayed behind") and cluster the other 44 with the same DV method into 4, one per planned line. Groups come
out 7/11/12/14 (computed in km; the published run used Web Mercator, so 5-cluster sizes in `cluster_count.csv` differ from
the published ones). Against the plan, `DV4` is closer on 17A, PzGp1(-) and 6A and similar on III PzKo; the membership check
is unchanged (6A and III PzKo divisions mostly sit in other groups).

`plan_vs_actual_DV.*` and `plan_vs_actual_DV4.*`: one panel per planned line for readers who will not read the tables:
planned line dashed, matched group solid, 50 km corridor grey, the gap along the way underneath, a plain-language verdict.
The app's Vectors tab shows the same, with a toggle between the two.

## Read with care
- The realized paths cover 22 Jun - 5 Aug only; the planned lines go further (the Vinnytsia/Uman turn is partly outside the data).
- The pre-war plan was vague. The 20 km band is mapping error, not how precisely the plan was meant to be followed.
- The 6A and PzGp1(-) unit lines average divisions spread across the whole front, while the plan is a single axis, so offsets for those partly reflect that.
- III PzKo rests on only 3 formations. 17 of 51 formations have no confirmed army and are not in any unit line.
