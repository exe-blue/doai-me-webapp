import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge - NeoBrutalist 스타일 배지
 * 두꺼운 테두리, 상태별 컬러
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-2 border-foreground",
        secondary: "bg-secondary text-secondary-foreground border-2 border-foreground",
        destructive: "bg-destructive text-destructive-foreground border-2 border-foreground",
        outline: "bg-transparent text-foreground border-2 border-foreground",
        ghost: "bg-muted text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // 상태 배지 (새로 추가)
        success: "bg-green-400 text-green-900 border-2 border-green-900",
        warning: "bg-yellow-400 text-yellow-900 border-2 border-yellow-900",
        info: "bg-blue-400 text-blue-900 border-2 border-blue-900",
        error: "bg-red-400 text-red-900 border-2 border-red-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
