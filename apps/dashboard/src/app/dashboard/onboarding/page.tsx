'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  RefreshCw,
  Smartphone,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Loader2,
  Settings,
  Wifi,
  Shield,
  Package,
  User,
  Monitor,
  Zap,
  RotateCcw,
  ChevronRight,
  Clock,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';

// 온보딩 단계 정의
const ONBOARDING_STEPS = [
  { id: 'hardware', name: '하드웨어 검증', icon: Monitor, description: 'ADB 연결, 모델 확인' },
  { id: 'standardize', name: '표준화', icon: Settings, description: '해상도, DPI 설정' },
  { id: 'naming', name: '명명', icon: Hash, description: 'PC{XX}-{YY} 이름 지정' },
  { id: 'accessibility', name: '접근성', icon: Zap, description: 'AutoX.js 권한' },
  { id: 'security', name: '보안 해제', icon: Shield, description: '잠금화면 비활성화' },
  { id: 'apps', name: '앱 설치', icon: Package, description: 'AutoX.js, YouTube' },
  { id: 'network', name: '네트워크', icon: Wifi, description: 'WiFi 설정' },
  { id: 'account', name: '계정 설정', icon: User, description: 'YouTube 로그인' },
  { id: 'ready', name: '준비 완료', icon: CheckCircle, description: '최종 검증' },
];

type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

interface OnboardingDevice {
  device_id: string;
  node_id: string;
  status: OnboardingStatus;
  current_step: string | null;
  completed_steps: string[];
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  realtime?: {
    currentStep: string;
    progress: number;
  } | null;
}

// 상태 배지 컴포넌트
function StatusBadge({ status }: { status: OnboardingStatus }) {
  const config: Record<OnboardingStatus, { color: string; icon: React.ReactNode; label: string }> = {
    not_started: { color: 'bg-zinc-500/20 text-muted-foreground border-zinc-500/30', icon: <Clock className="h-3 w-3" />, label: '대기' },
    in_progress: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <Activity className="h-3 w-3" />, label: '진행중' },
    completed: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CheckCircle className="h-3 w-3" />, label: '완료' },
    failed: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <XCircle className="h-3 w-3" />, label: '실패' },
  };

  const { color, icon, label } = config[status] || config.not_started;

  return (
    <Badge variant="outline" className={`font-sans text-xs ${color} flex items-center gap-1`}>
      {icon}
      {label}
    </Badge>
  );
}

// 단계 진행률 표시
function StepProgress({ completedSteps, currentStep }: { completedSteps: string[]; currentStep: string | null }) {
  return (
    <div className="flex items-center gap-0.5">
      {ONBOARDING_STEPS.map((step, idx) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = currentStep === step.id;
        const StepIcon = step.icon;
        
        return (
          <div
            key={step.id}
            className={`w-6 h-6 rounded flex items-center justify-center ${
              isCompleted
                ? 'bg-green-500/20 text-green-400'
                : isCurrent
                ? 'bg-yellow-500/20 text-yellow-400 animate-pulse'
                : 'bg-muted text-muted-foreground'
            }`}
            title={step.name}
          >
            <StepIcon className="h-3 w-3" />
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const [devices, setDevices] = useState<OnboardingDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [starting, setStarting] = useState(false);
  const [nodeId, setNodeId] = useState('PC00');

  // 온보딩 상태 조회
  const fetchOnboarding = useCallback(async (showToast = false) => {
    try {
      const response = await fetch('/api/onboarding');
      if (!response.ok) throw new Error('Failed to fetch onboarding status');
      const result = await response.json();
      const items = result.data?.items ?? result.items ?? [];
      setDevices(items);
      if (showToast) {
        toast.success('온보딩 상태 갱신됨');
      }
    } catch (error) {
      console.error('Failed to fetch onboarding:', error);
      if (showToast) {
        toast.error('온보딩 상태 조회 실패');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 초기 로딩
  useEffect(() => {
    fetchOnboarding();
    // Auto-refresh 5초마다
    const interval = setInterval(() => fetchOnboarding(), 5000);
    return () => clearInterval(interval);
  }, [fetchOnboarding]);

  // 수동 새로고침
  const handleRefresh = () => {
    setRefreshing(true);
    fetchOnboarding(true);
  };

  // 디바이스 선택 토글
  const toggleDevice = (deviceId: string) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId);
    } else {
      newSelected.add(deviceId);
    }
    setSelectedDevices(newSelected);
  };

  // 전체 선택/해제
  const toggleAll = () => {
    if (selectedDevices.size === devices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(devices.map(d => d.device_id)));
    }
  };

  // 온보딩 시작
  const handleStartOnboarding = async () => {
    if (selectedDevices.size === 0) {
      toast.error('디바이스를 선택해주세요');
      return;
    }

    setStarting(true);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIds: Array.from(selectedDevices),
          nodeId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || '온보딩 시작 실패');
      }

      toast.success(`${selectedDevices.size}개 디바이스 온보딩 시작`);
      setShowStartDialog(false);
      setSelectedDevices(new Set());
      fetchOnboarding();
    } catch (error) {
      const message = error instanceof Error ? error.message : '온보딩 시작 실패';
      toast.error(message);
    } finally {
      setStarting(false);
    }
  };

  // 단일 디바이스 온보딩 취소
  const handleCancelOnboarding = async (deviceId: string) => {
    try {
      const response = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, action: 'cancel' }),
      });

      if (!response.ok) throw new Error('취소 실패');
      toast.success('온보딩 취소됨');
      fetchOnboarding();
    } catch (error) {
      toast.error('온보딩 취소 실패');
    }
  };

  // 단계 재시도
  const handleRetryStep = async (deviceId: string, step: string) => {
    try {
      const response = await fetch(`/api/onboarding/${deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, force: true }),
      });

      if (!response.ok) throw new Error('재시도 실패');
      toast.success(`${step} 단계 재시도 중`);
      fetchOnboarding();
    } catch (error) {
      toast.error('단계 재시도 실패');
    }
  };

  // 통계 계산
  const stats = {
    total: devices.length,
    notStarted: devices.filter(d => d.status === 'not_started').length,
    inProgress: devices.filter(d => d.status === 'in_progress').length,
    completed: devices.filter(d => d.status === 'completed').length,
    failed: devices.filter(d => d.status === 'failed').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-head font-bold text-foreground">디바이스 온보딩</h1>
          <p className="text-muted-foreground font-sans text-xs mt-1">
            새 디바이스 초기화 및 설정 자동화
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="font-sans text-xs border-border hover:border-border"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            REFRESH
          </Button>
          <Button
            size="sm"
            onClick={() => setShowStartDialog(true)}
            className="font-sans text-xs bg-cyan-600 hover:bg-cyan-500"
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            온보딩 시작
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-xs text-muted-foreground">전체</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-foreground">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              대기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-muted-foreground">{stats.notStarted}</div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" />
              진행중
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-yellow-400">{stats.inProgress}</div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              완료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-green-400">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-xs text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              실패
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-sans font-bold text-red-400">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Onboarding Steps Overview */}
      <Card className="bg-background border-border">
        <CardHeader>
          <CardTitle className="font-head text-sm text-foreground">온보딩 단계</CardTitle>
          <CardDescription className="font-sans text-xs">
            각 디바이스는 9단계를 순차적으로 진행합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            {ONBOARDING_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              return (
                <div key={step.id} className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                      <StepIcon className="h-4 w-4 text-cyan-400" />
                    </div>
                    {idx < ONBOARDING_STEPS.length - 1 && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="font-sans text-xs text-foreground">{step.name}</div>
                    <div className="font-sans text-[10px] text-muted-foreground">{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Devices Table */}
      <Card className="bg-background border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-head text-sm text-foreground">
              디바이스 목록 ({devices.length})
            </CardTitle>
            {selectedDevices.size > 0 && (
              <Badge variant="outline" className="font-sans text-xs border-cyan-700 text-cyan-400">
                {selectedDevices.size}개 선택됨
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground font-sans text-sm">온보딩 기록이 없습니다</p>
              <p className="text-muted-foreground font-sans text-xs mt-2">
                새 디바이스를 연결하고 온보딩을 시작하세요
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedDevices.size === devices.length && devices.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Device ID</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Node</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Status</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Progress</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Current Step</TableHead>
                  <TableHead className="font-sans text-xs text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => {
                  const progress = Math.round(
                    (device.completed_steps.length / ONBOARDING_STEPS.length) * 100
                  );
                  
                  return (
                    <TableRow key={device.device_id} className="border-border">
                      <TableCell>
                        <Checkbox
                          checked={selectedDevices.has(device.device_id)}
                          onCheckedChange={() => toggleDevice(device.device_id)}
                        />
                      </TableCell>
                      <TableCell className="font-sans text-xs text-foreground">
                        {device.device_id}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-sans text-xs border-border">
                          {device.node_id}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={device.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="h-1.5 w-20 bg-muted" />
                          <span className="font-sans text-xs text-muted-foreground">{progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StepProgress 
                          completedSteps={device.completed_steps} 
                          currentStep={device.current_step} 
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {device.status === 'in_progress' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelOnboarding(device.device_id)}
                              className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {device.status === 'failed' && device.current_step && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetryStep(device.device_id, device.current_step!)}
                              className="h-7 px-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Start Onboarding Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-head text-foreground">온보딩 시작</DialogTitle>
            <DialogDescription className="font-sans text-xs text-muted-foreground">
              선택한 디바이스들의 온보딩을 시작합니다.
              연결된 디바이스가 자동으로 감지됩니다.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="font-sans text-xs text-muted-foreground block mb-2">Node ID</label>
              <input
                type="text"
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full bg-muted border border-border rounded px-3 py-2 font-sans text-sm text-foreground"
                placeholder="PC00"
              />
              <p className="font-sans text-[10px] text-muted-foreground mt-1">
                디바이스 명명에 사용됩니다 (예: {nodeId}-00, {nodeId}-01)
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-sans text-xs text-muted-foreground mb-2">온보딩 단계:</h4>
              <ol className="space-y-1">
                {ONBOARDING_STEPS.map((step, idx) => (
                  <li key={step.id} className="font-sans text-xs text-muted-foreground flex items-center gap-2">
                    <span className="text-cyan-400">{idx + 1}.</span>
                    {step.name}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStartDialog(false)}
              className="font-sans text-xs border-border"
            >
              취소
            </Button>
            <Button
              onClick={handleStartOnboarding}
              disabled={starting}
              className="font-sans text-xs bg-cyan-600 hover:bg-cyan-500"
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              온보딩 시작
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
