"""Black-and-white posture-over-time line charts for the paper (one per region).

Reads the exported AGOL points (data/agol_export/*_Points.geojson, made by
`python agol/download_agol.py --export data/agol_export <group url>`) and writes
figures/posture/<region>_posture.{pdf,png} (raw daily) and <region>_posture_3day.{pdf,png}
(3-day centered moving average), plus posture_by_day.csv (the raw plotted numbers).

Each line is the share of that day's recorded formations (records) in one posture, so a day
with more records does not outweigh one with fewer; the strip underneath shows records per day.
Usage: python figures/make_posture_charts.py
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "agol_export"
OUT = ROOT / "figures" / "posture"

# region -> (points file, title used in the paper)
REGIONS = {
    "frontier": ("Frontier_Points", "Frontier Breakthrough"),
    "smolensk": ("Smolensk_Points", "Smolensk Pocket"),
    "leningrad": ("Leningrad_Points", "Leningrad Approach"),
    "typhoon": ("Operation_Typhoon_Points", "Operation Typhoon"),
}
# Drawing order = legend order. Distinguishable without color: dash pattern + marker, all black.
STYLE = {
    "Attack": dict(ls="-", marker="o", lw=1.6),
    "Defend": dict(ls=(0, (5, 2)), marker="s", lw=1.4),
    "Move": dict(ls=(0, (1, 1.5)), marker="^", lw=1.6),
    "Reserve": dict(ls=(0, (6, 2, 1, 2)), marker="D", lw=1.3),
}
POSTURES = list(STYLE)

plt.rcParams.update({
    "font.family": ["Arial", "DejaVu Sans"],
    "font.size": 8,
    "pdf.fonttype": 42,  # embed TrueType so publishers' preflight does not complain
    "axes.linewidth": 0.6,
})


def load(region):
    """Daily posture counts for one region; rows without a date or posture cannot be plotted."""
    f, _ = REGIONS[region]
    domain = pd.read_csv(DATA / "domain_Posture.csv")
    label = dict(zip(domain.Code, domain.Label))
    with open(DATA / f"{f}.geojson", encoding="utf8") as fh:
        d = pd.DataFrame([x["properties"] for x in json.load(fh)["features"]])
    d = d.dropna(subset=["Date", "Posture"]).copy()
    d["Date"] = pd.to_datetime(d.Date.str[:10])
    d["Posture"] = d.Posture.astype(int).map(label)
    counts = pd.crosstab(d.Date, d.Posture).reindex(columns=POSTURES, fill_value=0)
    counts = counts.reindex(pd.date_range(counts.index.min(), counts.index.max()), fill_value=0)
    counts.index.name = "Date"
    return counts


def shares(counts, smooth):
    pct = counts.div(counts.sum(axis=1).replace(0, float("nan")), axis=0) * 100
    return pct.rolling(smooth, center=True, min_periods=1).mean() if smooth > 1 else pct


def plot(region, counts, smooth, out_stem):
    pct = shares(counts, smooth)
    n = counts.sum(axis=1)
    fig, (ax, bar) = plt.subplots(2, 1, figsize=(129 / 25.4, 3.2), sharex=True,
                                  gridspec_kw={"height_ratios": [4.2, 1], "hspace": 0.08})
    for p in POSTURES:
        s = STYLE[p]
        ax.plot(pct.index, pct[p], color="black", ls=s["ls"], lw=s["lw"], marker=s["marker"], ms=3.2,
                markevery=max(2, len(pct) // 9), markerfacecolor="white", markeredgewidth=0.8, label=p)
    ax.set_ylim(0, 100)
    ax.set_yticks(range(0, 101, 20))
    ax.set_ylabel("Share of recorded formations (%)")
    ax.grid(axis="y", color="0.85", lw=0.5)
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=4, frameon=False, handlelength=3.2, columnspacing=1.6)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)

    bar.bar(n.index, n.values, width=0.8, color="0.55")
    bar.set_ylabel("Records\nper day", fontsize=7)
    bar.set_ylim(0, n.max() * 1.15)
    bar.set_yticks([0, int(n.max() // 10 * 10) or int(n.max())])
    for side in ("top", "right"):
        bar.spines[side].set_visible(False)
    start, end = pct.index.min(), pct.index.max()
    ticks = pd.date_range(start, end, freq="7D")
    bar.set_xticks(ticks)
    bar.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    bar.xaxis.set_minor_locator(mdates.DayLocator())
    bar.set_xlim(start - pd.Timedelta(days=0.8), end + pd.Timedelta(days=0.8))
    bar.tick_params(axis="x", labelsize=7.5)
    fig.align_ylabels([ax, bar])
    fig.savefig(out_stem.with_suffix(".pdf"), bbox_inches="tight")
    fig.savefig(out_stem.with_suffix(".png"), dpi=600, bbox_inches="tight")
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for region in REGIONS:
        counts = load(region)
        plot(region, counts, 1, OUT / f"{region}_posture")  # raw daily shares
        plot(region, counts, 3, OUT / f"{region}_posture_3day")  # 3-day centered moving average, easier to read
        pct = counts.div(counts.sum(axis=1).replace(0, float("nan")), axis=0) * 100
        tab = counts.assign(Records=counts.sum(axis=1)).join(pct.add_suffix("_pct").round(1)).reset_index()
        tab.insert(0, "Region", REGIONS[region][1])
        rows.append(tab)
        print(f"{region:10s} {counts.index.min():%d %b} to {counts.index.max():%d %b %Y}: {len(counts)} days, "
              f"{int(counts.values.sum())} records, {int(counts.sum(axis=1).min())}-{int(counts.sum(axis=1).max())} per day")
    pd.concat(rows).to_csv(OUT / "posture_by_day.csv", index=False, date_format="%Y-%m-%d", encoding="utf-8")


if __name__ == "__main__":
    main()
