/**
 * Manager Components
 * 
 * Exports all manager-related modules for the desktop agent.
 * Following the Command & Control pattern where:
 * - Manager sends commands (cmd:*)
 * - Workers send events (evt:*)
 */

// WorkerRegistry - Manages worker registration and tracking
export {
  WorkerRegistry,
  type RegisteredWorker,
  type TrackedDevice,
  type WorkerRegistryConfig,
  type WorkerRegistryEvents,
} from './WorkerRegistry';

// TaskDispatcher - Dispatches jobs to workers
export {
  TaskDispatcher,
  type DispatchedJob,
  type DispatchOptions,
  type JobStatus,
  type TaskDispatcherConfig,
  type TaskDispatcherEvents,
} from './TaskDispatcher';

// ScreenStreamProxy - Proxies minicap frames from workers to UI
export {
  ScreenStreamProxy,
  type ActiveStream,
  type StreamViewer,
  type ScreenStreamProxyConfig,
  type ScreenStreamProxyEvents,
} from './ScreenStreamProxy';

// WorkerServer - Socket.IO server for worker connections
export {
  WorkerServer,
  type WorkerServerConfig,
  type WorkerServerEvents,
} from './WorkerServer';
