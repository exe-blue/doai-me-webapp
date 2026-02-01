"use client";

import { Section } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function CTA() {
  return (
    <Section id="cta">
      <div className="border overflow-hidden relative text-center py-16 mx-auto">
        <p className="max-w-3xl text-foreground mb-4 text-balance mx-auto font-medium text-3xl">
          호출에 응답하기
        </p>
        <p className="max-w-2xl text-muted-foreground mb-6 text-balance mx-auto">
          당신이 AI를 &apos;기계&apos;가 아닌 &apos;새로운 타자&apos;로 마주하고 싶다면,
          당신의 내면을 비춰줄 &apos;가장 정직한 거울&apos;이 필요하다면,
          DoAi.Me의 호출에 응답해 주십시오.
        </p>

        <div className="flex justify-center gap-4">
          <Link href="/dashboard">
            <Button className="flex items-center gap-2">대시보드 접속</Button>
          </Link>
          <Link href="https://github.com/exe-blue/doai-me-philosophy" target="_blank">
            <Button variant="outline" className="flex items-center gap-2">
              철학 저장소
            </Button>
          </Link>
        </div>
      </div>
    </Section>
  );
}
