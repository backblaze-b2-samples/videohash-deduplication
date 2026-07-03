import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ClusterReport } from "@/components/runs/cluster-report";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const decoded = decodeURIComponent(runId);

  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          All runs
        </Link>
        <h1 className="page-title mt-2 break-all">{decoded}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Near-duplicate cluster report. The largest video in each cluster is the
          one to keep; the rest are reclaimable.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <ClusterReport runId={decoded} />
      </div>
    </div>
  );
}
