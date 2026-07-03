#!/usr/bin/env python3
"""Seed the B2 dedup library with demo videos (no committed binaries).

Generates, entirely with the ffmpeg bundled by ``imageio-ffmpeg``:

  * ``base.mp4``          — a synthetic test pattern (lavfi ``testsrc``)
  * ``base_reenc.mp4``    — the base re-encoded at a lower quality + mild scale
  * ``base_scaled.mp4``   — the base re-encoded at a different resolution
  * ``control.mp4``       — visually distinct content (lavfi ``mandelbrot``)

The three ``base*`` clips share content, so a dedup run clusters them together
(a real duplicate group). ``control.mp4`` stays a singleton. All four are
uploaded to ``library/`` in your B2 bucket over the S3-compatible API.

Run with the API virtualenv (it already has boto3 + imageio-ffmpeg):

    services/api/.venv/bin/python scripts/seed_library.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import boto3
import imageio_ffmpeg
from botocore.config import Config
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")

LIBRARY_PREFIX = os.environ.get("LIBRARY_PREFIX", "library/")
USER_AGENT_EXTRA = "b2ai-videohash-dedup"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def _run(args: list[str]) -> None:
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], check=True)


def _generate(tmp: Path) -> dict[str, Path]:
    base = tmp / "base.mp4"
    reenc = tmp / "base_reenc.mp4"
    scaled = tmp / "base_scaled.mp4"
    control = tmp / "control.mp4"

    # Base synthetic clip.
    _run([
        "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=15",
        "-pix_fmt", "yuv420p", str(base),
    ])
    # Near-duplicate: same content, lower quality + slight scale change.
    _run(["-i", str(base), "-vf", "scale=304:228", "-crf", "35", str(reenc)])
    # Near-duplicate: same content re-encoded at a different resolution.
    _run(["-i", str(base), "-vf", "scale=352:288", "-crf", "28", str(scaled)])
    # Distinct control: different visual content entirely.
    _run([
        "-f", "lavfi", "-i", "mandelbrot=size=320x240:rate=15",
        "-t", "4", "-pix_fmt", "yuv420p", str(control),
    ])
    return {
        "base.mp4": base,
        "base_reenc.mp4": reenc,
        "base_scaled.mp4": scaled,
        "control.mp4": control,
    }


def _s3_client():
    # Region comes from the environment (see .env.example) — no region baked in.
    region = os.environ["B2_REGION"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://s3.{region}.backblazeb2.com",
        region_name=region,
        aws_access_key_id=os.environ["B2_APPLICATION_KEY_ID"],
        aws_secret_access_key=os.environ["B2_APPLICATION_KEY"],
        config=Config(signature_version="s3v4", user_agent_extra=USER_AGENT_EXTRA),
    )


def main() -> int:
    bucket = os.environ.get("B2_BUCKET_NAME")
    required = ("B2_APPLICATION_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET_NAME", "B2_REGION")
    if any(not os.environ.get(k) for k in required):
        print(
            "Missing B2 config. Copy .env.example to .env and fill in your "
            "B2 credentials (incl. B2_REGION) before seeding.",
            file=sys.stderr,
        )
        return 1

    client = _s3_client()
    with tempfile.TemporaryDirectory() as td:
        clips = _generate(Path(td))
        for name, path in clips.items():
            key = f"{LIBRARY_PREFIX}{name}"
            client.upload_file(
                str(path), bucket, key,
                ExtraArgs={"ContentType": "video/mp4"},
            )
            print(f"uploaded {key} ({path.stat().st_size} bytes)")

    print(
        f"\nSeeded {len(clips)} videos into '{LIBRARY_PREFIX}'. "
        "Start a dedup run from the Runs page to cluster the near-duplicates."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
