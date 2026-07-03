"use client";

import { Film, HardDrive, Layers, Recycle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useDedupStats } from "@/lib/queries";

export function DedupStatsCards() {
  const { data: stats, isLoading, error, refetch } = useDedupStats();

  // Surface fetch failures inline rather than rendering zeros — that would lie
  // about the library state when really the API is just unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { title: "Library Videos", value: stats?.library_video_count ?? 0, icon: Film },
    { title: "Library Size", value: stats?.library_size_human ?? "0 B", icon: HardDrive },
    { title: "Dedup Runs", value: stats?.run_count ?? 0, icon: Layers },
    {
      title: "Reclaimable (latest)",
      value: stats?.latest_reclaimable_human ?? "0 B",
      icon: Recycle,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="stat-value">{card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
