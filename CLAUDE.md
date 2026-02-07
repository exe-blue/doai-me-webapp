# CLAUDE.md - DoAi.Me Device Farm

This file provides guidance for AI assistants working on the DoAi.Me Device Farm codebase.

## Project Overview

DoAi.Me is an orchestration platform managing 600+ Android smartphones in a distributed device farm. It follows **Command & Control + State Machine** architecture where the server is the commander (single source of truth) and desktop agents are executors.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4 |
| UI Components | Radix UI + class-variance-authority (NeoBrutalist/RetroUI style) |
| State | React Context, TanStack Query v5 |
| Backend | Express.js, Socket.IO v4 |
| Database | Supabase (PostgreSQL with RLS) |
| Queue | BullMQ + Redis (ioredis) |
| Desktop Agent | Electron v40 |
| Workers | Specialized bots (youtube-bot, install-bot, health-bot) |
| Build | Turbo 2.8, npm workspaces |
| Test | Vitest |
| Lint | ESLint v9 + typescript-eslint |

## Monorepo Structure

```
apps/
  dashboard/        # Next.js web UI (App Router)
  backend/          # Express + Socket.IO server
  server/           # FastAPI Python service
  worker/           # Worker orchestration
  desktop-agent/    # Electron app for device management
  youtube-bot/      # YouTube automation worker
  install-bot/      # App installation worker
  health-bot/       # Device health monitoring worker
  mobile/           # Mobile-related code

packages/
  shared/           # @doai/shared - types, API contracts, socket events
  ui/               # @packages/ui - Radix UI components with RetroUI styling
  worker-core/      # @doai/worker-core - ADB/device control
  worker-types/     # @doai/worker-types - worker type definitions
  workflow-engine/  # @doai/workflow-engine - YAML workflow parser/runner
  ui-automator/     # @doai/ui-automator - UIAutomator wrapper

infra/              # Docker Compose, Supabase config, nginx
docs/               # Architecture docs, specs, rules
  rules/            # Role-based coding rules (RULE_ARCH.md, RULE_UI.md)
scripts/            # Build and utility scripts
```

## Common Commands

```bash
# Development
npm run dev:dashboard       # Start Next.js dashboard
npm run dev:backend         # Start backend server

# Build
npm run build               # Build all workspaces (via Turbo)
npm run build:workers       # Build worker chain (types -> core -> ui-automator -> bots)
npm run build:agent         # Build desktop agent

# Lint & Type Check
npm run lint                # ESLint (v9 flat config)
npm run lint:imports        # Custom import path validation
npm run lint:all            # Both lint + import check
npm run typecheck           # TypeScript noEmit check
npm run typecheck:workers   # Type-check worker chain

# Test
npm run test                # Run Vitest tests (Turbo)

# Storybook
npm run storybook           # Launch Storybook dev server (packages/ui)
npm run build:storybook     # Build static Storybook

# Worker bots
npm run dev:youtube-bot     # Start youtube bot in dev mode
npm run dev:install-bot     # Start install bot in dev mode
npm run dev:health-bot      # Start health bot in dev mode
```

## TypeScript Path Aliases

Defined in root `tsconfig.json`:
- `@doai/shared` / `@doai/shared/*` -> `packages/shared/src/`
- `@doai/ui` / `@doai/ui/*` -> `packages/ui/src/`
- `@/*` -> `apps/dashboard/src/`
- `@packages/ui/*` -> `packages/ui/src/`

## Architecture Rules

These are **critical** rules. Violating them breaks the system's design invariants.

### Command & Control

- **Server decides state** - only the server (backend) can change device state via `stateService.updateDeviceState()`
- **Nodes report events** - desktop agents emit `evt:*` events; they never decide state transitions
- **Event prefix convention** - server-to-node commands use `cmd:` prefix; node-to-server events use `evt:` prefix
- A node must never emit `cmd:` events; the server must never emit `evt:` events

### State Machine

Valid device state transitions:

```
DISCONNECTED -> IDLE (connect/heartbeat)
IDLE -> QUEUED (execute_workflow)
QUEUED -> RUNNING (worker starts job)
RUNNING -> IDLE (workflow_complete)
RUNNING -> ERROR (workflow_fail, errorCount < 3)
RUNNING -> QUARANTINE (workflow_fail, errorCount >= 3)
ERROR -> IDLE (manual_reset)
QUARANTINE -> IDLE (manual_release)
Any -> DISCONNECTED (heartbeat_timeout, 30s)
```

- All transitions must go through `stateService.updateDeviceState()` using `StateTransitionTriggers.*` constants
- Never write device state directly to Redis; always go through `redisService`

### Data Layers

- **Redis** - real-time state (device/node status, statistics). Access only via `redisService`
- **Supabase** - persistent storage (history, workflow logs, audit trail). Never write real-time data directly to Supabase
- **BullMQ** - job queues, distributed per-node (never use a single global queue)

### Workflow Engine

- Workflows are defined in YAML, not hardcoded
- Each step requires a unique `id`, `timeout`, and `retry` config
- Error policies: `fail` (stop workflow), `skip` (next step), `goto` (jump to error handler)

## Coding Standards

| Rule | Detail |
|------|--------|
| Comments | Korean (hangul) |
| Variables/functions | English camelCase |
| Git commits | English, semantic commit messages |
| TypeScript | Strict mode, no `any` |
| Imports | Use `@packages/*` or `@doai/*` aliases, not deep relative paths (`../../..`) |
| Functions | Keep under 50 lines |
| Logging | Use `logger`, never `console.log` in production |
| Constants | No magic numbers; use named constants |
| Exports | Named exports only (no default exports) |

## UI Component Conventions

Components live in `packages/ui/src/components/` using kebab-case folders:

```
packages/ui/src/components/
  {component-name}/
    {component-name}.tsx          # Implementation
    {component-name}.stories.tsx  # Storybook story
```

Required patterns:
- `class-variance-authority` (`cva`) for variants
- `cn()` from `@packages/ui/lib/utils` for className merging
- `React.forwardRef` + `displayName` on all components
- NeoBrutalist style tokens: `border-2 border-black`, `shadow-md`, `hover:translate-y-1`
- Use CSS variables (`bg-primary`, `text-foreground`), not hardcoded colors
- New components must be re-exported from `packages/ui/src/index.ts`

## Dashboard (Frontend) Patterns

- **App Router** (Next.js 13+ style) at `apps/dashboard/src/app/`
- **Auth** via Supabase in `contexts/auth-context.tsx`
- **Real-time** via Socket.IO in `contexts/socket-context.tsx` and `hooks/use-socket.ts`
- **Server state** via TanStack Query hooks in `hooks/queries/`
- **Styling** via Tailwind CSS v4, NeoBrutalist/RetroUI design system, Pretendard font

## Backend Patterns

- **Socket handlers** in `apps/backend/src/socket/handlers/`
- **Database access** via repository pattern in `apps/backend/src/db/repositories/`
- **Queue management** via `apps/backend/src/queue/QueueManager.ts`
- **State management** via Redis-backed `apps/backend/src/state/StateManager.ts`
- **Monitoring** via `apps/backend/src/monitor/` (MetricsCollector, AlertManager)

## Testing

- Framework: Vitest
- Dashboard tests: jsdom environment, React Testing Library
- Backend tests: Node environment, integration tests for DB repositories
- Test location: co-located `__tests__/` directories or `*.test.{ts,tsx}` files
- Run with `npm run test` (Turbo-managed, no caching)

## Pre-commit Hooks

Husky + lint-staged runs on `*.{ts,tsx,js,jsx}` files:
1. `eslint --fix`
2. `node scripts/lint-imports.js` (validates import paths)

## Forbidden Patterns

- Creating code files in the project root directory
- `console.log` in production code
- Importing from `_archive/` or `_references/` directories
- Absolute system paths (`C:\`, `/Users/`)
- Nodes deciding device state (server-only responsibility)
- Undefined state transitions
- Direct Redis key manipulation (use `redisService`)
- Global single queue (must distribute per-node)
- Hardcoded workflows (use YAML)
- Magic numbers for heartbeat config (use `HeartbeatConfig` constants)
- CSS-in-JS or inline styles
- `any` type in TypeScript

## Environment

- Node.js >= 18.0.0
- npm 11.6.2 (specified in `packageManager` field)
- Environment variables documented in `.env.example` (126+ vars covering Supabase, Redis, YouTube API, worker auth, monitoring webhooks, etc.)

## Key Documentation

- `docs/rules/RULE_ARCH.md` - Architecture rules (all developers must read)
- `docs/rules/RULE_UI.md` - UI/Storybook conventions (frontend)
- `docs/SYSTEM-SPECIFICATION.md` - JSON schema specs for data types
- `docs/event-contracts.md` - Socket.IO event specifications
- `docs/api_spec.md` - REST API documentation
- `docs/PHILOSOPHY.md` - Project vision and principles
- `CONTRIBUTING.md` - Development setup and SonarLint configuration
