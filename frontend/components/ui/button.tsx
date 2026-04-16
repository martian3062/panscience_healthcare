import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  {
    variants: {
      variant: {
        default:
          "border-[#2091d0] bg-[#2091d0] text-white shadow-[0_10px_24px_rgba(32,145,208,0.18)] hover:bg-[#157eb8] hover:border-[#157eb8]",
        secondary:
          "border-[#dbe7f1] bg-[#edf5fb] text-[#1d6e9e] hover:bg-[#dfeef8]",
        outline:
          "border-[#d8dde3] bg-white text-foreground hover:bg-[#f4f7fa]",
        ghost: "border-transparent bg-transparent text-muted hover:border-[#d8dde3] hover:bg-[#f6f8fb] hover:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  )
);

Button.displayName = "Button";

export { Button, buttonVariants };
