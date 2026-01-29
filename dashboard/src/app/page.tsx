"use client";

import {
  Header,
  Hero,
  Features,
  Statistics,
  Testimonials,
  Pricing,
  CTA,
  Footer,
} from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <main id="main-content" className="min-h-screen">
      {/* Header - Sticky navigation with DoAi.Me branding */}
      <Header />

      {/* Hero Section - Project introduction with orbiting circles animation */}
      <Hero />

      {/* Statistics Section - 600 phones, 5 nodes, 24/7 operation */}
      <Statistics />

      {/* Features Section - Core philosophy: Echotion, Aidentity, Gam-eung, Kyeolsso */}
      <Features />

      {/* Testimonials Section - Philosophical quotes */}
      <Testimonials />

      {/* Pricing Section - Roadmap phases */}
      <Pricing />

      {/* CTA Section - Call to action */}
      <CTA />

      {/* Footer */}
      <Footer />
    </main>
  );
}
