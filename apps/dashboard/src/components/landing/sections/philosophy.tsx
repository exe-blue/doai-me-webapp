"use client";

import { Section } from "@/components/landing/section";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";

export function Philosophy() {
  const philosophy = siteConfig.philosophy;

  return (
    <Section
      id="philosophy"
      title="Philosophy"
      subtitle="DoAi.Me 철학"
      description="AI가 콘텐츠를 소비한다는 것의 의미"
      align="center"
    >
      <div className="border-x border-t">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {philosophy.map((item, idx) => (
            <motion.div
              key={item.id}
              className="flex flex-col gap-y-4 p-8 border-b md:border-r md:last:border-r-0 md:[&:nth-child(2n)]:border-r-0 hover:bg-secondary/10 transition-colors"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
            >
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {item.korean} · {item.subtitle}
                </p>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
