import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-glow hover:brightness-110",
        secondary: "border border-border bg-secondary text-foreground hover:border-muted-foreground/40",
        accent: "bg-gradient-gold text-accent-foreground font-bold",
        destructive: "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
        ghost: "text-foreground hover:bg-secondary",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[52px] px-5",
        sm: "h-11 px-4 text-[13.5px]",
        lg: "h-14 px-6 text-base",
        icon: "h-11 w-11 min-w-[44px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
