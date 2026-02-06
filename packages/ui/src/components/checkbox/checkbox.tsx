"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * RetroUI Checkbox variants
 * @see https://www.retroui.dev/docs/components/checkbox
 */
const checkboxVariants = cva(
  "border-2 border-border rounded disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        outline:
          "",
        solid:
          "data-[state=checked]:bg-foreground data-[state=checked]:text-background",
      },
      size: {
        sm: "h-4 w-4",
        md: "h-5 w-5",
        lg: "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {}

/**
 * Checkbox - RetroUI NeoBrutalist 스타일 체크박스
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, variant, size, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ variant, size }), className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="h-full w-full">
      <Check className="h-full w-full" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
