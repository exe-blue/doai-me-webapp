"use client";

import { Section } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { landingConfig } from "@/lib/landing-config";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useState } from "react";
import { QuoteIcon } from "lucide-react";

export function Testimonials() {
  const [showAll, setShowAll] = useState(false);
  const initialDisplayCount = 6;

  return (
    <Section id="testimonials" title="철학적 인용">
      <div className="border-t">
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-0 lg:bg-grid-3 border-r pb-24 sm:bg-grid-2 relative bg-grid-1">
          <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-2/6 w-[calc(100%-2px)] overflow-hidden bg-gradient-to-t from-background to-transparent"></div>

          <Button
            variant="outline"
            className="absolute bottom-12 left-1/2 -translate-x-1/2 border h-10 w-fit px-5 flex items-center justify-center z-10"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "접기" : "더 보기"}
          </Button>

          {landingConfig.testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className={cn(
                "flex flex-col border-b break-inside-avoid border-l",
                "transition-colors hover:bg-secondary/20",
                !showAll && index >= initialDisplayCount && "hidden"
              )}
            >
              <div className="px-4 py-5 sm:p-6 flex-grow">
                <div className="flex items-start gap-3 mb-4">
                  <QuoteIcon className="h-8 w-8 text-primary/50 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-medium text-foreground">
                      {testimonial.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.company}
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground italic">&ldquo;{testimonial.text}&rdquo;</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
