"""Self-checks for the geometry in compare_loa.py. Run: python analysis/test_compare_loa.py (or pytest)."""
import math
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import LineString

sys.path.insert(0, str(Path(__file__).parent))
import compare_loa as c  # noqa: E402


def three_leg():
    """East 200 km, then 30 degrees south of east for 150 km, then east again for 150 km."""
    p1 = (200.0, 0.0)
    p2 = (p1[0] + 150 * math.cos(math.radians(-30)), 150 * math.sin(math.radians(-30)))
    return LineString([(0, 0), p1, p2, (p2[0] + 150, p2[1])])


def test_fit_recovers_known_vectors():
    V, rms = c.fit_segments(three_leg(), 3, 60)
    bearings = [c.bearing(V[i], V[i + 1]) for i in range(3)]
    assert rms < 2
    for got, want in zip(bearings, (90, 120, 90)):
        assert abs(c.wrap(got - want)) < 2, bearings
    assert math.dist(V[1], (200, 0)) < 8  # inflection point found where it was drawn


def test_fit_respects_min_segment_length():
    line = LineString([(0, 0), (300, 0), (305, 20), (600, 20)])  # a 20 km jog that is not worth a vector
    V, _ = c.fit_segments(line, 3, 60)
    assert min(math.dist(V[i], V[i + 1]) for i in range(3)) >= 55


def test_frechet_and_signed_offset():
    a = LineString([(0, 0), (300, 0)])
    assert c.frechet(a, a) < 1e-6
    north = LineString([(0, 15), (300, 15)])
    assert abs(c.frechet(a, north) - 15) < 0.5
    _, off_n = c.signed_offsets(a, north)
    _, off_s = c.signed_offsets(a, LineString([(0, -15), (300, -15)]))
    assert np.allclose(off_n, 15, atol=0.5) and np.allclose(off_s, -15, atol=0.5)  # north positive


def test_common_clip_and_containment():
    a = LineString([(0, 0), (400, 0)])
    b = LineString([(50, 10), (500, 10)])
    ca, cb = c.common_clip(a, b)
    assert abs(ca.coords[0][0] - 50) < 3 and abs(ca.coords[-1][0] - 400) < 3
    assert abs(cb.coords[0][0] - 50) < 3 and abs(cb.coords[-1][0] - 400) < 3
    assert c.containment(cb, ca, 25) == 1.0 and c.containment(cb, ca, 5) == 0.0
    assert c.common_clip(a, LineString([(390, 0), (900, 0)])) == (None, None)  # shares < MIN_COMMON_KM


def test_pairing_prefers_the_closer_line():
    planned = {"north": LineString([(0, 100), (400, 100)]), "south": LineString([(0, -100), (400, -100)])}
    clusters = {7: LineString([(0, -90), (400, -90)]), 8: LineString([(0, 110), (400, 110)])}
    pairing, _ = c.pair_lines(planned, clusters)
    assert pairing == {"north": 8, "south": 7}


def test_vector_stats_geodesic_bearings_and_turns():
    import export_vectors as ev
    az, km, turns = ev.vector_stats([(0, 0), (1, 0), (1, 1)])  # east along the equator, then north
    assert abs(az[0] - 90) < 0.1 and abs(az[1] - 0) < 0.1
    assert abs(km[0] - 111.3) < 0.5  # one degree of longitude at the equator
    assert abs(turns[0] + 90) < 0.1  # a left turn is negative


def test_fit_uses_fewest_vectors_within_tolerance():
    import export_vectors as ev
    V, rms = ev.fit(LineString([(0, 0), (300, 4), (600, 0)]))  # gentle 4 km bow: one vector is enough
    assert len(V) == 2 and rms <= ev.FIT_TOL_KM
    V, _ = ev.fit(three_leg())  # a real 30-degree dog-leg needs more than one
    assert len(V) >= 3


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
