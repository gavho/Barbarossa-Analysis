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
  planVsActual: {
    title: "Phase-line crossings",
    body: "For each planned phase line, only division points within the line's north–south extent are used. A point has reached the line when it lies east of it or no more than the reach distance (default 20 km) short of it. Lead = first day any of them had reached it; main body = first day at least half of that day's points had. Late/early compares the main-body day with the end of the planned window.",
  },
  reach: {
    title: "Reach distance",
    body: "How far short of a phase line a unit can be and still count as having reached it. The default, 20 km, matches the mapping-error band: the hand-drawn lines (±5–10 km), georeferencing (3–4 km inland) and the ~17 km position merging mean a unit closer than that cannot be told apart from one on the line. Set 0 to count only units past the line; move it to see how sensitive the dates are.",
  },
};
