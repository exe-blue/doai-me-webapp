import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Textarea - NeoBrutalist 스타일 텍스트영역
 * 두꺼운 테두리, 그림자
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[100px] w-full bg-background text-foreground px-3 py-2 text-sm",
        "border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground",
        "placeholder:text-muted-foreground",
        "focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-[2px_2px_0px_0px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-none transition-all duration-200",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
