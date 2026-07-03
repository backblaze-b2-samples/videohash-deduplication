"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { GeneratingLoader } from "@/components/ui/generating-loader";
import { Progress } from "@/components/ui/progress";
import { ApiError } from "@/lib/api-client";
import { useCreateRunStream } from "@/lib/queries";
import type { DedupProgressEvent } from "@videohash-deduplication/shared";

// `threshold` is a finite set → a Select (never free text). `prefix` is a path
// → free-text Input. Both carry safe-default hints via FormDescription rather
// than an autofill button.
const runSchema = z.object({
  threshold: z.enum(["4", "8", "12"]),
  prefix: z.string().min(1, "Prefix is required"),
});

type RunValues = z.infer<typeof runSchema>;

const defaultValues: RunValues = {
  threshold: "8",
  prefix: "library/",
};

// Determinate in-progress state: a live "N of M" count + advancing bar driven
// by the backend's per-video SSE events (see useCreateRunStream), so the user
// can see real progress instead of an indeterminate spinner.
function RunProgress({ progress }: { progress: DedupProgressEvent | null }) {
  const stage = progress?.stage;
  const toHash = progress?.to_hash ?? 0;
  const hashed = progress?.hashed ?? 0;
  const current = progress?.current ?? null;

  const isHashing = stage === "hashing" && toHash > 0;
  const done = stage === "clustering" || stage === "complete";
  const percent = isHashing
    ? Math.round((hashed / toHash) * 100)
    : done
      ? 100
      : 0;
  const label = isHashing
    ? `Hashing ${hashed} of ${toHash} videos…`
    : done
      ? "Clustering near-duplicates…"
      : "Starting run…";

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <GeneratingLoader size="lg" label={label} />
      <div className="w-full max-w-xs space-y-2">
        <Progress value={percent} aria-label={label} />
        <p className="text-center text-xs text-muted-foreground">
          {isHashing && current ? (
            <>
              Downloading and hashing{" "}
              <span className="font-medium text-foreground">{current}</span> from
              B2.
            </>
          ) : (
            "Downloading each video from B2 and computing its perceptual hash."
          )}
        </p>
      </div>
    </div>
  );
}

export function NewRunDialog() {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<DedupProgressEvent | null>(null);
  const router = useRouter();
  const createRun = useCreateRunStream(setProgress);

  const form = useForm<RunValues>({
    resolver: zodResolver(runSchema),
    defaultValues,
  });

  const onSubmit = (values: RunValues) => {
    setProgress(null);
    createRun.mutate(
      { threshold: Number(values.threshold), prefix: values.prefix },
      {
        onSuccess: (report) => {
          toast.success(
            `Run complete — ${report.cluster_count} duplicate ${
              report.cluster_count === 1 ? "cluster" : "clusters"
            } found`,
          );
          setOpen(false);
          form.reset(defaultValues);
          router.push(`/runs/${encodeURIComponent(report.run_id)}`);
        },
        onError: (err) => {
          const detail = err instanceof ApiError ? err.message : "Dedup run failed";
          toast.error(detail);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the user dismiss the dialog mid-run.
        if (createRun.isPending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Play className="h-3.5 w-3.5" />
          New dedup run
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New dedup run</DialogTitle>
          <DialogDescription>
            Hashes every video under the prefix, then clusters near-duplicates by
            perceptual-hash distance.
          </DialogDescription>
        </DialogHeader>

        {createRun.isPending ? (
          <RunProgress progress={progress} />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Match threshold</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="4">Strict (≤4 bits)</SelectItem>
                        <SelectItem value="8">Balanced (≤8 bits)</SelectItem>
                        <SelectItem value="12">Loose (≤12 bits)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Balanced catches re-encodes without flagging genuinely
                      different videos.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="prefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Library prefix</FormLabel>
                    <FormControl>
                      <Input placeholder="library/" {...field} />
                    </FormControl>
                    <FormDescription>
                      The B2 folder your videos live in. Defaults to{" "}
                      <code>library/</code>.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">Run deduplication</Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
