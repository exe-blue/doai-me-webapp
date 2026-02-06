import * as React from "react";
import { cn } from "@packages/ui/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Textarea - RetroUI NeoBrutalist 스타일 텍스트영역
 * @see https://www.retroui.dev/docs/components/textarea
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full bg-background px-4 py-2 text-base rounded",
          "border-2 border-border shadow-md transition focus:outline-hidden focus:shadow-xs",
          "placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-none",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
