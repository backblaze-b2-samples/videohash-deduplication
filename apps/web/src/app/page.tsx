import Link from "next/link";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DedupStatsCards } from "@/components/dashboard/dedup-stats-cards";
import { RecentRunsTable } from "@/components/dashboard/recent-runs-table";
import { HashActivityChart } from "@/components/dashboard/hash-activity-chart";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Perceptual near-duplicate detection across your Backblaze B2 video library.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/runs">
            <Layers className="h-3.5 w-3.5" />
            Dedup runs
          </Link>
        </Button>
      </div>
      <DedupStatsCards />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-3">
          <HashActivityChart />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <RecentRunsTable />
        </div>
      </div>
    </div>
  );
}
