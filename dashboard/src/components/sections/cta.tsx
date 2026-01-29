"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "./section";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface CTAProps {
  title: string;
  description: string;
  ctaText?: string;
  ctaHref?: string;
  className?: string;
}

// CTA (Call to Action) 섹션 컴포넌트
export function CTA({
  title,
  description,
  ctaText = "지금 시작하기",
  ctaHref = "/",
  className,
}: CTAProps) {
  return (
    <Section id="cta" className={className}>
      <motion.div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-primary px-6 py-16 sm:px-12 sm:py-24",
          "text-center text-primary-foreground"
        )}
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        {/* 배경 그라데이션 효과 */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />

        <div className="relative z-10">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg opacity-90">
            {description}
          </p>
          <div className="mt-8">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="gap-2 font-semibold"
            >
              <Link href={ctaHref}>
                {ctaText}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </Section>
  );
}
