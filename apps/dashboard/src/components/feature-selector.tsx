"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface TechItem {
  name: string;
  description: string;
}

interface TechCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: TechItem[];
}

interface FeatureSelectorProps {
  categories: TechCategory[];
}

export const FeatureSelector: React.FC<FeatureSelectorProps> = ({
  categories,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 relative border rounded-lg overflow-hidden">
      <div className="md:col-span-2 border-b md:border-b-0 bg-background md:border-r border-border">
        <div className="flex md:flex-col feature-btn-container overflow-x-auto p-4">
          {categories.map((category, index) => (
            <button
              key={category.id}
              onClick={() => setSelectedIndex(index)}
              className={cn(
                "flex-shrink-0 w-56 md:w-full text-left p-4 mb-2 mr-2 last:mr-0 md:mr-0 rounded-lg border border-border transition-colors",
                selectedIndex === index
                  ? "bg-primary/10 border-primary/50"
                  : "hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="text-primary">{category.icon}</div>
                <h3 className="font-semibold tracking-tight">{category.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {category.items.length}개 기술
              </p>
            </button>
          ))}
        </div>
      </div>
      <div className="col-span-1 md:col-span-3 p-6 bg-muted/20">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          {categories[selectedIndex].icon}
          {categories[selectedIndex].title}
        </h3>
        <ul className="space-y-4">
          {categories[selectedIndex].items.map((item, idx) => (
            <li
              key={idx}
              className="p-4 rounded-lg border bg-card hover:bg-accent/20 transition-colors"
            >
              <span className="font-medium text-foreground">{item.name}</span>
              <p className="text-sm text-muted-foreground mt-1">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
