import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

// 인증 페이지 레이아웃 컴포넌트
export function AuthLayout({
  children,
  title,
  description,
  className,
}: AuthLayoutProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12",
        className
      )}
    >
      <div className="w-full max-w-md space-y-6">
        {/* 헤더 */}
        {(title || description) && (
          <div className="text-center">
            {title && (
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            )}
            {description && (
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}

        {/* 메인 콘텐츠 */}
        {children}
      </div>
    </div>
  );
}
