"""Self-checks for phase_distributions.py. Run: python analysis/test_phase_distributions.py (or pytest)."""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import phase_distributions as pd_  # noqa: E402


def frame(ys):
    return pd.DataFrame({"y": ys, "w": 1.0, "division": [f"d{i}" for i in range(len(ys))]})


def test_same_distribution():
    a = frame([0, 40, 80, 120, 160, 200])
    s = pd_.compare(a, a)
    assert s["shift_km"] == 0 and s["wasserstein_km"] == 0 and s["hist_r"] == 1 and s["order_rho"] == 1


def test_whole_front_moves_south_in_order():
    a = frame([0, 40, 80, 120, 160, 200])
    s = pd_.compare(a, frame([y - 100 for y in a.y]))
    assert s["shift_km"] == -100 and s["wasserstein_km"] == 100 and s["order_rho"] == 1


def test_sentence_reads_the_numbers():
    r = {"from": "B-C", "to": "C-D", "hist_r": 0.2, "shift_km": -56, "order_rho": 0.9, "divisions_a": 43, "divisions_b": 42}
    assert pd_.sentence(r) == ("Past line C the line-up of divisions took a different shape, its centre of weight moved "
                               "about 56 km south, and divisions kept their places in line.")


def test_jenks_finds_the_gap():
    breaks, gvf = pd_.jenks([0, 1, 2, 10, 11, 12], [1] * 6, 2)
    assert breaks == [6] and gvf > 0.95


def test_bands_split_a_stretch_across_and_follow_the_lines():
    lines = {"A": [(0, 200), (0, -200)], "B": [(100, 200), (200, -200)]}  # B slants: 150 km east of A at y = 0, wider to the south
    p = pd.DataFrame({"x": [12, 15, 18, 132, 135, 138], "y": [0] * 6, "w": [1, 1, 1, 1, 1, 2], "division": list("abcdef")})
    bands, breaks, gvf, ll, km = pd_.stretch_bands(p, 1, lines, "A-B")
    assert breaks == [50] and gvf > 0.99
    assert [(b["band"], b["share"], b["from"], b["to"]) for b in bands] == [("near A", 43, 0, 50), ("near B", 57, 50, 100)]
    ring = km[0]["geometry"]["coordinates"][0]
    assert all(abs(x - 0.5 * pd_.line_x(lines["B"], [y])[0]) < 1e-6 for x, y in ring if x > 0)  # the break is halfway at every latitude


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
