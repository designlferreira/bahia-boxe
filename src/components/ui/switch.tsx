import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      // Visual track stays 31x52 (design spec); before: pads the tap target out to 44px tall
      // without resizing the switch itself.
      "peer relative inline-flex h-[31px] w-[52px] shrink-0 items-center rounded-full border-none transition-colors before:absolute before:-inset-y-[6.5px] before:inset-x-0 before:content-[''] data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-[25px] w-[25px] translate-x-[3px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[24px]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
