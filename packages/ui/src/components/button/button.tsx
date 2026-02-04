"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@packages/ui/lib/utils";

/**
 * RetroUI 스타일 버튼 variants
 * NeoBrutalist 디자인: 두꺼운 테두리, 그림자, 호버 시 이동 효과
 */
export const buttonVariants = cva(
  "font-medium transition-all duration-200 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-primary hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
        outline:
          "bg-background text-foreground border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
        ghost:
          "bg-transparent hover:bg-accent border-2 border-transparent",
        link:
          "bg-transparent text-primary underline-offset-4 hover:underline border-none",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        default: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10 p-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Button - RetroUI/NeoBrutalist 스타일 버튼
 * 두꺼운 테두리와 그림자, 호버 시 이동 효과
 */
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
  }
);
Button.displayName = "Button";

export { Button };
