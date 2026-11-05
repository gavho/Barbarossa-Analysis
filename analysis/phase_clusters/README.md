# Clusters per phase stretch (Frontier box)

Run from the repo root: `python analysis/phase_clusters.py` (checks: `python analysis/test_phase_clusters.py`).

Sorin's idea (meeting 10-30-2026): the published clusters treat the whole advance as one flow, so re-cluster the division
paths separately within each stretch between the AGS phase lines and connect the stretches to reconstruct the battle.

## Method
1. Each Wehrmacht/SS division's path (the Frontier paths layer holds no Hungarian or Slovak paths) is resampled every 2 km.
2. Phase lines a–e are extended straight north and south, so every position is either short of a line or past it. Each
   path is cut into pieces: Frontier→A, A→B, B→C, C→D, D→E, from where it first entered a stretch to where it first entered
   the next. Pieces shorter than 25 km are dropped (that's mostly the ~17 km position merging, not movement).
3. The pieces in each stretch are clustered into 4 groups, using the two methods of the original OP-Barbarossa scripts:
   - geometric: symmetric Hausdorff distance, average-linkage agglomerative clustering
   - directional vector (DV): k-means on end point + centroid, `random_state=42`
   Clusters in the first stretch are numbered 0–3 from north to south; in each later stretch a cluster takes the number of
   the previous stretch's cluster it shares most divisions with, so one number (and map colour) follows one group.
4. Each cluster gets an average path (the paper's 50-point average), a start→end bearing and length, and its directness.
5. Stretches are linked by the divisions they share (`transitions.csv`). A *split* is a division that did not follow the
   majority of its cluster into the next stretch. `in_both_methods` marks splits that both clusterings find; trust those.

## Files
- `phase_clusters_dv.*`, `phase_clusters_geo.*`: one map panel per stretch (thin = division pieces, thick = cluster average path)
- `clusters.csv`: one row per stretch × method × cluster, with members, silhouette, bearing, length, directness
- `transitions.csv`, `splits.csv`, `pieces.geojson`, `average_paths.geojson` (open both GeoJSON files in ArcGIS Pro)
- `validation.csv`: re-running the original whole-path clustering (k = 5) reproduces the published clusters with adjusted
  Rand index 0.84 (DV) and 0.83 (geometric) in Web Mercator, as the original ran. Not identical, because the published
  path geometry differs slightly from the original input.

## Read with care
- 4 clusters are forced in every stretch. A cluster of one division (e.g. 239th Infantry in A→B, arriving from the south
  with 11th Army) is an outlier, not a group.
- Silhouette 0.34–0.54 per stretch: moderately distinct groups, a description of the advance, not command groupings.
- The geometric method is sensitive to projection (adjusted Rand 0.68 vs the published clusters in true-distance km, 0.83
  in Web Mercator). This analysis uses true-distance km.
- Splits found by only one method can be a division near a group boundary flipping sides, not a real departure.
- The D→E stretch has only 23 pieces, and no division's main body passed Line E before the data ends (5 Aug).
