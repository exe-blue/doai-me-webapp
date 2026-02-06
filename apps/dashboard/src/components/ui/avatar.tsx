"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

// 아바타 루트 컴포넌트
const Avatar: React.FC<
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
> = ({ className, ...props }) => (
  <AvatarPrimitive.Root
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
);
Avatar.displayName = AvatarPrimitive.Root.displayName;

// 아바타 이미지 컴포넌트
const AvatarImage: React.FC<
  React.ComponentPropsWithRef<typeof AvatarPrimitive.Image>
> = ({ className, ...props }) => (
  <AvatarPrimitive.Image
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
);
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

// 아바타 폴백 컴포넌트 (이미지 로드 실패 시)
const AvatarFallback: React.FC<
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
> = ({ className, ...props }) => (
  <AvatarPrimitive.Fallback
    className={cn(
      "bg-muted flex h-full w-full items-center justify-center rounded-full",
      className
    )}
    {...props}
  />
);
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
