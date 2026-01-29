"use client";

import { AuroraText } from "@/components/aurora-text";
import { LogoIcon } from "@/components/icons";
import { Section } from "@/components/section";
import { buttonVariants } from "@/components/ui/button";
import OrbitingCircles from "@/components/ui/orbiting-circles";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Server, Smartphone, Cpu } from "lucide-react";
import Link from "next/link";

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

function HeroPill() {
  return (
    <motion.div
      className="flex w-auto items-center space-x-2 rounded-full bg-primary/20 px-2 py-1 ring-1 ring-accent whitespace-pre"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
    >
      <div className="w-fit rounded-full bg-primary px-2 py-0.5 text-left text-xs font-medium text-primary-foreground sm:text-sm">
        600+ Devices
      </div>
      <p className="text-xs font-medium text-foreground sm:text-sm">
        물리적 디바이스로 운영
      </p>
    </motion.div>
  );
}

function HeroTitles() {
  return (
    <div className="flex w-full max-w-3xl flex-col overflow-hidden pt-8">
      <motion.h1
        className="text-left text-4xl font-semibold leading-tighter text-foreground sm:text-5xl md:text-6xl tracking-tighter"
        initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
        transition={{
          duration: 1,
          ease,
          staggerChildren: 0.2,
        }}
      >
        <motion.span
          className="inline-block text-balance"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.5,
            ease,
          }}
        >
          <AuroraText className="leading-normal font-bold">
            {siteConfig.hero.title}
          </AuroraText>
        </motion.span>
      </motion.h1>
      <motion.p
        className="text-left mt-2 text-xl font-medium text-foreground/80"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.5,
          duration: 0.8,
          ease,
        }}
      >
        {siteConfig.hero.subtitle}
      </motion.p>
      <motion.p
        className="text-left max-w-xl mt-4 leading-normal text-muted-foreground sm:text-lg sm:leading-normal text-balance"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.6,
          duration: 0.8,
          ease,
        }}
      >
        {siteConfig.hero.description}
      </motion.p>
    </div>
  );
}

function HeroCTA() {
  return (
    <div className="relative mt-6">
      <motion.div
        className="flex w-full max-w-2xl flex-col items-start justify-start space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8, ease }}
      >
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "default" }),
            "w-full sm:w-auto text-primary-foreground flex gap-2 rounded-lg"
          )}
        >
          <LogoIcon className="h-5 w-5" />
          {siteConfig.hero.cta}
        </Link>
        <Link
          href="/why-not-bot"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full sm:w-auto flex gap-2 rounded-lg"
          )}
        >
          {siteConfig.hero.ctaSecondary}
        </Link>
      </motion.div>
      <motion.p
        className="mt-3 text-sm text-muted-foreground text-left"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.8 }}
      >
        {siteConfig.hero.ctaDescription}
      </motion.p>
    </div>
  );
}

export function Hero() {
  return (
    <Section id="hero">
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-x-8 w-full p-6 lg:p-12 border-x overflow-hidden">
        <div className="flex flex-col justify-start items-start lg:col-span-1">
          <HeroPill />
          <HeroTitles />
          <HeroCTA />
        </div>
        <div className="hidden lg:flex items-center justify-center lg:col-span-1">
          <motion.div
            className="relative flex h-[320px] w-[320px] items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.8, ease }}
          >
            {/* Central Server */}
            <div className="z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-background shadow-lg">
              <Server className="h-8 w-8 text-primary" />
            </div>

            {/* Inner Orbit - Titan Nodes (5) */}
            <OrbitingCircles radius={70} duration={25} delay={0}>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </OrbitingCircles>
            <OrbitingCircles radius={70} duration={25} delay={5}>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </OrbitingCircles>
            <OrbitingCircles radius={70} duration={25} delay={10}>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </OrbitingCircles>
            <OrbitingCircles radius={70} duration={25} delay={15}>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </OrbitingCircles>
            <OrbitingCircles radius={70} duration={25} delay={20}>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </OrbitingCircles>

            {/* Outer Orbit - Devices (representing 600) */}
            <OrbitingCircles radius={130} duration={40} delay={0} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={130} duration={40} delay={5} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={130} duration={40} delay={10} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={130} duration={40} delay={15} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={130} duration={40} delay={20} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={130} duration={40} delay={25} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={130} duration={40} delay={30} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={130} duration={40} delay={35} reverse>
              <Smartphone className="h-4 w-4 text-primary" />
            </OrbitingCircles>

            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-3xl -z-10" />
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
