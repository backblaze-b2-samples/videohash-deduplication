import { NewRunDialog } from "@/components/runs/new-run-dialog";
import { RunsList } from "@/components/runs/runs-list";

export default function RunsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Dedup Runs</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Each run hashes the library, clusters near-duplicates, and writes a
            report to B2. Runs are immutable — re-tune the threshold with a new run.
          </p>
        </div>
        <NewRunDialog />
      </div>
      <div className="animate-fade-in-up stagger-2">
        <RunsList />
      </div>
    </div>
  );
}
