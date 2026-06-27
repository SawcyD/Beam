import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Win11 Fluent base: rounded-lg, slightly taller, smooth hover transitions
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Amber fill — primary action
        default:
          "bg-accent text-[#1a0e00] font-semibold shadow-xs hover:brightness-105 active:brightness-95",
        // Acrylic secondary
        secondary:
          "bg-panel-2 border border-border text-text hover:bg-panel hover:border-border-mid active:brightness-95",
        // Transparent ghost — command bar / icon buttons
        ghost:
          "text-muted hover:bg-white/[0.07] hover:text-text active:bg-white/[0.04]",
        // Status variants
        danger:
          "bg-err/12 text-err border border-err/25 hover:bg-err/20 active:bg-err/15",
        ok:
          "bg-ok/12 text-ok border border-ok/25 hover:bg-ok/20 active:bg-ok/15",
      },
      size: {
        default: "h-[34px] px-4 py-1.5",
        sm:      "h-7 px-2.5 text-[12px]",
        lg:      "h-10 px-5 text-[15px]",
        icon:    "h-[34px] w-[34px]",
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
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
