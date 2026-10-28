# data/agol_export

Live copy of the public ArcGIS Online layers (Purdue FORCES group `3c03d7fd9e3c4384bd282062b2430906`),
exported 2026-10-28: one GeoJSON (EPSG:4326) per feature layer, one CSV per table, 32 files. Feature counts
were checked against the server for every layer. The posture-by-day content is identical to the
`agol/AGOL_snapshot_20261022.gdb` snapshot.

Refresh from the repo root:

    python agol/download_agol.py --export data/agol_export "https://purdueuniversity.maps.arcgis.com/home/group.html?id=3c03d7fd9e3c4384bd282062b2430906"

Notes
- Codes are raw (for example `Posture` 1-4); decode with the `domain_*.csv` tables.
- `Frontier_Points` has Security/Cavalry swapped in its own service domain (codes 1 and 2); `domain_Branch_Type.csv` is the one the other regions use.
- `Leningrad_Points` has one row with no date or geometry.
- The paper's posture charts are built from these files: `python figures/make_posture_charts.py`.
