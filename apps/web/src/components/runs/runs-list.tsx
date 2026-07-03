"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api-client";
import { useDeleteRun, useRuns } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import type { DedupReport } from "@videohash-deduplication/shared";

export function RunsList() {
  const { data: runs = [], isLoading, error, refetch } = useRuns();
  const deleteMutation = useDeleteRun();
  const [deleteTarget, setDeleteTarget] = useState<DedupReport | null>(null);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    deleteMutation.mutate(target.run_id, {
      onSuccess: () => toast.success(`Run ${target.run_id} deleted`),
      onError: (err) => {
        const detail = err instanceof ApiError ? err.message : "Failed to delete run";
        toast.error(detail);
      },
      onSettled: () => setDeleteTarget(null),
    });
  };

  return (
    <>
      <Card>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} title="Couldn't load runs" onRetry={() => refetch()} />
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No dedup runs yet"
              description="Start your first run to detect near-duplicate videos in the library."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Run
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Threshold
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Videos
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Clusters
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Reclaimable
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    When
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.run_id} className="table-row-hover">
                    <TableCell className="font-medium">
                      <Link
                        href={`/runs/${encodeURIComponent(run.run_id)}`}
                        className="text-primary hover:underline"
                      >
                        {run.run_id}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      ≤{run.threshold} bits
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {run.video_count}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {run.cluster_count}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                      {run.reclaimable_human}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(run.created_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Actions for run ${run.run_id}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/runs/${encodeURIComponent(run.run_id)}`}>
                              View report
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(run)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete run report?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              This permanently deletes the report{" "}
              <strong className="break-all font-semibold text-foreground">
                {deleteTarget?.run_id}
              </strong>{" "}
              from B2. The hash index and your videos are untouched. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
