from datetime import datetime

from pydantic import BaseModel, Field


class HashIndexEntry(BaseModel):
    """One video's perceptual hash, persisted in the B2 hash index."""

    hash_hex: str
    hash_bits: str
    size_bytes: int
    hashed_at: str


class DedupRunRequest(BaseModel):
    """Body for POST /runs — configures a single dedup run."""

    threshold: int = Field(default=8, ge=1, le=64)
    prefix: str = "library/"


class ClusterMember(BaseModel):
    key: str
    distance_to_rep: int
    size_bytes: int


class Cluster(BaseModel):
    cluster_id: int
    representative: str
    members: list[ClusterMember]
    reclaimable_bytes: int
    reclaimable_human: str


class DedupReport(BaseModel):
    """A point-in-time cluster report over the library, stored in B2."""

    run_id: str
    run_date: str
    created_at: str
    threshold: int
    prefix: str
    video_count: int
    hashed_this_run: int
    cluster_count: int
    duplicate_video_count: int
    reclaimable_bytes: int
    reclaimable_human: str
    clusters: list[Cluster]


class LibraryVideo(BaseModel):
    """A source video joined with its hash-index status for the explorer."""

    key: str
    filename: str
    size_bytes: int
    size_human: str
    content_type: str
    uploaded_at: datetime
    hashed: bool
    hash_hex: str | None = None
    url: str | None = None


class DedupStats(BaseModel):
    """Dashboard summary metrics."""

    library_video_count: int
    library_size_bytes: int
    library_size_human: str
    run_count: int
    latest_cluster_count: int
    latest_reclaimable_bytes: int
    latest_reclaimable_human: str


class DailyCount(BaseModel):
    """One day's count for the activity chart (videos hashed per day)."""

    date: str
    count: int
