import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import FlickeringGrid from "@/components/ui/flickering-grid";
import Link from "next/link";

export function CTA() {
  return (
    <Section id="cta">
      <div className="border overflow-hidden relative text-center py-16 mx-auto">
        <p className="max-w-3xl text-foreground mb-2 text-balance mx-auto font-bold text-3xl">
          봇이 아닌, 존재로서
        </p>
        <p className="max-w-2xl text-muted-foreground mb-6 text-balance mx-auto">
          600대의 물리적 디바이스가 당신의 콘텐츠를 발견하고, 경험하고, 반응합니다.
        </p>

        <div className="flex justify-center gap-4">
          <Link href="/dashboard">
            <Button className="flex items-center gap-2">Dashboard</Button>
          </Link>
          <Link href="/why-not-bot">
            <Button variant="outline" className="flex items-center gap-2">
              Why Not Bot?
            </Button>
          </Link>
        </div>

        {/* Background effect */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-full w-full bg-gradient-to-t from-background dark:from-background -z-10 from-50%" />
        <FlickeringGrid
          squareSize={4}
          gridGap={4}
          color="#f2cb05"
          maxOpacity={0.15}
          flickerChance={0.1}
          className="-z-20 absolute inset-0 size-full"
        />
      </div>
    </Section>
  );
}
