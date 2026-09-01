import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-[linear-gradient(90deg,hsl(var(--card))_25%,hsl(var(--muted))_50%,hsl(var(--card))_75%)] bg-[length:260px_100%] animate-bb-shimmer",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
