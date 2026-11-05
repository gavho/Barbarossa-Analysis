"""Self-checks for phase_clusters.py. Run: python analysis/test_phase_clusters.py (or pytest)."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import phase_clusters as pc  # noqa: E402


def test_cut_pieces_at_two_lines():
    # A path heading east across two north-south lines at x=100 and x=200.
    polys = [pc.east_polygon([(x, 500), (x, -500)]) for x in (100, 200)]
    pts = np.array([[x, 0.0] for x in range(0, 301, 10)])
    z = pc.zones(pts, polys)
    assert list(z[[0, 11, 21]]) == [0, 1, 2]
    pieces = pc.cut_pieces(pts, z)
    assert sorted(pieces) == [0, 1, 2]
    assert pieces[0][-1][0] == 110 and pieces[1][0][0] == 110  # consecutive pieces share the crossing point
    assert pieces[2][-1][0] == 300


def test_path_that_starts_past_a_line_has_no_earlier_piece():
    polys = [pc.east_polygon([(x, 500), (x, -500)]) for x in (100, 200)]
    pts = np.array([[x, 0.0] for x in range(150, 260, 10)])
    pieces = pc.cut_pieces(pts, pc.zones(pts, polys))
    assert 0 not in pieces and 1 in pieces and 2 in pieces


def test_clusters_are_numbered_north_to_south():
    paths = [np.array([[0, y], [50, y]]) for y in (300, 310, 100, 110, -100, -90, -300, -310)]
    for fn in pc.METHODS.values():
        labels, _ = fn(paths, 4)
        labels = pc.north_to_south(labels, paths)
        assert list(labels) == [0, 0, 1, 1, 2, 2, 3, 3]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
