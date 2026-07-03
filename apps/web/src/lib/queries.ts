"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createRun,
  deleteFile,
  deleteRun,
  getDedupStats,
  getFiles,
  getHashActivity,
  getPreviewUrl,
  getRun,
  getRuns,
  getVideos,
} from "@/lib/api-client";
import type {
  DedupReport,
  DedupRunRequest,
  FileMetadata,
  LibraryVideo,
} from "@videohash-deduplication/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating one slice doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.runs` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  dedupStats: () => [...qk.all, "dedup", "stats"] as const,
  hashActivity: (days: number) =>
    [...qk.all, "dedup", "activity", days] as const,
  videos: (prefix?: string) => [...qk.all, "videos", prefix ?? ""] as const,
  runs: () => [...qk.all, "runs"] as const,
  run: (runId: string) => [...qk.all, "runs", runId] as const,
};

export function useFiles(prefix = "", limit = 100) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived because the URL
// itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- Deduplication hooks ---

export function useDedupStats() {
  return useQuery({
    queryKey: qk.dedupStats(),
    queryFn: getDedupStats,
  });
}

export function useHashActivity(days = 7) {
  return useQuery({
    queryKey: qk.hashActivity(days),
    queryFn: () => getHashActivity(days),
  });
}

export function useVideos(prefix?: string) {
  return useQuery<LibraryVideo[], ApiError>({
    queryKey: qk.videos(prefix),
    queryFn: () => getVideos(prefix),
  });
}

export function useRuns() {
  return useQuery<DedupReport[], ApiError>({
    queryKey: qk.runs(),
    queryFn: getRuns,
  });
}

export function useRun(runId: string) {
  return useQuery<DedupReport, ApiError>({
    queryKey: qk.run(runId),
    queryFn: () => getRun(runId),
    enabled: !!runId,
  });
}

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation<DedupReport, ApiError, DedupRunRequest>({
    mutationFn: (body: DedupRunRequest) => createRun(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean; run_id: string }, ApiError, string>({
    mutationFn: (runId: string) => deleteRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}
