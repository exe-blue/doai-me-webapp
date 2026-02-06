import * as React from "react";
import { cn } from "@packages/ui/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input - RetroUI NeoBrutalist 스타일 입력 필드
 * @see https://www.retroui.dev/docs/components/input
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, placeholder = "Enter text", ...props }, ref) => {
    return (
      <input
        type={type}
        placeholder={placeholder}
        className={cn(
          "px-4 py-2 w-full rounded border-2 border-border shadow-md transition focus:outline-hidden focus:shadow-xs",
          props["aria-invalid"]
            ? "border-destructive text-destructive shadow-xs shadow-destructive"
            : "",
          "placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
