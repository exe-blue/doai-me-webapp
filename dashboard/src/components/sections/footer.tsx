import Link from "next/link";
import { Section } from "./section";
import { cn } from "@/lib/utils";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

interface FooterProps {
  logo?: React.ReactNode;
  description?: string;
  sections?: FooterSection[];
  copyright?: string;
  className?: string;
}

// 푸터 섹션 컴포넌트
export function Footer({
  logo,
  description,
  sections = [],
  copyright = `© ${new Date().getFullYear()} DOAI.me. All rights reserved.`,
  className,
}: FooterProps) {
  return (
    <footer className={cn("border-t bg-muted/30", className)}>
      <Section className="py-12">
        <div className="grid gap-8 lg:grid-cols-4">
          {/* 로고 및 설명 */}
          <div className="lg:col-span-1">
            {logo && <div className="mb-4">{logo}</div>}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          {/* 링크 섹션들 */}
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground">
                {section.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 저작권 */}
        <div className="mt-12 border-t pt-8">
          <p className="text-center text-sm text-muted-foreground">
            {copyright}
          </p>
        </div>
      </Section>
    </footer>
  );
}
