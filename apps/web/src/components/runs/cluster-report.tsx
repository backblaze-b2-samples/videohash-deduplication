"use client";

import { useRouter } from "next/navigation";
import { Crown, Layers, Recycle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@/lib/api-client";
import { useDeleteRun, usePreviewUrl, useRun } from "@/lib/queries";
import type { Cluster, ClusterMember } from "@videohash-deduplication/shared";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function basename(key: string) {
  return key.split("/").pop() || key;
}

function MemberVideo({
  member,
  isRep,
}: {
  member: ClusterMember;
  isRep: boolean;
}) {
  // Presign a short-lived inline URL per member so the <video> paints a frame.
  const { data } = usePreviewUrl(member.key, true);
  const url = data?.url;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {url ? (
        <video
          src={url}
          controls
          muted
          playsInline
          preload="metadata"
          className="aspect-video w-full bg-black object-contain"
          aria-label={`Preview of ${basename(member.key)}`}
        />
      ) : (
        <Skeleton className="aspect-video w-full" />
      )}
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium" title={member.key}>
            {basename(member.key)}
          </p>
          {isRep ? (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[var(--attention)]">
              <Crown className="h-3 w-3" aria-hidden="true" />
              Keep
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 tabular-nums">
              {member.distance_to_rep} bits
            </Badge>
          )}
        </div>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {(member.size_bytes / 1024).toFixed(1)} KB
        </p>
      </div>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: Cluster }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4 space-y-0">
        <CardTitle className="card-title">
          Cluster {cluster.cluster_id} · {cluster.members.length} videos
        </CardTitle>
        <Badge variant="secondary" className="gap-1">
          <Recycle className="h-3 w-3" aria-hidden="true" />
          {cluster.reclaimable_human} reclaimable
        </Badge>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cluster.members.map((m) => (
            <MemberVideo
              key={m.key}
              member={m}
              isRep={m.key === cluster.representative}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ClusterReport({ runId }: { runId: string }) {
  const { data: report, isLoading, error, refetch } = useRun(runId);
  const deleteMutation = useDeleteRun();
  const router = useRouter();

  const onDelete = () => {
    deleteMutation.mutate(runId, {
      onSuccess: () => {
        toast.success(`Run ${runId} deleted`);
        router.push("/runs");
      },
      onError: (err) => {
        const detail = err instanceof ApiError ? err.message : "Failed to delete run";
        toast.error(detail);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} title="Couldn't load this run" onRetry={() => refetch()} />;
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Videos scanned" value={report.video_count} />
          <StatTile label="Duplicate clusters" value={report.cluster_count} />
          <StatTile label="Duplicate videos" value={report.duplicate_video_count} />
          <StatTile label="Reclaimable" value={report.reclaimable_human} />
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 shrink-0 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete run
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this run report?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes <strong>{runId}</strong> from B2. The hash
                index and your videos are untouched. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="text-xs text-muted-foreground">
        Threshold ≤{report.threshold} bits · prefix <code>{report.prefix}</code> ·
        {" "}{report.hashed_this_run} newly hashed this run
      </p>

      {report.clusters.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No near-duplicates found"
          description="Every video under this prefix is distinct at the chosen threshold. Try a looser threshold to catch heavier edits."
        />
      ) : (
        <div className="space-y-6">
          {report.clusters.map((c) => (
            <ClusterCard key={c.cluster_id} cluster={c} />
          ))}
        </div>
      )}
    </div>
  );
}
