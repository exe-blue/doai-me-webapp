"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      style={{ fontFamily: "inherit", overflowWrap: "anywhere" }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "bg-background text-foreground border-border border-2 font-head shadow-[4px_4px_0px_0px] shadow-foreground rounded-md text-[13px] flex items-center gap-2.5 p-4 w-[356px] [&:has(button)]:justify-between",
          description: "font-sans",
          actionButton:
            "border-2 text-[12px] h-6 px-2 bg-primary text-primary-foreground border-border rounded-md shrink-0",
          cancelButton:
            "border-2 text-[12px] h-6 px-2 bg-muted text-foreground border-border rounded-md shrink-0",
          error: "bg-destructive text-destructive-foreground",
          loading:
            "[&[data-sonner-toast] [data-icon]]:flex [&[data-sonner-toast] [data-icon]]:size-4 [&[data-sonner-toast] [data-icon]]:relative [&[data-sonner-toast] [data-icon]]:justify-start [&[data-sonner-toast] [data-icon]]:items-center [&[data-sonner-toast] [data-icon]]:flex-shrink-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
