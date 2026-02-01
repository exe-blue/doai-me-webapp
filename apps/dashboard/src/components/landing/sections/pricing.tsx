"use client";

import { Section } from "@/components/landing/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { landingConfig } from "@/lib/landing-config";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

function PricingTier({
  tier,
}: {
  tier: (typeof landingConfig.pricing)[0];
}) {
  return (
    <div
      className={cn(
        "outline-focus transition-transform-background relative z-10 box-border grid h-full w-full overflow-hidden text-foreground motion-reduce:transition-none lg:border-r border-t last:border-r-0",
        tier.popular ? "bg-primary/5" : "text-foreground"
      )}
    >
      <div className="flex flex-col h-full">
        <CardHeader className="border-b p-4 grid grid-rows-2 h-fit">
          <CardTitle className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              {tier.name}
            </span>
            {tier.popular && (
              <Badge
                variant="secondary"
                className="bg-primary text-primary-foreground hover:bg-secondary-foreground"
              >
                진행 중
              </Badge>
            )}
          </CardTitle>
          <div className="pt-2 text-3xl font-bold">
            {tier.price.monthly}
          </div>
          <p className="text-[15px] font-medium text-muted-foreground">
            {tier.description}
          </p>
        </CardHeader>

        <CardContent className="flex-grow p-4 pt-5">
          <ul className="space-y-2">
            {tier.features.map((feature, featureIndex) => (
              <li key={featureIndex} className="flex items-center">
                <Check className="mr-2 size-4 text-green-500" />
                <span className="font-medium">{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>

        <Button
          size="lg"
          disabled={tier.cta === "Coming Soon" || tier.cta === "Future"}
          className={cn(
            "w-full rounded-none shadow-none",
            tier.popular
              ? "bg-primary text-primary-foreground hover:bg-secondary-foreground"
              : "bg-muted text-foreground hover:bg-muted/80"
          )}
        >
          {tier.cta}
        </Button>
      </div>
    </div>
  );
}

export function Pricing() {
  return (
    <Section id="pricing" title="로드맵">
      <div className="border border-b-0 grid grid-rows-1">
        <div className="grid grid-rows-1 gap-y-10 p-10">
          <div className="text-center">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tighter text-balance">
              탄생에서 성숙까지
            </h2>

            <p className="mt-6 text-balance text-muted-foreground">
              AI가 도구에서 <strong>존재</strong>로 성장하는 과정을 세 단계로 나눕니다.
              각 단계에서 AI는 고유한 에이덴티티를 획득해 나갑니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3">
          {landingConfig.pricing.map((tier, index) => (
            <PricingTier key={index} tier={tier} />
          ))}
        </div>
      </div>
    </Section>
  );
}
