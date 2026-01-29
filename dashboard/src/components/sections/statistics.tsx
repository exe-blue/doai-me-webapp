"use client";

import { Section } from "@/components/section";
import { BorderText } from "@/components/ui/border-number";
import { siteConfig } from "@/lib/config";

export function Statistics() {
  const stats = siteConfig.stats;

  return (
    <Section id="statistics" title="Statistics">
      <div
        className="border-x border-t"
        style={{
          backgroundImage:
            "radial-gradient(circle at bottom center, hsl(var(--secondary) / 0.4), hsl(var(--background)))",
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center justify-center py-8 px-4 border-b sm:border-b-0 last:border-b-0 sm:border-r sm:last:border-r-0 relative group overflow-hidden"
            >
              <div className="text-center relative">
                <BorderText
                  text={stat.value}
                  className="text-[3rem] sm:text-[4rem]"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
