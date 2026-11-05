"""Self-checks for phase_checkpoints.py. Run: python analysis/test_phase_checkpoints.py (or pytest)."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import phase_checkpoints as ck  # noqa: E402
import phase_clusters as pc  # noqa: E402

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
