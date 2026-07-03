export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

// --- Deduplication domain ---

export interface DedupRunRequest {
  threshold: number;
  prefix: string;
}

export interface ClusterMember {
  key: string;
  distance_to_rep: number;
  size_bytes: number;
}

export interface Cluster {
  cluster_id: number;
  representative: string;
  members: ClusterMember[];
  reclaimable_bytes: number;
  reclaimable_human: string;
}

export interface DedupReport {
  run_id: string;
  run_date: string;
  created_at: string;
  threshold: number;
  prefix: string;
  video_count: number;
  hashed_this_run: number;
  cluster_count: number;
  duplicate_video_count: number;
  reclaimable_bytes: number;
  reclaimable_human: string;
  clusters: Cluster[];
}

export interface LibraryVideo {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  hashed: boolean;
  hash_hex: string | null;
  url: string | null;
}

export interface DedupStats {
  library_video_count: number;
  library_size_bytes: number;
  library_size_human: string;
  run_count: number;
  latest_cluster_count: number;
  latest_reclaimable_bytes: number;
  latest_reclaimable_human: string;
}

export interface DailyCount {
  date: string;
  count: number;
}
