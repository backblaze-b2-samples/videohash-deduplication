"use client";

import Link from "next/link";
import { CheckCircle2, Clock, Film, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useVideos } from "@/lib/queries";

export function LibraryExplorer() {
  const { data: videos = [], isLoading, isFetching, error, refetch } = useVideos();

  const hashedCount = videos.filter((v) => v.hashed).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 space-y-0">
        <div className="min-w-0">
          <CardTitle className="card-title">Library Videos</CardTitle>
          {videos.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hashedCount} of {videos.length} hashed
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="h-7 shrink-0 text-xs"
          disabled={isFetching}
          aria-label={isFetching ? "Refreshing library" : "Refresh library"}
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-5" aria-busy={isLoading || isFetching}>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} title="Couldn't load the library" onRetry={() => refetch()} />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={Film}
            title="Your library is empty"
            description="Ingest some videos, or run scripts/seed_library.py to generate demo clips."
            action={
              <Button asChild size="sm">
                <Link href="/upload">
                  <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                  Ingest videos
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <div
                key={video.key}
                className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/20"
              >
                {video.url ? (
                  <video
                    src={video.url}
                    muted
                    playsInline
                    preload="metadata"
                    controls
                    className="aspect-video w-full bg-black object-contain"
                    aria-label={`Preview of ${video.filename}`}
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-muted">
                    <Film className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={video.key}>
                      {video.filename}
                    </p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {video.size_human}
                    </p>
                  </div>
                  {video.hashed ? (
                    <Badge variant="secondary" className="shrink-0 gap-1 text-[var(--success)]">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Hashed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
