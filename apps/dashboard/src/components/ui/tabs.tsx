"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

/**
 * Tabs - NeoBrutalist 스타일 탭
 * 두꺼운 테두리, 활성 탭 강조
 */
const Tabs = TabsPrimitive.Root;

// 탭 리스트 컴포넌트
const TabsList: React.FC<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
> = ({ className, ...props }) => (
  <TabsPrimitive.List
    className={cn(
      "inline-flex h-12 items-center gap-1 p-1",
      "bg-muted border-2 border-foreground",
      className
    )}
    {...props}
  />
);
TabsList.displayName = TabsPrimitive.List.displayName;

// 탭 트리거 컴포넌트
const TabsTrigger: React.FC<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
> = ({ className, ...props }) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex items-center justify-center px-4 py-2 text-sm font-bold whitespace-nowrap transition-all",
      "border-2 border-transparent",
      "hover:bg-accent",
      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
      "data-[state=active]:border-foreground data-[state=active]:shadow-[2px_2px_0px_0px] data-[state=active]:shadow-foreground",
      "disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
);
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

// 탭 콘텐츠 컴포넌트
const TabsContent: React.FC<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
> = ({ className, ...props }) => (
  <TabsPrimitive.Content
    className={cn(
      "mt-3 p-4 border-2 border-foreground",
      "focus-visible:outline-none",
      className
    )}
    {...props}
  />
);
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
