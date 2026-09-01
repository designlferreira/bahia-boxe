import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input type={type} className={cn("input-dark h-[50px]", className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";

export { Input };
