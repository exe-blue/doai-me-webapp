'use client';

import { useState } from 'react';
import { JobPostingForm } from '@/components/JobPostingForm';
import { StatusBoard } from '@/components/StatusBoard';

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleJobCreated = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* 헤더 */}
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">🎮 AI Device Farm</h1>
          <p className="text-muted-foreground">
            작업 통제실 - 스마트폰 팜 관리 대시보드
          </p>
        </header>

        {/* 메인 컨텐츠 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌측: 작업 등록 폼 */}
          <div className="lg:col-span-1">
            <JobPostingForm onJobCreated={handleJobCreated} />
          </div>

          {/* 우측: 상태 보드 */}
          <div className="lg:col-span-2">
            <StatusBoard refreshTrigger={refreshTrigger} />
          </div>
        </div>

        {/* 푸터 */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>DoAi.me Device Farm Management System</p>
        </footer>
      </div>
    </main>
  );
}
