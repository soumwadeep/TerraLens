import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-lg bg-gradient-to-r from-muted via-muted/60 to-muted bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
