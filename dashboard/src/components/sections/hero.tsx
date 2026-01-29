"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "./section";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface HeroProps {
  title: string;
  description: string;
  ctaText?: string;
  ctaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
  className?: string;
}

// 히어로 섹션 컴포넌트 - 랜딩 페이지 상단 영역
export function Hero({
  title,
  description,
  ctaText = "시작하기",
  ctaHref = "/",
  secondaryCtaText,
  secondaryCtaHref,
  className,
}: HeroProps) {
  return (
    <Section id="hero" className={cn("pt-24 pb-16", className)}>
      <div className="flex flex-col items-center text-center">
        {/* 제목 */}
        <motion.h1
          className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
          initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
          animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
        >
          {title}
        </motion.h1>

        {/* 설명 */}
        <motion.p
          className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease }}
        >
          {description}
        </motion.p>

        {/* CTA 버튼 */}
        <motion.div
          className="mt-10 flex flex-col gap-4 sm:flex-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8, ease }}
        >
          <Button asChild size="lg" className="gap-2">
            <Link href={ctaHref}>
              {ctaText}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          {secondaryCtaText && secondaryCtaHref && (
            <Button asChild variant="outline" size="lg">
              <Link href={secondaryCtaHref}>{secondaryCtaText}</Link>
            </Button>
          )}
        </motion.div>
      </div>
    </Section>
  );
}
