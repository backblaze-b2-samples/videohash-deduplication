from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Backblaze B2 (S3-compatible API) ---
    # Standard B2_* env names (see .env.example). The S3 endpoint is DERIVED
    # from the region so callers never hardcode a regional hostname. The region
    # itself is supplied via the B2_REGION env var (required at startup — see
    # main.py); no region string is baked into source.
    b2_region: str = ""
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    # Optional public/CDN base for building browser URLs to public objects.
    b2_public_url_base: str = ""

    api_port: int = 8000
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Ingest limits — videos are larger than the starter's generic uploads.
    max_file_size: int = 500 * 1024 * 1024  # 500MB

    # --- Deduplication config (safe defaults; not required) ---
    # The B2 "folder" your source videos live in.
    library_prefix: str = "library/"
    # Persistent perceptual-hash index (incremental across runs).
    index_key: str = "dedup/index/hash_index.json"
    # Where per-run cluster reports are written.
    reports_prefix: str = "dedup/reports/"
    # Default pairwise Hamming-distance threshold for near-duplicate clustering.
    dedup_default_threshold: int = 8

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def b2_endpoint(self) -> str:
        """Derive the S3 endpoint from the region — no hardcoded hostnames."""
        return f"https://s3.{self.b2_region}.backblazeb2.com"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",")]


settings = Settings()
