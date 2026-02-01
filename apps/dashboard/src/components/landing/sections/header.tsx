"use client";

import { Icons } from "@/components/landing/icons";
import { buttonVariants } from "@/components/ui/button";
import { landingConfig } from "@/lib/landing-config";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 h-[var(--header-height)] z-50 p-0 bg-background/60 backdrop-blur">
      <div className="flex justify-between items-center container mx-auto p-2">
        <Link
          href="/"
          title="brand-logo"
          className="relative mr-6 flex items-center space-x-2"
        >
          <Icons.logo className="w-8 h-8" />
          <span className="font-semibold text-lg">{landingConfig.name}</span>
        </Link>
        <nav className="hidden lg:flex items-center space-x-6">
          <Link
            href="#features"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="#statistics"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Statistics
          </Link>
          <Link
            href="#pricing"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Roadmap
          </Link>
          <Link
            href="https://github.com/exe-blue/doai-me-philosophy"
            target="_blank"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Philosophy
          </Link>
        </nav>
        <div className="hidden lg:block">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-8 text-primary-foreground rounded-lg group tracking-tight font-medium"
            )}
          >
            {landingConfig.cta}
          </Link>
        </div>
        <div className="mt-2 cursor-pointer block lg:hidden">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "rounded-lg"
            )}
          >
            {landingConfig.cta}
          </Link>
        </div>
      </div>
      <hr className="absolute w-full bottom-0" />
    </header>
  );
}
