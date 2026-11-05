// One source for every "?" in the app. Keep each entry true to the code that computes it:
// app/src/map/expressions.ts, app/src/lib/crossing.ts, analysis/compare_loa.py, analysis/export_vectors.py.
export const HELP: Record<string, { title: string; body: string }> = {
  mode: {
    title: "Instant vs Progressive",
    body: "Instant shows only records dated the selected day. Progressive shows every record up to and including that day, so positions accumulate. Division paths: Instant shows legs under way that day (start ≤ day ≤ end); Progressive shows every leg started by that day. Cluster average paths ignore the date in Instant mode, as in the original web maps.",
  },
  clusterFilters: {
    title: "Cluster filters",
    body: "Each division path was assigned to one of five clusters per area, twice. Picking a cluster keeps only the division locations, division paths and cluster lines in it, and the charts and table follow. Five clusters per area were set by design; silhouette scores of 0.28–0.46 mean the groups are moderately distinct, a description of a largely continuous advance rather than evidence of command groupings.",
  },
  geo: {
    title: "Geometric clustering",
    body: "Groups divisions whose paths followed similar corridors: the symmetric Hausdorff distance (the greatest distance from any point on one path to the nearest point on the other) for every pair of paths, then average-linkage hierarchical clustering. The line drawn is the cluster's average path (see 'Average path').",
  },
  dv: {
    title: "Directional-vector clustering",
    body: "Groups divisions by where they went: each path is reduced to four numbers, the coordinates of its end point and of its centroid, and those are grouped with k-means. Divisions sharing an objective group together even when their routes differ. The line drawn is the cluster's average path (see 'Average path'). In Progressive mode its color is speed (km/day); width follows the cluster's division count.",
  },
  avgPath: {
    title: "Average path",
    body: "Every member path is resampled to 50 points spaced evenly along its length, and the 1st points, 2nd points … 50th points are averaged. The result is the cluster's central corridor. Because resampling follows length, not date, it shows where a group went, not when.",
  },
  paths: {
    title: "Division paths",
    body: "One line per formation, joining its daily positions in date order. Where main body and detachments were drawn apart, the day's position is their location weighted by fractional strength. Points within 30 km in map units (about 17 km on the ground at 55°N) were merged to remove digitizing jitter.",
  },
  points: {
    title: "Division locations",
    body: "One record per formation symbol on each day's situation map, with branch, unit type, posture, nation and fractional strength (1/10 to full). A formation can have more than one record a day when parts of it were drawn in different places.",
  },
  heat: {
    title: "Division heatmap",
    body: "Kernel density of the division records, each weighted by its fractional strength, so a full division counts ten times a 1/10 detachment. Radius is set in the layer style.",
  },
  ellipses: {
    title: "Center of mass ellipses",
    body: "For each day, the standard deviational ellipse of that day's division positions (ArcGIS Directional Distribution): its centre is the mean position and its axes the spread along the main and cross directions. The published layer does not record whether it is drawn at 1 or 2 standard deviations.",
  },
  vectors: {
    title: "Cluster vectors",
    body: "Each cluster's average path simplified to the fewest straight vectors (1–3) whose RMS distance to the path is within 10 km. The vertex positions are chosen by a dynamic program that minimizes the summed squared distance, with every vector at least 60 km long so digitizing jitter (5–10 km) cannot create a vector. Fitted in an equidistant projection centred on the area; bearings and lengths are then measured on the ellipsoid, not in Web Mercator, which stretches distances 1.6× at 50°N.",
  },
  bearing: {
    title: "Bearing",
    body: "Geodesic azimuth at the start of the vector, in degrees clockwise from true north (90° = due east). The letters give the 16-point compass direction.",
  },
  turn: {
    title: "Turn",
    body: "Change of direction at a vertex: the next vector's starting azimuth minus the previous vector's arrival heading. Positive = turned clockwise (to the right), negative = to the left.",
  },
  rms: {
    title: "Fit (RMS)",
    body: "Root-mean-square distance between 120 points spaced along the average path and the vector line. Under 10 km the vectors are a faithful summary. Above it, the path is too short or too curved to take more 60 km vectors, so treat the vectors as rough.",
  },
  stable: {
    title: "Stable",
    body: "Refits the same number of vectors with a 40 km and an 80 km minimum vector length. Yes = every bearing stays within 10°, so the result does not hinge on the 60 km choice. n/a = a single vector, or no alternative could be fitted.",
  },
  members: {
    title: "Divisions",
    body: "Number of formations whose paths belong to this cluster. Averages of one or two paths describe those divisions, not a group.",
  },
  loo: {
    title: "Line of operations",
    body: "The paper's single-vector summary: the mean of the members' start points to the mean of their end points, measured on the ellipsoid.",
  },
  directness: {
    title: "Directness",
    body: "Length of the line of operations divided by the mean length of the member paths. Near 1: the group went more or less straight at its objective. Lower: it wandered, doubled back or dispersed.",
  },
  planMatch: {
    title: "Matched planned line",
    body: "Frontier only. Each of the four planned AGS lines of advance (digitized from the historian's slide, ±5–10 km) is paired with one cluster by the smallest total Fréchet distance (Hungarian assignment), compared over the stretch both lines cover. The comparison keeps three vectors on both lines so they can be compared vector by vector, so its numbers come from analysis/compare_loa.py rather than this card's vectors.",
  },
  frechet: {
    title: "Fréchet distance",
    body: "The shortest leash that lets a walker on the planned line and one on the realized line both go from start to end without backtracking: the largest gap you are forced to accept when the lines are traversed in order. Unlike Hausdorff it respects direction of travel.",
  },
  offset: {
    title: "Mean offset",
    body: "Every 10 km along the planned line, the distance to the nearest point of the realized line, signed + if the realized line lies to the left of the direction of travel (north for an eastward line) and − to the right. Averaged over the shared stretch. 'Beyond noise' is the share of those points more than 20 km off.",
  },
  within50: {
    title: "Within 50 km",
    body: "Share of the realized line (sampled every 10 km) lying within 50 km of the planned line.",
  },
  membership: {
    title: "Divisions agree",
    body: "Checks the distance-based pairing against the order of battle: yes when this cluster also holds the largest share of the planned unit's own divisions (from the researched unit-name table). No means the line that looks closest is not where that unit's divisions went. III PzKo's divisions, for example, sit in the same cluster as most of PzGp1(–).",
  },
  noise: {
    title: "Mapping error band",
    body: "Differences under about 20 km or 10° are treated as noise: the planned lines were hand-drawn (±5–10 km), the situation maps are georeferenced to 3–4 km in the interior and 13–40 km at the edges, and positions were merged within about 17 km. The pre-war plan itself was vague, so even larger gaps may be within intent.",
  },
  branchChart: {
    title: "Branch composition",
    body: "Count of division records on the selected day by branch, after the cluster filters. Click a bar to filter the map to that branch.",
  },
  postureChart: {
    title: "Posture over time",
    body: "Number of division records per day in each posture (move, reserve, attack, defend) across the area's whole period; the dashed line marks the selected day. Days with more records count more, so read with the record total in mind. The paper's figures show shares instead.",
  },
  postureDays: {
    title: "Division days by posture",
    body: "Records by posture on the selected day (left) and on every day up to it (right), after the cluster filters.",
  },
  divisionDays: {
    title: "Division days",
    body: "Days each division was recorded active, split by posture, from the project's division_days tables on ArcGIS Online. A recount from the current points layer (October 2026) does not reproduce these totals, so treat them as provisional.",
  },
  planVsActual2: {
    title: "Planned vs actual",
    body: "Each planned AGS line of advance (digitized from Rob Kirchubel's slide, ±5–10 km) is paired with the realized group whose average path is closest to it overall (smallest Fréchet distance, one group per line). The card shows both on one small map, says in words how far apart they ran, and plots the gap along the way. 'On plan' = on average within 20 km, the mapping-error band; 'near plan' = within 50 km; 'off plan' = further.",
  },
  planCorridor: {
    title: "50 km corridor",
    body: "The pale band is everything within 50 km of the planned line. A realized path inside it ran close to the plan; the card gives the share of its length inside. 50 km is roughly a corps' frontage, so it is a generous test; 20 km is the mapping-error band.",
  },
  gapStrip: {
    title: "Gap along the way",
    body: "How far north (up) or south (down) of the planned line the realized group ran, every 10 km along the planned route from start to end. The grey band is ±20 km, within mapping error: a line inside it means the two cannot be told apart.",
  },
  whyFour: {
    title: "Published 5 or recommended 4",
    body: "The published Frontier clusters use 5 groups, a choice made for the original web maps. Two of them turn out to be divisions that barely advanced (security and rear-area divisions in the west, 22, 76 and 239 ID in the south: 20–190 km, against 400–750 km for most). The data do not single out 5: the separation score (silhouette) is no better at 5 than at 2–3. Recommended: set aside the 7 divisions that moved under 200 km as 'stayed behind' and group the other 44 with the same method into 4, one per planned line. The groups come out balanced (7/11/12/14). Both are shown so the change can be judged; the evidence is in analysis/loa_frontier/cluster_count.csv.",
  },
  matchplan: {
    title: "Planned lines",
    body: "The four planned AGS lines of advance (6th Army, III Panzer Corps, Panzer Group 1 less III Corps, 17th Army), dashed.",
  },
  matchreal: {
    title: "Matched groups",
    body: "The average path of the realized group paired with each planned line, for the clustering chosen in the Vectors tab (published 5 or recommended 4), with arrows in the direction of travel.",
  },
  naturalzones: {
    title: "Natural breaks: front sectors",
    body: "In each stretch between two phase lines, the divisions' north–south positions (every daily location, weighted by strength) are split by Jenks natural breaks into the sectors where they bunched. Breaks fall where few division-days were spent. The app uses the fewest sectors (2–5) that explain at least 80% of the spread (goodness of variance fit 0.8, the usual rule). Brighter = a larger share of the stretch's division-days.",
  },
  frontProfile: {
    title: "Front profile",
    body: "One panel per stretch between phase lines, north at the top. The shape is where the divisions spent their days along the front (share of division-days, weighted by strength); the dashed outline is the stretch before, for comparison. Solid line: the centre of weight. Dotted lines: the natural breaks between sectors (see the map layer Natural Breaks). The axis is latitude only, so a town named beside it marks how far north, not that the front was there.",
  },
  placesInLine: {
    title: "Places in line",
    body: "Each line is one division: its average north–south position in each stretch between phase lines. Lines running side by side mean divisions kept their order along the front; crossing lines mean they swapped places. Colour = the checkpoint group the division crossed the phase line with; thick lines are breakaways. Hover a line for the division.",
  },
  checkpoints: {
    title: "Phase lines as checkpoints",
    body: "Each phase line is treated as a checkpoint. For every Wehrmacht/SS division the app finds where and on which day its track first crossed the line (between the two daily positions either side of it; lines extended straight north and south). Divisions that crossed close together in place and time form a group. A colour is one group: at each later line, a group keeps the colour of the earlier group most of its divisions came from. In the first line the colours run north to south.",
  },
  checkGroups: {
    title: "How many groups",
    body: "At each line the crossings are grouped by place along the line and by day (k-means on both, scaled alike). The app tries 2 to 5 groups and keeps the number whose groups are most distinct (best silhouette), skipping any split that leaves a division on its own. Fewer divisions reach the later lines, so they have fewer groups.",
  },
  flowChart: {
    title: "Flow between lines",
    body: "Each column is a phase line; each block a group that crossed it, its height the number of divisions. Bands show where a group's divisions crossed the next line: with the same group, with another one (the group divided or merged), or not at all by 5 August (grey). Hover for the numbers.",
  },
  breakaway: {
    title: "Broke away",
    body: "One or two divisions (under a quarter of their group) that crossed the next line with a different group from the rest. A larger share going elsewhere shows in the flow chart as the group dividing, not as breakaways.",
  },
  checklines: {
    title: "Phase lines",
    body: "The AGS phase lines digitized from Rob Kirchubel's slide (hand-drawn, ±5–10 km). The checkpoints are measured where division tracks cross them.",
  },
  checkpaths: {
    title: "Checkpoint group paths",
    body: "For a group that carries on from one line to the next, a straight arrow from where its divisions crossed the first line (their average crossing point) to where they crossed the next. It shows which way the group went, not its route.",
  },
  checkdots: {
    title: "Crossings",
    body: "Where each division's track first crossed a phase line, coloured by the group it crossed with. Click one for the division and day.",
  },
  phaseClusters: {
    title: "Clusters per phase stretch",
    body: "Each Wehrmacht/SS division path is cut where it crosses each AGS phase line (lines extended straight north and south), giving one piece per stretch: Frontier–A, A–B, B–C, C–D, D–E. Pieces under 25 km are dropped. The pieces in each stretch are clustered into 4 groups with the same two methods as the whole-period clusters, then the stretches are linked by the divisions they share: each group keeps the colour of the group it shares most divisions with in the stretch before, so one colour follows one group of divisions across the map. In the first stretch the colours run north to south.",
  },
  phaseavg: {
    title: "Phase cluster paths",
    body: "The average path of each cluster within one stretch between phase lines (each member piece resampled to 50 points, averaged point by point), with arrows in the direction of travel. The same colour in the next stretch is the same group of divisions continuing; the thin coloured lines (Phase · Division Pieces in the layer list) are the divisions themselves.",
  },
  phasepieces: {
    title: "Division pieces",
    body: "Each division's path between two consecutive phase lines, coloured by the cluster it falls in for the chosen method.",
  },
  phaseStep: {
    title: "Step through the lines",
    body: "Pick a phase line to see only it on the map: the teal dashed line itself; a dot where each division crossed it, coloured by the group it crossed with; arrows showing each group arriving from the line before; and the shaded sectors of the stretches just before and just after it, brighter where more divisions spent their days. If the bright bands and the coloured groups keep the same north–south order line after line, the front advanced as one piece; where they jump, it reshaped. The card below says the same in words. All shows every line at once.",
  },
  frontShape: {
    title: "How the front changed at the line",
    body: "Compares where along the front (north to south) the divisions were in this stretch with the next one, using every daily division location, weighted by strength. Shape: whether the divisions bunched in the same places (correlation of the two north-south spreads; 0.7+ = same shape). Centre of weight: how far the average position moved; under 20 km is within mapping error. Places in line: whether a division further north stayed further north (rank correlation; 0.8+ = kept their places). On the map (pick the line above), the shaded bands either side of the line show the same thing: bright bands continuing across the line at the same latitudes = same shape; bands jumping south = the weight moved. The numbers are in Method check. A stretch is a place, not a time, so divisions still behind the line count in the earlier stretch.",
  },
  silhouette: {
    title: "Silhouette",
    body: "How distinct the clusters in this stretch are, from −1 to 1: for each piece, how much closer it is to its own cluster than to the next one, averaged. 0.25–0.5 is moderately distinct; above 0.5 well separated. The whole-period clusters score 0.28–0.46.",
  },
  split: {
    title: "Splits",
    body: "A division that did not go on with the rest of its group past the next phase line: the left swatch is the group it was in, the right one the group it joined. Only splits that both clustering methods find are listed; a split found by one method alone may just be a division near a group boundary switching sides.",
  },
  planVsActual: {
    title: "Phase-line crossings",
    body: "For each planned phase line, only division points within the line's north–south extent are used. A point has reached the line when it lies east of it or no more than the reach distance (default 20 km) short of it. Lead = first day any of them had reached it; main body = first day at least half of that day's points had. Late/early compares the main-body day with the end of the planned window.",
  },
  reach: {
    title: "Reach distance",
    body: "How far short of a phase line a unit can be and still count as having reached it. The default, 20 km, matches the mapping-error band: the hand-drawn lines (±5–10 km), georeferencing (3–4 km inland) and the ~17 km position merging mean a unit closer than that cannot be told apart from one on the line. Set 0 to count only units past the line; move it to see how sensitive the dates are.",
  },
};
