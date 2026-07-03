import logging

from fastapi import APIRouter, HTTPException

from app.service.files import FileKeyError, FileNotFoundError
from app.service.runs import (
    delete_run,
    get_dedup_stats,
    get_hash_activity,
    get_run,
    list_runs,
    list_videos,
    run_dedup,
)
from app.types import (
    DailyCount,
    DedupReport,
    DedupRunRequest,
    DedupStats,
    LibraryVideo,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# Heavy, synchronous pipeline. Declared as a plain `def` so FastAPI runs it in
# a worker thread and the download + hashing loop never blocks the event loop.
@router.post("/runs", response_model=DedupReport)
def create_run(body: DedupRunRequest):
    try:
        return run_dedup(threshold=body.threshold, prefix=body.prefix)
    except FileKeyError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except RuntimeError as e:
        logger.error("Dedup run failed: %s", e)
        raise HTTPException(status_code=500, detail="Dedup run failed") from None


@router.get("/runs", response_model=list[DedupReport])
def list_runs_endpoint():
    return list_runs()


@router.get("/dedup/stats", response_model=DedupStats)
def dedup_stats_endpoint():
    return get_dedup_stats()


@router.get("/dedup/stats/activity", response_model=list[DailyCount])
def hash_activity_endpoint(days: int = 7):
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 90")
    return get_hash_activity(days=days)


@router.get("/videos", response_model=list[LibraryVideo])
def list_videos_endpoint(prefix: str | None = None):
    try:
        return list_videos(prefix=prefix)
    except FileKeyError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None


@router.get("/runs/{run_id}", response_model=DedupReport)
def get_run_endpoint(run_id: str):
    try:
        return get_run(run_id)
    except FileKeyError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.delete("/runs/{run_id}")
def delete_run_endpoint(run_id: str):
    try:
        delete_run(run_id)
    except FileKeyError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Failed to delete run") from None
    logger.info("Run deleted: run_id=%s", run_id)
    return {"deleted": True, "run_id": run_id}
