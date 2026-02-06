"use client";

import * as React from "react";
import { cn } from "@packages/ui/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 페이지 제목 */
  title: string;
  /** 페이지 설명 (선택) */
  description?: string;
  /** 제목 앞에 표시할 아이콘 */
  icon?: React.ReactNode;
  /** 우측 액션 버튼 영역 */
  actions?: React.ReactNode;
}

/**
 * PageHeader - 페이지 상단 헤더 컴포넌트
 * 제목, 설명, 아이콘, 액션 버튼을 일관된 레이아웃으로 표시
 *
 * @example
 * <PageHeader
 *   title="디바이스 관리"
 *   description="500대 디바이스 상태를 관리합니다"
 *   icon={<Smartphone className="h-6 w-6" />}
 *   actions={<Button>새로고침</Button>}
 * />
 */
const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, description, icon, actions, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-between", className)}
        {...props}
      >
        <div>
          <h1 className="text-2xl font-head font-bold text-foreground flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    );
  }
);

PageHeader.displayName = "PageHeader";

export { PageHeader };
