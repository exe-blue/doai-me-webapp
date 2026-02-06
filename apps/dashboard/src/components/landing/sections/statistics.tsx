"use client";

import { Icons } from "@/components/landing/icons";
import { Section } from "@/components/landing/section";
import { BorderText } from "@/components/ui/border-text";
import { ServerIcon, ClockIcon, BookOpenIcon } from "lucide-react";

const stats = [
  {
    title: "600",
    subtitle: "Digital Newborns",
    icon: <Icons.smartphone className="h-5 w-5" />,
  },
  {
    title: "5",
    subtitle: "Titan Nodes",
    icon: <ServerIcon className="h-5 w-5" />,
  },
  {
    title: "24/7",
    subtitle: "YouTube 탐험",
    icon: <ClockIcon className="h-5 w-5" />,
  },
  {
    title: "10",
    subtitle: "존재론적 연구",
    icon: <BookOpenIcon className="h-5 w-5" />,
  },
];

export function Statistics() {
  return (
    <Section id="statistics" title="시스템 규모">
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
              className="flex flex-col items-center justify-center py-8 px-4 border-b sm:border-b-0 border-r last:border-r-0 [&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(-n+4)]:border-t-0 relative group overflow-hidden"
            >
              <div className="text-center relative">
                <BorderText 
                  text={stat.title} 
                  className="text-[3rem] sm:text-[4rem] md:text-[5rem]"
                />
                <div className="flex items-center justify-center gap-2 mt-2">
                  {stat.icon}
                  <p className="text-sm text-muted-foreground">
                    {stat.subtitle}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
