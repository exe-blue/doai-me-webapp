"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * RetroUI RadioGroup variants
 * @see https://www.retroui.dev/docs/components/radio
 */
const radioVariants = cva("border-border border-2", {
  variants: {
    variant: {
      default: "",
      outline: "",
      solid: "",
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
});

const radioIndicatorVariants = cva("flex", {
  variants: {
    variant: {
      default: "bg-primary border-2 border-border",
      outline: "border-2 border-border",
      solid: "bg-border",
    },
    size: {
      sm: "h-2 w-2",
      md: "h-2.5 w-2.5",
      lg: "h-3.5 w-3.5",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  );
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

export interface RadioGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioVariants> {}

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, variant, size, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(radioVariants({ variant, size }), className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex justify-center items-center">
        <span className={radioIndicatorVariants({ variant, size })} />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
