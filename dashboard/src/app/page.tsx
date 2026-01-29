'use client';

import { useState, useEffect } from 'react';
import { JobPostingForm } from '@/components/JobPostingForm';
import { StatusBoard } from '@/components/StatusBoard';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isWorkerConnected, setIsWorkerConnected] = useState<boolean | null>(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean | null>(null);

  const handleJobCreated = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Worker 연결 상태 확인 (devices 테이블에서 최근 활성 기기 확인)
  useEffect(() => {
    const checkWorkerStatus = async () => {
      try {
        // 최근 30초 이내에 last_seen_at이 업데이트된 기기가 있는지 확인
        const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
        const { data, error } = await supabase
          .from('devices')
          .select('id, serial_number')
          .gte('last_seen_at', thirtySecondsAgo)
          .limit(1);

        if (error) {
          console.error('Worker 상태 확인 실패:', error);
          setIsWorkerConnected(false);
        } else {
          setIsWorkerConnected(data && data.length > 0);
        }
      } catch (err) {
        console.error('Worker 상태 확인 예외:', err);
        setIsWorkerConnected(false);
      }
    };

    checkWorkerStatus();
    // 10초마다 상태 확인
    const interval = setInterval(checkWorkerStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Realtime 연결 상태 확인
  useEffect(() => {
    const channel = supabase
      .channel('realtime-status-check')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        // Realtime 이벤트 수신 시 활성 상태로 표시
        setIsRealtimeActive(true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeActive(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsRealtimeActive(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* 헤더 */}
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-3">
            🎮 AI Device Farm
          </h1>
          <p className="text-muted-foreground text-lg">
            작업 통제실 - 스마트폰 팜 관리 대시보드
          </p>
          <div className="mt-4 flex justify-center gap-4 text-sm">
            {isWorkerConnected === null ? (
              <span className="px-3 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 rounded-full">
                ⏳ Worker 상태 확인 중...
              </span>
            ) : isWorkerConnected ? (
              <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                ✅ Worker 연결됨
              </span>
            ) : (
              <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full">
                ⚠️ Worker 미연결
              </span>
            )}
            {isRealtimeActive === null ? (
              <span className="px-3 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 rounded-full">
                ⏳ Realtime 상태 확인 중...
              </span>
            ) : isRealtimeActive ? (
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                📡 Realtime 활성화
              </span>
            ) : (
              <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">
                ❌ Realtime 비활성
              </span>
            )}
          </div>
        </header>

        {/* 메인 컨텐츠 - 반응형 그리드 */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* 좌측: 작업 등록 폼 (4/12) */}
          <div className="xl:col-span-4">
            <div className="sticky top-8">
              <JobPostingForm onJobCreated={handleJobCreated} />
            </div>
          </div>

          {/* 우측: 상태 보드 (8/12) */}
          <div className="xl:col-span-8">
            <StatusBoard refreshTrigger={refreshTrigger} />
          </div>
        </div>

        {/* 푸터 */}
        <footer className="mt-16 text-center text-sm text-muted-foreground border-t pt-8">
          <p>DoAi.me Device Farm Management System</p>
          <p className="mt-1 text-xs">
            Built with Next.js + Supabase + AutoX.js
          </p>
        </footer>
      </div>
    </main>
  );
}
