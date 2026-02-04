/**
 * 워크플로우 시스템 통합 테스트
 * 
 * Backend (BullMQ + Socket.IO) ↔ Desktop Agent 통신 테스트
 * 
 * 사용법:
 *   npx ts-node scripts/tests/test_workflow_integration.ts
 * 
 * 테스트 시나리오:
 *   1. Mock Agent가 Backend에 연결
 *   2. Backend에서 워크플로우 Job 생성
 *   3. Agent가 EXECUTE_WORKFLOW 이벤트 수신
 *   4. Agent가 진행 상황 보고
 *   5. Agent가 완료 보고
 */

import { io, Socket } from 'socket.io-client';
import fetch from 'node-fetch';

// ============================================
// 설정
// ============================================

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
const NODE_ID = 'test_node_001';

// ============================================
// Mock Agent
// ============================================

class MockAgent {
  private socket: Socket | null = null;
  private nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }

  async connect(): Promise<void> {
    console.log(`[MockAgent] Connecting to ${BACKEND_URL}...`);

    return new Promise((resolve, reject) => {
      this.socket = io(BACKEND_URL, {
        transports: ['websocket'],
      });

      this.socket.on('connect', () => {
        console.log(`[MockAgent] Connected: ${this.socket!.id}`);
        this.register();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error(`[MockAgent] Connection error:`, error.message);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log(`[MockAgent] Disconnected: ${reason}`);
      });

      // 워크플로우 실행 명령 수신
      this.socket.on('EXECUTE_WORKFLOW', async (data, ack) => {
        console.log(`[MockAgent] Received EXECUTE_WORKFLOW:`, JSON.stringify(data, null, 2));
        
        // ACK 응답
        ack?.({ received: true });

        // 워크플로우 시뮬레이션 실행
        await this.simulateWorkflow(data);
      });

      // 워크플로우 취소 명령 수신
      this.socket.on('CANCEL_WORKFLOW', (data, ack) => {
        console.log(`[MockAgent] Received CANCEL_WORKFLOW:`, data);
        ack?.({ cancelled: true });
      });
    });
  }

  private register(): void {
    if (!this.socket?.connected) return;

    this.socket.emit('REGISTER', {
      node_id: this.nodeId,
      version: '1.0.0-test',
      device_count: 3,
    }, (response: { success: boolean }) => {
      console.log(`[MockAgent] Registration ${response?.success ? 'success' : 'failed'}`);
    });
  }

  private async simulateWorkflow(data: {
    job_id: string;
    workflow_id: string;
    device_ids: string[];
    params: Record<string, unknown>;
  }): Promise<void> {
    const { job_id, workflow_id, device_ids, params } = data;

    console.log(`[MockAgent] Simulating workflow ${workflow_id} for ${device_ids.length} devices`);

    for (const deviceId of device_ids) {
      // 시뮬레이션: 각 Step 진행
      const steps = ['init', 'open_app', 'search', 'play', 'complete'];
      
      for (let i = 0; i < steps.length; i++) {
        const stepId = steps[i];
        const progress = Math.round(((i + 1) / steps.length) * 100);

        // 진행 상황 보고
        this.sendProgress(job_id, deviceId, stepId, progress);

        // 시뮬레이션 딜레이
        await this.sleep(500);
      }

      // 완료 보고
      this.sendComplete(job_id, deviceId, true, 2500);
    }
  }

  private sendProgress(jobId: string, deviceId: string, step: string, progress: number): void {
    if (!this.socket?.connected) return;

    this.socket.emit('WORKFLOW_PROGRESS', {
      job_id: jobId,
      device_id: deviceId,
      current_step: step,
      progress,
      message: `Step ${step} in progress`,
    });

    console.log(`[MockAgent] Progress: ${deviceId} - ${step} (${progress}%)`);
  }

  private sendComplete(jobId: string, deviceId: string, success: boolean, duration: number): void {
    if (!this.socket?.connected) return;

    this.socket.emit('WORKFLOW_COMPLETE', {
      job_id: jobId,
      device_id: deviceId,
      success,
      duration,
    });

    console.log(`[MockAgent] Complete: ${deviceId} - ${success ? 'SUCCESS' : 'FAILED'}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// ============================================
// API 클라이언트
// ============================================

async function enqueueWorkflow(
  nodeId: string,
  workflowId: string,
  deviceIds: string[],
  params: Record<string, unknown> = {}
): Promise<{ success: boolean; job_id?: string; error?: string }> {
  const response = await fetch(`${BACKEND_URL}/api/workflow/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id: nodeId,
      workflow_id: workflowId,
      device_ids: deviceIds,
      params,
    }),
  });

  return response.json() as Promise<{ success: boolean; job_id?: string; error?: string }>;
}

async function getJobStatus(jobId: string): Promise<unknown> {
  const response = await fetch(`${BACKEND_URL}/api/workflow/${jobId}/status`);
  return response.json();
}

async function getNodes(): Promise<{ nodes: unknown[] }> {
  const response = await fetch(`${BACKEND_URL}/api/nodes`);
  return response.json() as Promise<{ nodes: unknown[] }>;
}

// ============================================
// 테스트 실행
// ============================================

async function runTest(): Promise<void> {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        Workflow Integration Test                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const agent = new MockAgent(NODE_ID);

  try {
    // 1. Mock Agent 연결
    console.log('=== Step 1: Connect Mock Agent ===');
    await agent.connect();
    await sleep(1000);

    // 2. 노드 목록 확인
    console.log('\n=== Step 2: Check Connected Nodes ===');
    const nodesResult = await getNodes();
    console.log('Connected nodes:', JSON.stringify(nodesResult.nodes, null, 2));

    // 3. 워크플로우 Job 생성
    console.log('\n=== Step 3: Enqueue Workflow Job ===');
    const enqueueResult = await enqueueWorkflow(
      NODE_ID,
      'youtube_watch',
      ['device_001', 'device_002'],
      { keyword: 'AI 뉴스', duration: 3000 }
    );
    console.log('Enqueue result:', JSON.stringify(enqueueResult, null, 2));

    if (!enqueueResult.success) {
      throw new Error(`Enqueue failed: ${enqueueResult.error}`);
    }

    // 4. 워크플로우 실행 대기 (Agent가 자동으로 처리)
    console.log('\n=== Step 4: Wait for Workflow Execution ===');
    await sleep(5000);

    // 5. Job 상태 확인
    console.log('\n=== Step 5: Check Job Status ===');
    const jobStatus = await getJobStatus(enqueueResult.job_id!);
    console.log('Job status:', JSON.stringify(jobStatus, null, 2));

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', (error as Error).message);
  } finally {
    agent.disconnect();
    process.exit(0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 실행
runTest();
