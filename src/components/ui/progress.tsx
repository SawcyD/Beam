import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

/**
 * Thin progress bar. `indicatorClassName` lets callers tint the fill (amber
 * while active, green when verified, red on failure).
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
  }
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full w-full flex-1 bg-accent transition-transform duration-200 ease-out",
        indicatorClassName,
      )}
      style={{
        transform: `translateX(-${100 - (value ?? 0)}%)`,
        boxShadow: "0 0 6px rgba(255,182,39,0.55)",
      }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

export { Progress };
