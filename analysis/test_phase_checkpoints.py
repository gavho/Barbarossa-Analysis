"""Self-checks for phase_checkpoints.py. Run: python analysis/test_phase_checkpoints.py (or pytest)."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import phase_checkpoints as ck  # noqa: E402
import phase_clusters as pc  # noqa: E402



def test_entropy_is_0_for_one_formation_and_1_for_four_equal():
    assert ck.entropy({"6A": 7}) == 0
    assert ck.entropy({f: 3 for f in ck.FORMATIONS}) == 1
    assert ck.entropy({"6A": 5, "other": 9}) == 0  # "other" is left out
    assert ck.entropy({"other": 2}) is None


def test_diversity_is_1_for_the_pool_mix_and_0_for_one_formation():
    keys = list("abcdefgh")
    form = dict(zip(keys, ["6A", "17A"] * 2 + ["6A"] * 2 + ["17A"] * 2))
    count = lambda ks: {f: n for f in ck.FORMATIONS if (n := sum(form[k] == f for k in ks))}
    rows = {r["cluster"]: r for r in ck.diversity(keys, ["N"] * 4 + ["Central"] * 2 + ["South"] * 2, count)}
    assert rows["N"]["normalized"] == 1 and rows["Central"]["normalized"] == 0
    assert rows["South Minor"]["divisions"] == 0 and rows["South Minor"]["normalized"] is None


def test_group4_names_clusters_north_to_south():
    df = pd.DataFrame({"along": [0, 2, 300, 302, 600, 602, 900, 902], "day": [1.0, 1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 4.0]})
    assert list(ck.group4(df)) == ["N", "N", "Central", "Central", "South", "South", "South Minor", "South Minor"]


LINE = [(100, 500), (100, -500)]  # north to south at x = 100


def test_crossing_is_interpolated_between_days():
    # Day 0 at x=60, day 4 at x=140: the line is crossed halfway, on day 2, 500 km from the line's north end.
    track = pd.DataFrame({"day": [0, 4, 5], "x": [60.0, 140.0, 150.0], "y": [0.0, 0.0, 0.0]})
    pt, day, along = ck.crossing(track, LINE, pc.east_polygon(LINE))
    assert round(pt.x) == 100 and day == 2 and round(along) == 500 - pc.FAR


def test_no_crossing_when_starting_past_or_never_reaching():
    poly = pc.east_polygon(LINE)
    assert ck.crossing(pd.DataFrame({"day": [0, 1], "x": [120.0, 150.0], "y": [0.0, 0.0]}), LINE, poly) is None
    assert ck.crossing(pd.DataFrame({"day": [0, 1], "x": [20.0, 50.0], "y": [0.0, 0.0]}), LINE, poly) is None


def test_start_only_for_divisions_there_on_day_one():
    there = pd.DataFrame({"day": [0, 3], "x": [40.0, 140.0], "y": [100.0, 100.0]})
    pt, day, along = ck.start_point(there, LINE)
    assert (pt.x, day, round(along)) == (40.0, 0.0, 400 - pc.FAR)  # 400 km from the line's north end
    assert ck.start_point(pd.DataFrame({"day": [5, 6], "x": [40.0, 50.0], "y": [0.0, 0.0]}), LINE) is None


def test_start_groups_by_place_alone():
    df = pd.DataFrame({"along": [0, 5, 10, 300, 305, 310], "day": [0.0] * 6})  # one shared day
    labels, sil = ck.group_line(df)
    assert len(set(labels[:3])) == 1 and labels[0] != labels[3] and sil > 0.9


def test_new_group_does_not_borrow_a_colour():
    # Earlier line: groups 0 and 1. Now three groups; group 2 holds only divisions not seen before.
    prev = {"a": 0, "b": 0, "c": 1, "d": 1}
    labels = pc.follow_groups(np.array([1, 1, 0, 0, 2, 2]), list("abcdef"), prev)
    assert list(labels) == [0, 0, 1, 1, 2, 2]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
