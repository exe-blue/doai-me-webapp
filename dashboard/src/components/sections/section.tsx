import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionProps {
  id?: string;
  className?: string;
  children: ReactNode;
}

// 섹션 래퍼 컴포넌트 - 일관된 패딩과 최대 너비 적용
export function Section({ id, className, children }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8",
        className
      )}
    >
      {children}
    </section>
  );
}
