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


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
