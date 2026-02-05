import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input - NeoBrutalist 스타일 입력 필드
 * 두꺼운 테두리, 그림자, 포커스 시 그림자 변화
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full bg-background text-foreground px-3 py-2 text-sm",
        "border-2 border-foreground shadow-[4px_4px_0px_0px] shadow-foreground",
        "placeholder:text-muted-foreground",
        "focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-[2px_2px_0px_0px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "transition-all duration-200",
        className
      )}
      {...props}
    />
  )
}

export { Input }
