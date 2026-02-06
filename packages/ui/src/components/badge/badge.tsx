import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * RetroUI Badge variants
 * @see https://www.retroui.dev/docs/components/badge
 */
const badgeVariants = cva(
  "font-semibold rounded inline-flex items-center border-2 border-border shadow-md",
  {
    variants: {
      variant: {
        default:
          "bg-muted text-muted-foreground",
        primary:
          "bg-primary text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground",
        outline:
          "outline-2 outline-foreground text-foreground",
        solid:
          "bg-foreground text-background",
        surface:
          "outline-2 bg-primary text-primary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground",
        success:
          "bg-green-500 text-white",
        warning:
          "bg-yellow-500 text-black",
        info:
          "bg-blue-500 text-white",
      },
      size: {
        sm: "px-2 py-1 text-xs",
        md: "px-2.5 py-1.5 text-sm",
        lg: "px-3 py-2 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge - RetroUI NeoBrutalist 스타일 배지
 */
function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
