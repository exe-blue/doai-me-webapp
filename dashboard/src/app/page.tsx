"use client";

import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Statistics } from "@/components/sections/statistics";
import { Philosophy } from "@/components/sections/philosophy";
import { CTA } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";

export default function LandingPage() {
  return (
    <main id="main-content" className="min-h-screen">
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <Hero />

      {/* Statistics Section */}
      <Statistics />

      {/* Features Section */}
      <Features />

      {/* Philosophy Section */}
      <Philosophy />

      {/* CTA Section */}
      <CTA />

      {/* Footer */}
      <Footer />
    </main>
  );
}
