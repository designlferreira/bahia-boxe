import { cn } from "@/lib/utils";

function Avatar({
  initials,
  size = "md",
  className,
}: {
  initials: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "w-[38px] h-[38px] text-[13px]",
    md: "w-[54px] h-[54px] text-2xl font-display",
    lg: "w-[42px] h-[42px] text-sm font-semibold",
  } as const;
  return (
    // Decorativo: as iniciais repetem o nome que vem ao lado (leitor de tela lia "MO" antes do nome).
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-hero text-primary-foreground shrink-0",
        sizes[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}

export { Avatar };
