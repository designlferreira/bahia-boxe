import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Único padrão de loading — sempre no mesmo formato do conteúdo final. */
export function SkeletonCard({ height = 88, className }: { height?: number; className?: string }) {
  return <Skeleton style={{ height }} className={cn("w-full", className)} />;
}

export function SkeletonList({ count = 3, height = 88 }: { count?: number; height?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} height={height} />
      ))}
    </div>
  );
}
