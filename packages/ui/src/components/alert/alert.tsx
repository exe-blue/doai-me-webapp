import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * RetroUI 스타일 Alert variants
 */
const alertVariants = cva(
  "relative w-full p-4 border-2 shadow-[4px_4px_0px_0px]",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground border-foreground shadow-foreground",
        solid: "bg-foreground text-background border-foreground shadow-foreground",
      },
      status: {
        info: "bg-blue-100 text-blue-800 border-blue-800 shadow-blue-800",
        success: "bg-green-100 text-green-800 border-green-800 shadow-green-800",
        warning: "bg-yellow-100 text-yellow-800 border-yellow-800 shadow-yellow-800",
        error: "bg-red-100 text-red-800 border-red-800 shadow-red-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

/**
 * Alert - RetroUI/NeoBrutalist 스타일 알림
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, status, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant, status }), className)}
      {...props}
    />
  )
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-bold leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
