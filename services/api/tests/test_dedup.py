"""Unit tests for the perceptual-hash clustering logic (no network, no ffmpeg)."""

from app.service.dedup import cluster_by_distance, hamming_distance


def test_hamming_distance_counts_differing_bits():
    assert hamming_distance("0x00", "0x00") == 0
    assert hamming_distance("0x0f", "0x00") == 4
    assert hamming_distance("0xff", "0x00") == 8
    # Order-independent
    assert hamming_distance("0x01", "0x03") == hamming_distance("0x03", "0x01")


def test_clusters_group_near_duplicates():
    # base and a near-dup differ by 2 bits; the control differs by many.
    items = [
        ("library/base.mp4", "0x00ff"),
        ("library/base_reenc.mp4", "0x03ff"),  # 2 bits from base
        ("library/control.mp4", "0xff00"),  # far from base
    ]
    groups = cluster_by_distance(items, threshold=8)
    # Find the group that contains base.mp4
    base_group = next(g for g in groups if "library/base.mp4" in g)
    assert set(base_group) == {"library/base.mp4", "library/base_reenc.mp4"}
    # control is its own singleton
    control_group = next(g for g in groups if "library/control.mp4" in g)
    assert control_group == ["library/control.mp4"]


def test_strict_threshold_splits_variants():
    items = [
        ("a", "0x00ff"),
        ("b", "0x03ff"),  # 2 bits away
    ]
    # A 1-bit threshold is too strict to link them.
    groups = cluster_by_distance(items, threshold=1)
    assert sorted(len(g) for g in groups) == [1, 1]


def test_transitive_clustering_via_union_find():
    # a~b (2 bits) and b~c (2 bits) but a~c (4 bits) — all one component at t>=4.
    items = [
        ("a", "0x0000"),
        ("b", "0x0003"),
        ("c", "0x000f"),
    ]
    groups = cluster_by_distance(items, threshold=4)
    assert len(groups) == 1
    assert set(groups[0]) == {"a", "b", "c"}
