import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/12 text-primary ring-1 ring-inset ring-primary/25",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success/12 text-success ring-1 ring-inset ring-success/25",
        warning: "border-transparent bg-warning/15 text-warning-foreground ring-1 ring-inset ring-warning/30 dark:text-warning",
        destructive: "border-transparent bg-destructive/12 text-destructive ring-1 ring-inset ring-destructive/25",
        info: "border-transparent bg-info/12 text-info ring-1 ring-inset ring-info/25",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };