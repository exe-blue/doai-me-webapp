/**
 * BullMQ 워크플로우 Worker
 * 큐에서 Job을 가져와 워크플로우 실행
 */

const { Worker } = require('bullmq');
const redisService = require('../services/redisService');
const queueService = require('../services/queueService');

// ============================================
// 설정
// ============================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NODE_ID = process.env.NODE_ID || `node-${process.env.HOSTNAME || 'local'}`;

const redisConnection = {
  host: new URL(REDIS_URL).hostname || 'localhost',
  port: parseInt(new URL(REDIS_URL).port) || 6379,
  maxRetriesPerRequest: null,
};

// ============================================
// 워크플로우 정의 (임시 - 추후 YAML에서 로드)
// ============================================

const WORKFLOWS = {
  youtube_watch: {
    id: 'youtube_watch',
    name: 'YouTube 시청',
    version: 1,
    timeout: 300000, // 5분
    steps: [
      {
        id: 'open_youtube',
        action: 'autox',
        script: 'open_app',
        params: { package: 'com.google.android.youtube' },
        timeout: 10000,
        retry: { attempts: 2, delay: 1000, backoff: 'fixed' },
        errorPolicy: 'fail',
      },
      {
        id: 'search_keyword',
        action: 'autox',
        script: 'youtube_search',
        params: { keyword: '$KEYWORD' },
        timeout: 15000,
        retry: { attempts: 3, delay: 2000, backoff: 'exponential' },
        errorPolicy: 'fail',
      },
      {
        id: 'play_video',
        action: 'autox',
        script: 'youtube_play',
        params: {},
        timeout: 10000,
        retry: { attempts: 2, delay: 1000, backoff: 'fixed' },
        errorPolicy: 'fail',
      },
      {
        id: 'watch_duration',
        action: 'wait',
        params: { duration: '$DURATION_SEC' },
        timeout: 600000,
        retry: { attempts: 1, delay: 0, backoff: 'fixed' },
        errorPolicy: 'skip',
      },
      {
        id: 'take_screenshot',
        action: 'adb',
        params: { command: 'screencap -p /sdcard/evidence.png' },
        timeout: 5000,
        retry: { attempts: 2, delay: 500, backoff: 'fixed' },
        errorPolicy: 'skip',
      },
      {
        id: 'complete',
        action: 'system',
        params: { action: 'mark_complete' },
        timeout: 5000,
        errorPolicy: 'fail',
      },
    ],
  },
};

// ============================================
// Worker 프로세서
// ============================================

/**
 * 워크플로우 Job 처리 함수
 * @param {Object} job - BullMQ Job
 */
async function processWorkflowJob(job) {
  const { executionId, workflowId, deviceIds, params } = job.data;
  
  console.log(`[Worker] Processing job: ${job.id}`);
  console.log(`[Worker] Workflow: ${workflowId}, Devices: ${deviceIds.length}`);
  
  const workflow = WORKFLOWS[workflowId];
  if (!workflow) {
    throw new Error(`Unknown workflow: ${workflowId}`);
  }
  
  const results = {
    executionId,
    workflowId,
    totalDevices: deviceIds.length,
    completed: [],
    failed: [],
  };
  
  // 각 디바이스에 대해 워크플로우 실행
  for (const deviceId of deviceIds) {
    try {
      await executeWorkflowForDevice(job, workflow, deviceId, params);
      results.completed.push(deviceId);
    } catch (error) {
      console.error(`[Worker] Device ${deviceId} failed:`, error.message);
      results.failed.push({ deviceId, error: error.message });
    }
    
    // 진행률 업데이트
    const progress = Math.round(
      ((results.completed.length + results.failed.length) / deviceIds.length) * 100
    );
    await job.updateProgress(progress);
  }
  
  // 실행 상태 업데이트
  await redisService.setWorkflowExecution(executionId, {
    workflowId,
    deviceIds,
    status: results.failed.length === 0 ? 'completed' : 'completed_with_errors',
    totalDevices: deviceIds.length,
    completedDevices: results.completed.length,
    failedDevices: results.failed.length,
    completedAt: Date.now(),
  });
  
  return results;
}

/**
 * 단일 디바이스에 워크플로우 실행
 * @param {Object} job 
 * @param {Object} workflow 
 * @param {string} deviceId 
 * @param {Object} params 
 */
async function executeWorkflowForDevice(job, workflow, deviceId, params) {
  console.log(`[Worker] Executing workflow for device: ${deviceId}`);
  
  // 디바이스 상태 → RUNNING
  await redisService.setDeviceState(deviceId, {
    state: redisService.DeviceState.RUNNING,
    nodeId: NODE_ID,
    workflowId: workflow.id,
    currentStep: '',
    progress: 0,
    errorCount: 0,
  });
  
  const totalSteps = workflow.steps.length;
  let currentStepIndex = 0;
  let errorCount = 0;
  
  const context = {
    workflow,
    deviceId,
    params,
    variables: {},
    startedAt: Date.now(),
    currentStep: 0,
  };
  
  try {
    // Step 순차 실행
    while (currentStepIndex < totalSteps) {
      const step = workflow.steps[currentStepIndex];
      
      // 디바이스 상태 업데이트
      const progress = Math.round((currentStepIndex / totalSteps) * 100);
      await redisService.setDeviceState(deviceId, {
        state: redisService.DeviceState.RUNNING,
        nodeId: NODE_ID,
        workflowId: workflow.id,
        currentStep: step.id,
        progress,
      });
      
      console.log(`[Worker] Device ${deviceId}: Step ${currentStepIndex + 1}/${totalSteps} - ${step.id}`);
      
      try {
        // Step 실행
        const result = await executeStep(step, context);
        
        // 성공 시 다음 step
        context.variables[step.id] = result;
        currentStepIndex++;
        errorCount = 0; // 에러 카운트 리셋
        
      } catch (stepError) {
        console.error(`[Worker] Step ${step.id} failed:`, stepError.message);
        
        // 에러 정책 처리
        switch (step.errorPolicy) {
          case 'skip':
            // 건너뛰고 다음 step
            console.log(`[Worker] Skipping step ${step.id}`);
            currentStepIndex++;
            break;
            
          case 'goto':
            // 특정 step으로 이동
            if (step.nextOnError) {
              const targetIndex = workflow.steps.findIndex(s => s.id === step.nextOnError);
              if (targetIndex >= 0) {
                console.log(`[Worker] Jumping to step ${step.nextOnError}`);
                currentStepIndex = targetIndex;
              } else {
                throw new Error(`Target step not found: ${step.nextOnError}`);
              }
            } else {
              throw stepError;
            }
            break;
            
          case 'fail':
          default:
            // 에러 카운트 증가 및 실패 처리
            errorCount++;
            await redisService.incrementDeviceErrorCount(deviceId);
            throw stepError;
        }
      }
    }
    
    // 워크플로우 완료
    await redisService.setDeviceState(deviceId, {
      state: redisService.DeviceState.IDLE,
      nodeId: NODE_ID,
      workflowId: '',
      currentStep: '',
      progress: 100,
      errorCount: 0,
    });
    
    console.log(`[Worker] Device ${deviceId}: Workflow completed`);
    
    // 완료 이벤트 발행
    await redisService.publishWorkflowEvent('device_workflow_completed', {
      deviceId,
      workflowId: workflow.id,
      duration: Date.now() - context.startedAt,
    });
    
  } catch (error) {
    // 워크플로우 실패
    const newErrorCount = await redisService.incrementDeviceErrorCount(deviceId);
    
    await redisService.setDeviceState(deviceId, {
      state: newErrorCount >= 3 ? redisService.DeviceState.QUARANTINE : redisService.DeviceState.ERROR,
      nodeId: NODE_ID,
      workflowId: workflow.id,
      currentStep: context.currentStep,
      progress: Math.round((currentStepIndex / totalSteps) * 100),
      errorMessage: error.message,
    });
    
    // 실패 이벤트 발행
    await redisService.publishWorkflowEvent('device_workflow_failed', {
      deviceId,
      workflowId: workflow.id,
      error: error.message,
      errorCount: newErrorCount,
    });
    
    // 3회 이상 실패 시 알림
    if (newErrorCount >= 3) {
      await redisService.publishAlert('warning', `Device ${deviceId} quarantined after ${newErrorCount} failures`, {
        deviceId,
        workflowId: workflow.id,
        error: error.message,
      });
    }
    
    throw error;
  }
}

/**
 * Step 실행
 * @param {Object} step 
 * @param {Object} context 
 */
async function executeStep(step, context) {
  const { deviceId, params, variables } = context;
  
  // 파라미터 변수 치환
  const resolvedParams = resolveParams(step.params, { ...params, ...variables });
  
  // Retry 로직
  const maxAttempts = step.retry?.attempts || 1;
  const delayMs = step.retry?.delay || 1000;
  const backoff = step.retry?.backoff || 'fixed';
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 액션별 실행
      switch (step.action) {
        case 'autox':
          return await executeAutoxScript(deviceId, step.script, resolvedParams, step.timeout);
          
        case 'adb':
          return await executeAdbCommand(deviceId, resolvedParams.command, step.timeout);
          
        case 'wait':
          const duration = parseInt(resolvedParams.duration) || 1000;
          await sleep(duration * 1000);
          return { waited: duration };
          
        case 'system':
          return await executeSystemAction(deviceId, resolvedParams, context);
          
        case 'condition':
          return evaluateCondition(resolvedParams, context);
          
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }
      
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        // 재시도 대기
        const waitTime = backoff === 'exponential'
          ? delayMs * Math.pow(2, attempt - 1)
          : delayMs;
        
        console.log(`[Worker] Step ${step.id} attempt ${attempt} failed, retrying in ${waitTime}ms`);
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError || new Error(`Step ${step.id} failed after ${maxAttempts} attempts`);
}

// ============================================
// 액션 실행 함수
// ============================================

/**
 * AutoX.js 스크립트 실행 (시뮬레이션)
 */
async function executeAutoxScript(deviceId, script, params, timeout) {
  console.log(`[Worker] AutoX.js: ${script} on ${deviceId}`, params);
  
  // TODO: 실제 AutoX.js 스크립트 실행 연동
  // 현재는 시뮬레이션
  await sleep(Math.random() * 2000 + 1000);
  
  return { success: true, script, params };
}

/**
 * ADB 명령 실행 (시뮬레이션)
 */
async function executeAdbCommand(deviceId, command, timeout) {
  console.log(`[Worker] ADB: ${command} on ${deviceId}`);
  
  // TODO: 실제 ADB 명령 실행 연동
  // 현재는 시뮬레이션
  await sleep(500);
  
  return { success: true, command };
}

/**
 * 시스템 액션 실행
 */
async function executeSystemAction(deviceId, params, context) {
  const { action } = params;
  
  switch (action) {
    case 'mark_complete':
      return { completed: true, timestamp: Date.now() };
      
    case 'log':
      console.log(`[Worker] Log from ${deviceId}:`, params.message);
      return { logged: true };
      
    default:
      throw new Error(`Unknown system action: ${action}`);
  }
}

/**
 * 조건 평가
 */
function evaluateCondition(params, context) {
  // TODO: 조건 표현식 평가 구현
  return { result: true };
}

// ============================================
// 유틸리티
// ============================================

/**
 * 파라미터 변수 치환
 */
function resolveParams(params, variables) {
  const resolved = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const varName = value.slice(1);
      resolved[key] = variables[varName] ?? value;
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * Sleep 유틸리티
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Worker 시작
// ============================================

/**
 * Worker 초기화 및 시작
 */
async function startWorker() {
  console.log(`[Worker] Starting workflow worker for node: ${NODE_ID}`);
  
  // Redis 연결
  await redisService.connect();
  
  // 워크플로우 Worker 생성
  const worker = queueService.createWorkflowWorker(NODE_ID, processWorkflowJob);
  
  // 우선순위 Worker 생성 (긴급 명령 처리)
  queueService.createPriorityWorker(async (job) => {
    console.log(`[Worker] Processing urgent job: ${job.id}`);
    
    const { type, executionId, reason } = job.data;
    
    if (type === 'cancel_workflow') {
      console.log(`[Worker] Cancelling workflow: ${executionId}`);
      // TODO: 실제 취소 로직 구현
    }
    
    return { processed: true };
  });
  
  // 노드 상태 등록
  await redisService.setNodeState(NODE_ID, {
    status: 'online',
    deviceCount: 0,
    activeJobs: 0,
    lastSeen: Date.now(),
  });
  
  // Heartbeat 시작
  setInterval(async () => {
    const queueStats = await queueService.getQueueStats(queueService.QUEUES.WORKFLOW(NODE_ID));
    
    await redisService.setNodeState(NODE_ID, {
      status: 'online',
      activeJobs: queueStats?.active || 0,
      lastSeen: Date.now(),
      cpu: process.cpuUsage().user / 1000000,
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  }, 10000);
  
  console.log(`[Worker] Worker started successfully`);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Worker] SIGTERM received, shutting down...');
    await queueService.shutdown();
    await redisService.disconnect();
    process.exit(0);
  });
  
  return worker;
}

// ============================================
// Exports
// ============================================

module.exports = {
  startWorker,
  processWorkflowJob,
  executeWorkflowForDevice,
  NODE_ID,
};

// 직접 실행 시 Worker 시작
if (require.main === module) {
  startWorker().catch(err => {
    console.error('[Worker] Failed to start:', err);
    process.exit(1);
  });
}
