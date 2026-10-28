"""Black-and-white posture-over-time charts for the paper, two designs per region.

Reads the exported AGOL points (data/agol_export/*_Points.geojson, made by
`python agol/download_agol.py --export data/agol_export <group url>`) and writes to figures/posture/:
  <region>_posture_lines.{pdf,png}   one panel, four lines, labels on the lines (3-day moving average)
  <region>_posture_panels.{pdf,png}  one small panel per posture, raw daily data (gray) under the 3-day average (black)
  posture_by_day.csv                 the numbers behind both (raw counts, raw %, 3-day %)

Each value is the share of that day's recorded formations (records) in one posture, so a busy day
does not outweigh a quiet one. The strip underneath shows records per day; days with fewer than
THIN records are shaded because shares computed from a handful of records are unreliable.
Figures are 129 mm wide (Springer 2/3-page width). Usage: python figures/make_posture_charts.py
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

REGIONS = {  # region -> (points file, title used in the paper)
    "frontier": ("Frontier_Points", "Frontier Breakthrough"),
    "smolensk": ("Smolensk_Points", "Smolensk Pocket"),
    "leningrad": ("Leningrad_Points", "Leningrad Approach"),
    "typhoon": ("Operation_Typhoon_Points", "Operation Typhoon"),
}
# Order follows the paper's argument: the active postures first, the static ones last.
POSTURES = ["Move", "Attack", "Defend", "Reserve"]
# Distinguishable without color: dash pattern and weight; every line is also labeled directly.
LINE = {
    "Move": dict(ls=(0, (1, 1.4)), lw=2.2),
    "Attack": dict(ls="-", lw=2.0),
    "Defend": dict(ls=(0, (5, 2)), lw=1.8),
    "Reserve": dict(ls=(0, (6, 2, 1.2, 2)), lw=1.8),
}
SMOOTH = 3  # days, centered moving average
THIN = 20  # records per day below which a day is shaded as thin coverage
WIDTH_IN = 129 / 25.4

plt.rcParams.update({
    "font.family": ["Arial", "DejaVu Sans"],
    "font.size": 8,
    "pdf.fonttype": 42,  # embed TrueType so publishers' preflight does not complain
    "axes.linewidth": 0.6,
})


def load(region):
    """Daily posture counts for one region; rows without a date or posture cannot be plotted."""
    f, _ = REGIONS[region]
    label = dict(pd.read_csv(DATA / "domain_Posture.csv")[["Code", "Label"]].values)
    with open(DATA / f"{f}.geojson", encoding="utf8") as fh:
        d = pd.DataFrame([x["properties"] for x in json.load(fh)["features"]])
    d = d.dropna(subset=["Date", "Posture"]).copy()
    d["Date"] = pd.to_datetime(d.Date.str[:10])
    d["Posture"] = d.Posture.astype(int).map(label)
    counts = pd.crosstab(d.Date, d.Posture).reindex(columns=POSTURES, fill_value=0)
    counts = counts.reindex(pd.date_range(counts.index.min(), counts.index.max()), fill_value=0)
    counts.index.name = "Date"
    return counts


def shares(counts):
    raw = counts.div(counts.sum(axis=1).replace(0, float("nan")), axis=0) * 100
    return raw, raw.rolling(SMOOTH, center=True, min_periods=1).mean()


def spread(values, gap, lo, hi):
    """Label positions: keep the order of `values`, move neighbors apart symmetrically until `gap` apart, inside [lo, hi]."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    pos = [values[i] for i in order]
    for _ in range(200):
        moved = False
        for k in range(1, len(pos)):
            deficit = gap - (pos[k] - pos[k - 1])
            if deficit > 1e-9:
                pos[k - 1] -= deficit / 2
                pos[k] += deficit / 2
                moved = True
        pos = [min(max(p, lo + k * gap), hi - (len(pos) - 1 - k) * gap) for k, p in enumerate(pos)]
        if not moved:
            break
    out = [0.0] * len(values)
    for k, i in enumerate(order):
        out[i] = pos[k]
    return out


def style_axes(ax):
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.grid(axis="y", color="0.86", lw=0.5)
    ax.set_axisbelow(True)


def thin_runs(n):
    """Contiguous runs of days with fewer than THIN records, as (first day, last day)."""
    runs, start = [], None
    for day, v in n.items():
        if v < THIN and start is None:
            start = day
        elif v >= THIN and start is not None:
            runs.append((start, prev))
            start = None
        prev = day
    if start is not None:
        runs.append((start, prev))
    return runs


def shade_thin(axes, n):
    for a, b in thin_runs(n):
        for ax in axes:
            ax.axvspan(a - pd.Timedelta(days=0.5), b + pd.Timedelta(days=0.5), color="0.93", lw=0, zorder=0)


def finish_strip(bar, n, start, end):
    bar.bar(n.index, n.values, width=0.8, color="0.45", zorder=2)
    bar.set_ylabel("Records\nper day", fontsize=7)
    top = int(n.max() // 10 * 10) or int(n.max())
    bar.set_ylim(0, n.max() * 1.15)
    bar.set_yticks([0, top])
    for side in ("top", "right"):
        bar.spines[side].set_visible(False)
    bar.set_xticks(pd.date_range(start, end, freq="7D"))
    bar.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    bar.xaxis.set_minor_locator(mdates.DayLocator())
    bar.set_xlim(start - pd.Timedelta(days=0.8), end + pd.Timedelta(days=0.8))
    bar.tick_params(axis="x", labelsize=7.5)


def plot_lines(counts, stem):
    _, smooth = shares(counts)
    n = counts.sum(axis=1)
    start, end = smooth.index.min(), smooth.index.max()
    fig, (ax, bar) = plt.subplots(2, 1, figsize=(WIDTH_IN, 3.15), sharex=True,
                                  gridspec_kw={"height_ratios": [4.4, 1], "hspace": 0.1})
    fig.subplots_adjust(left=0.105, right=0.845, top=0.98, bottom=0.1)
    shade_thin([ax, bar], n)
    for p in POSTURES:
        ax.plot(smooth.index, smooth[p], color="black", solid_capstyle="round", **LINE[p])
    ax.set_ylim(0, 80)
    ax.set_yticks(range(0, 81, 20))
    ax.set_ylabel("Share of recorded formations (%)")
    style_axes(ax)
    ends = [smooth[p].dropna().iloc[-1] for p in POSTURES]
    span = (end - start).days
    x_text = end + pd.Timedelta(days=0.025 * span + 0.8)
    x_line = end + pd.Timedelta(days=0.6)
    for p, y_end, y in zip(POSTURES, ends, spread(ends, 5.2, 3, 77)):
        ax.plot([x_line, x_text - pd.Timedelta(days=0.4)], [y_end, y], color="0.45", lw=0.5, clip_on=False)  # leader
        ax.text(x_text, y, p, va="center", ha="left", fontsize=8, clip_on=False)
    if thin_runs(n):
        a, b = thin_runs(n)[0]
        ax.text(a, 78.5, f"fewer than {THIN} records/day", fontsize=6.5, color="0.35", va="top", ha="left", style="italic")
    finish_strip(bar, n, start, end)
    fig.align_ylabels([ax, bar])
    fig.savefig(stem.with_suffix(".pdf"))
    fig.savefig(stem.with_suffix(".png"), dpi=600)
    plt.close(fig)


def plot_panels(counts, stem):
    raw, smooth = shares(counts)
    n = counts.sum(axis=1)
    start, end = raw.index.min(), raw.index.max()
    fig, axes = plt.subplots(len(POSTURES) + 1, 1, figsize=(WIDTH_IN, 5.9), sharex=True,
                             gridspec_kw={"height_ratios": [1] * len(POSTURES) + [0.55], "hspace": 0.5})
    fig.subplots_adjust(left=0.105, right=0.975, top=0.97, bottom=0.07)
    shade_thin(axes, n)
    for ax, p in zip(axes[:-1], POSTURES):
        ax.plot(raw.index, raw[p], color="0.62", lw=0.7, zorder=2)
        ax.plot(smooth.index, smooth[p], color="black", lw=1.9, zorder=3, solid_capstyle="round")
        ax.set_ylim(0, 100)
        ax.set_yticks([0, 50, 100])
        ax.set_title(p, loc="left", fontsize=8.5, fontweight="bold", pad=2.5)
        style_axes(ax)
        ax.tick_params(axis="x", which="both", length=0)
    axes[len(POSTURES) // 2].set_ylabel("Share of recorded formations (%)", y=1.0)
    finish_strip(axes[-1], n, start, end)
    fig.align_ylabels(axes)
    fig.savefig(stem.with_suffix(".pdf"))
    fig.savefig(stem.with_suffix(".png"), dpi=600)
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for region, (_, title) in REGIONS.items():
        counts = load(region)
        plot_lines(counts, OUT / f"{region}_posture_lines")
        plot_panels(counts, OUT / f"{region}_posture_panels")
        raw, smooth = shares(counts)
        tab = counts.assign(Records=counts.sum(axis=1)).join(raw.add_suffix("_pct").round(1)).join(
            smooth.add_suffix(f"_pct_{SMOOTH}day").round(1)).reset_index()
        tab.insert(0, "Region", title)
        rows.append(tab)
        n = counts.sum(axis=1)
        print(f"{region:10s} {counts.index.min():%d %b} to {counts.index.max():%d %b %Y}: {len(counts)} days, "
              f"{int(counts.values.sum())} records, {int(n.min())}-{int(n.max())} per day, {int((n < THIN).sum())} thin days")
    pd.concat(rows).to_csv(OUT / "posture_by_day.csv", index=False, date_format="%Y-%m-%d", encoding="utf-8")


if __name__ == "__main__":
    main()
