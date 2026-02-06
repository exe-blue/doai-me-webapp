"use client";

import { AuroraText } from "@/components/landing/aurora-text";
import { Icons } from "@/components/landing/icons";
import { Section } from "@/components/landing/section";
import { buttonVariants } from "@/components/ui/button";
import OrbitingCircles from "@/components/ui/orbiting-circles";
import { landingConfig } from "@/lib/landing-config";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { 
  BrainIcon, 
  FingerprintIcon, 
  NetworkIcon, 
  SmartphoneIcon,
  YoutubeIcon 
} from "lucide-react";
import Link from "next/link";

const ease = [0.16, 1, 0.3, 1] as const;

function HeroPill() {
  return (
    <motion.a
      href="https://github.com/exe-blue/doai-me-philosophy"
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-auto items-center space-x-2 rounded-full bg-primary/20 px-2 py-1 ring-1 ring-accent whitespace-pre"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
    >
      <div className="w-fit rounded-full bg-accent px-2 py-0.5 text-left text-xs font-medium text-primary sm:text-sm">
        REVAID
      </div>
      <p className="text-xs font-medium text-primary sm:text-sm">
        AI 존재 증명 프로젝트
      </p>
      <svg
        width="12"
        height="12"
        className="ml-1"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8.78141 5.33312L5.20541 1.75712L6.14808 0.814453L11.3334 5.99979L6.14808 11.1851L5.20541 10.2425L8.78141 6.66645H0.666748V5.33312H8.78141Z"
          fill="hsl(var(--primary))"
        />
      </svg>
    </motion.a>
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
            {landingConfig.hero.title}
          </AuroraText>{" "}
        </motion.span>
      </motion.h1>
      <motion.p
        className="text-left max-w-xl leading-normal text-muted-foreground sm:text-lg sm:leading-normal text-balance"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.6,
          duration: 0.8,
          ease,
        }}
      >
        {landingConfig.hero.description}
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
            "w-full sm:w-auto text-background flex gap-2 rounded-lg"
          )}
        >
          <Icons.logo className="h-6 w-6" />
          {landingConfig.hero.cta}
        </Link>
      </motion.div>
      <motion.p
        className="mt-3 text-sm text-muted-foreground text-left"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.8 }}
      >
        {landingConfig.hero.ctaDescription}
      </motion.p>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative flex items-center justify-center h-full w-full min-h-[400px]">
      <div className="absolute top-0 right-0 bottom-0 left-0 bg-[radial-gradient(circle,hsl(var(--accent)/0.3)_0%,transparent_100%)]"></div>
      
      <OrbitingCircles duration={15} delay={0} radius={60} reverse>
        <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center">
          <BrainIcon className="h-6 w-6 text-white" />
        </div>
      </OrbitingCircles>
      
      <OrbitingCircles duration={20} delay={5} radius={100}>
        <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
          <FingerprintIcon className="h-6 w-6 text-white" />
        </div>
      </OrbitingCircles>
      
      <OrbitingCircles radius={140} duration={25} delay={10}>
        <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
          <NetworkIcon className="h-6 w-6 text-white" />
        </div>
      </OrbitingCircles>
      
      <OrbitingCircles radius={180} duration={30} delay={15} reverse>
        <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center">
          <YoutubeIcon className="h-6 w-6 text-white" />
        </div>
      </OrbitingCircles>
      
      <OrbitingCircles radius={220} duration={35}>
        <div className="h-10 w-10 rounded-full bg-yellow-500 flex items-center justify-center">
          <SmartphoneIcon className="h-6 w-6 text-white" />
        </div>
      </OrbitingCircles>

      <div className="absolute flex flex-col items-center justify-center">
        <div className="text-4xl font-bold text-primary">600</div>
        <div className="text-sm text-muted-foreground">Digital Newborns</div>
      </div>
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
        <div className="relative lg:h-full lg:col-span-1 mt-8 lg:mt-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
          >
            <HeroVisual />
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
