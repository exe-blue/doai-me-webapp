'use client';

import { useState, useEffect, useCallback } from 'react';
import { Terminal, Send, RefreshCw, Loader2, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@packages/ui';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { createClient } from '@/lib/supabase/client';
import type {
  Command,
  CommandEvent,
  CommandStatus,
  CommandType,
  CommandEventType,
} from '@doai/shared/database';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMAND_TYPES: { value: CommandType; label: string }[] = [
  { value: 'ping', label: 'Ping' },
  { value: 'shell', label: 'Shell' },
  { value: 'reboot', label: 'Reboot' },
  { value: 'install', label: 'Install APK' },
  { value: 'screenshot', label: 'Screenshot' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusBadge(status: CommandStatus) {
  const map: Record<CommandStatus, { variant: string; label: string }> = {
    PENDING: { variant: 'ghost', label: 'PENDING' },
    CLAIMED: { variant: 'info', label: 'CLAIMED' },
    RUNNING: { variant: 'warning', label: 'RUNNING' },
    SUCCEEDED: { variant: 'success', label: 'SUCCEEDED' },
    FAILED: { variant: 'error', label: 'FAILED' },
    TIMEOUT: { variant: 'error', label: 'TIMEOUT' },
  };
  const { variant, label } = map[status] || map.PENDING;
  return <Badge variant={variant as 'ghost' | 'info' | 'warning' | 'success' | 'error'}>{label}</Badge>;
}

function getEventColor(type: CommandEventType): string {
  const map: Record<string, string> = {
    CREATED: 'text-muted-foreground',
    CLAIMED: 'text-blue-600',
    STARTED: 'text-yellow-600',
    STDOUT: 'text-foreground',
    STDERR: 'text-red-500',
    SUCCEEDED: 'text-green-600',
    FAILED: 'text-red-600',
    TIMEOUT: 'text-red-600',
  };
  return map[type] || 'text-foreground';
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('ko-KR');
}

function formatDateTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Device type (subset used in this page)
// ---------------------------------------------------------------------------

type DeviceRow = {
  id: string;
  status: string;
  model: string | null;
  serial_number: string | null;
  pc_id: string | null;
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CommandsPage() {
  // ---- State ----
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [events, setEvents] = useState<CommandEvent[]>([]);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formDevice, setFormDevice] = useState('');
  const [formType, setFormType] = useState<CommandType>('ping');
  const [formPayload, setFormPayload] = useState('{}');
  const [submitting, setSubmitting] = useState(false);

  // ---- Initial data fetch ----
  useEffect(() => {
    async function fetchInitial() {
      const supabase = createClient();

      const [devicesRes, commandsRes] = await Promise.all([
        supabase
          .from('devices')
          .select('id, status, model, serial_number, pc_id'),
        supabase
          .from('commands')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (devicesRes.data) setDevices(devicesRes.data as DeviceRow[]);
      if (commandsRes.data) setCommands(commandsRes.data as Command[]);
      setLoading(false);
    }

    fetchInitial();
  }, []);

  // ---- Realtime: devices ----
  useSupabaseRealtime<Record<string, unknown>>('devices', {
    enabled: realtimeEnabled,
    onData: useCallback((payload) => {
      if (payload.eventType === 'INSERT') {
        setDevices((prev) => [...prev, payload.new as unknown as DeviceRow]);
      } else if (payload.eventType === 'UPDATE') {
        setDevices((prev) =>
          prev.map((d) =>
            d.id === (payload.new as unknown as DeviceRow).id
              ? (payload.new as unknown as DeviceRow)
              : d,
          ),
        );
      } else if (payload.eventType === 'DELETE') {
        setDevices((prev) =>
          prev.filter((d) => d.id !== (payload.old as unknown as DeviceRow).id),
        );
      }
    }, []),
  });

  // ---- Realtime: commands ----
  useSupabaseRealtime<Record<string, unknown>>('commands', {
    enabled: realtimeEnabled,
    onData: useCallback((payload) => {
      if (payload.eventType === 'INSERT') {
        setCommands((prev) => [payload.new as unknown as Command, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setCommands((prev) =>
          prev.map((c) =>
            c.id === (payload.new as unknown as Command).id
              ? (payload.new as unknown as Command)
              : c,
          ),
        );
      }
    }, []),
  });

  // ---- Realtime: command_events ----
  useSupabaseRealtime<Record<string, unknown>>('command_events', {
    enabled: realtimeEnabled && !!selectedCommandId,
    filter: selectedCommandId ? `command_id=eq.${selectedCommandId}` : undefined,
    onData: useCallback((payload) => {
      if (payload.eventType === 'INSERT') {
        setEvents((prev) => [...prev, payload.new as unknown as CommandEvent]);
      }
    }, []),
  });

  // ---- Select a command and fetch its events ----
  async function handleSelectCommand(id: string) {
    setSelectedCommandId(id);
    const supabase = createClient();
    const { data } = await supabase
      .from('command_events')
      .select('*')
      .eq('command_id', id)
      .order('created_at');
    if (data) setEvents(data as CommandEvent[]);
  }

  // ---- Submit command ----
  async function handleSubmit() {
    if (!formDevice) return;
    setSubmitting(true);

    const supabase = createClient();

    let payload = {};
    try {
      payload = JSON.parse(formPayload);
    } catch {
      // keep empty object on parse failure
    }

    // Look up the device's pc_id to use as node_id
    const { data: device } = await supabase
      .from('devices')
      .select('pc_id')
      .eq('id', formDevice)
      .single();
    const nodeId = device?.pc_id || 'unknown';

    await supabase.from('commands').insert({
      node_id: nodeId,
      device_id: formDevice,
      type: formType,
      payload,
    });

    // Refresh commands list
    const { data: refreshed } = await supabase
      .from('commands')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (refreshed) setCommands(refreshed as Command[]);

    setSubmitting(false);
  }

  // ---- Manual refresh ----
  async function handleRefresh() {
    setLoading(true);
    const supabase = createClient();

    const [devicesRes, commandsRes] = await Promise.all([
      supabase.from('devices').select('id, status, model, serial_number, pc_id'),
      supabase
        .from('commands')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (devicesRes.data) setDevices(devicesRes.data as DeviceRow[]);
    if (commandsRes.data) setCommands(commandsRes.data as Command[]);
    setLoading(false);
  }

  // ---- Derive device label ----
  function deviceLabel(d: DeviceRow) {
    return d.serial_number || d.model || d.id.slice(0, 12);
  }

  // Online devices for the device list card
  const onlineDevices = devices.filter((d) => d.status !== 'offline');

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-head font-bold text-foreground flex items-center gap-2">
            <Terminal className="h-6 w-6" />
            명령 패널
          </h1>
          <p className="text-sm text-muted-foreground">
            기기에 명령을 전송하고 실행 결과를 실시간으로 확인합니다
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Realtime</span>
            <Switch
              checked={realtimeEnabled}
              onCheckedChange={setRealtimeEnabled}
            />
            <div
              className={`h-2.5 w-2.5 border-2 border-foreground ${
                realtimeEnabled ? 'bg-green-500' : 'bg-muted'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Top row: devices + form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Device list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              기기 목록
              {realtimeEnabled && (
                <span className="text-xs text-muted-foreground font-normal">(live)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                등록된 기기가 없습니다
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between px-3 py-2 border-2 border-border hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-2 w-2 shrink-0 border-2 border-foreground ${
                          d.status === 'online'
                            ? 'bg-green-500'
                            : d.status === 'busy'
                              ? 'bg-yellow-500'
                              : d.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-sm font-bold truncate">
                        {deviceLabel(d)}
                      </span>
                    </div>
                    <Badge
                      variant={
                        d.status === 'online'
                          ? 'success'
                          : d.status === 'busy'
                            ? 'warning'
                            : d.status === 'error'
                              ? 'error'
                              : 'ghost'
                      }
                    >
                      {d.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Command form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              명령 전송
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Device select */}
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">기기</label>
                <Select value={formDevice} onValueChange={setFormDevice}>
                  <SelectTrigger>
                    <SelectValue placeholder="기기를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {onlineDevices.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        온라인 기기 없음
                      </SelectItem>
                    ) : (
                      onlineDevices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {deviceLabel(d)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Type select */}
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">유형</label>
                <Select
                  value={formType}
                  onValueChange={(v) => setFormType(v as CommandType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMAND_TYPES.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>
                        {ct.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Payload textarea */}
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Payload</label>
                <textarea
                  className="w-full border-2 border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  value={formPayload}
                  onChange={(e) => setFormPayload(e.target.value)}
                  placeholder='{"command": "ls"}'
                />
              </div>

              {/* Submit button */}
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting || !formDevice}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                전송
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Commands table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            명령 목록
            <span className="text-xs text-muted-foreground font-normal">
              ({commands.length}건)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {commands.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              명령 기록이 없습니다
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>기기</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>생성일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commands.map((cmd) => (
                  <TableRow
                    key={cmd.id}
                    className={`cursor-pointer ${
                      selectedCommandId === cmd.id
                        ? 'bg-primary/10 border-l-4 border-l-primary'
                        : ''
                    }`}
                    onClick={() => handleSelectCommand(cmd.id)}
                  >
                    <TableCell className="font-mono text-xs">
                      {cmd.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cmd.device_id.slice(0, 12)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{cmd.type}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(cmd.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(cmd.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Event log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" />
            이벤트 로그
            {selectedCommandId ? (
              <span className="text-xs text-muted-foreground font-normal">
                (명령: {selectedCommandId.slice(0, 8)})
              </span>
            ) : (
              <span className="text-xs text-muted-foreground font-normal">
                (명령을 선택하세요)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedCommandId ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              위 목록에서 명령을 클릭하면 이벤트 로그가 표시됩니다
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              이벤트가 없습니다
            </p>
          ) : (
            <div className="bg-muted border-2 border-border p-3 max-h-64 overflow-y-auto font-mono text-sm space-y-1">
              {events.map((evt) => (
                <div key={evt.id} className="flex gap-3">
                  <span className="text-muted-foreground shrink-0">
                    {formatTime(evt.created_at)}
                  </span>
                  <span
                    className={`font-bold shrink-0 w-24 ${getEventColor(evt.type)}`}
                  >
                    {evt.type}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {typeof evt.payload === 'object'
                      ? JSON.stringify(evt.payload)
                      : String(evt.payload ?? '')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
