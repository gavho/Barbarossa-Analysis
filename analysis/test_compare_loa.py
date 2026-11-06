"""Self-checks for the plan-vs-actual additions in compare_loa.py. Run: python analysis/test_compare_loa.py (or pytest)."""
import sys
from pathlib import Path

from shapely.geometry import LineString

sys.path.insert(0, str(Path(__file__).parent))
import compare_loa as c  # noqa: E402


def row(**kw):
    base = {"planned": "17A", "mean_signed_offset_km": -5.0, "mean_abs_offset_km": 10.0, "realized_within_50km_pct": 100,
            "end_gap_km": 12, "straight_bearing_diff": 3, "membership_agrees": True}
    return {**base, **kw}


def test_stayed_behind_cut():
    assert c.displacement(LineString([(0, 0), (30, 40)])) == 50 < c.STAYED_BEHIND_KM
    assert c.displacement(LineString([(0, 0), (200, 300), (400, 0)])) == 400 >= c.STAYED_BEHIND_KM  # start to end, not path length


def test_verdict_badges():
    assert c.verdict(row())[0] == "on plan"
    assert c.verdict(row(mean_abs_offset_km=35.0, mean_signed_offset_km=-33.0))[0] == "near plan"
    badge, text = c.verdict(row(mean_abs_offset_km=80.0, mean_signed_offset_km=-75.0, straight_bearing_diff=20, membership_agrees=False))
    assert badge == "off plan" and "75 km south" in text and "20° further south" in text and "another group" in text


def test_scores():
    assert c.scores(row()) == {"score_direction": 100, "score_route": 100, "score_destination": 100, "score_overall": 100}
    s = c.scores(row(straight_bearing_diff=-27.5, mean_abs_offset_km=60.0, end_gap_km=200))
    assert (s["score_direction"], s["score_route"], s["score_destination"], s["score_overall"]) == (50, 50, 0, 33)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
