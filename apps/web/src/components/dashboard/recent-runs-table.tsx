"use client";

import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useRuns } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function RecentRunsTable() {
  const { data: runs = [], isLoading, error, refetch } = useRuns();

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent Runs</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/runs"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No runs yet"
            description="Start a dedup run to detect near-duplicate videos."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[34%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Run
                </TableHead>
                <TableHead className="w-[16%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Videos
                </TableHead>
                <TableHead className="w-[16%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Clusters
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Reclaimable
                </TableHead>
                <TableHead className="w-[16%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  When
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.slice(0, 8).map((run) => (
                <TableRow key={run.run_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/runs/${encodeURIComponent(run.run_id)}`}
                      className="truncate text-primary hover:underline"
                    >
                      {run.run_id}
                    </Link>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
