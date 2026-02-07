# DoAi.Me Project Instructions

## Code Changes Scope

- Only modify files directly related to the user's request. Do not make opportunistic changes to unrelated files unless explicitly asked.
- When given a specific task (e.g., 'fix SonarQube issues in main.ts'), do NOT expand scope to other files.
- If you notice issues in unrelated files, mention them but don't fix them unless asked.

## Git Operations

- When pushing to remote, always verify the push actually went through by checking `git log --oneline origin/main..HEAD` afterward.
- If using HTTPS and it fails, fall back to SSH.
- Before committing, ensure all typecheck (`npx tsc --noEmit`) and lint checks pass.
- Use conventional commit messages: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.

## Build Environment

- This project runs in WSL2. Be aware of known WSL issues:
  - SWC binaries may not work; ensure `@next/swc-linux-x64-gnu` or equivalent linux binaries are installed
  - IPv6 connections to Supabase may fail; use IPv4 or fallback to SQL Editor
  - Electron/native module builds may need PowerShell on Windows side, not WSL
  - `esbuild` needs `@esbuild/linux-x64` installed explicitly (WSL/Win node_modules mismatch)
  - `sudo` may not be available; use creative workarounds if needed

## Import & Module Resolution

- When searching for imports across the codebase, always use both single-quote and double-quote patterns in grep.
- For monorepo shared packages (@doai/shared, @packages/ui), prefer proxy file re-exports over complex tsconfig paths or moduleResolution hacks.
- Path aliases: `@doai/shared` for shared package, `@packages/ui` for UI components.

## Testing

- Always run the full test suite (`turbo test` or equivalent) after major changes and report the pass/fail count.
- Ensure test scripts exist and are non-empty in all workspace packages before running turbo test.
- After writing tests, run them at least once to confirm they pass before committing.

## Large Migrations & Refactors

- For migrations spanning 10+ files, create a checklist plan first and track completion of each item.
- When linter/lint-staged reverts your changes, identify the conflicting rule and either fix the code to comply or disable the rule with an inline comment. Do NOT just re-apply the same edit repeatedly.
- Save migration plans to `docs/plans/PLAN-<feature-name>.md` with checkboxes so subsequent sessions can pick up where the previous one left off.

## Monorepo Structure

- **apps/dashboard**: Next.js frontend (Tailwind v4, RetroUI NeoBrutalist design)
- **apps/backend**: Express + Socket.IO + BullMQ backend
- **apps/desktop-agent**: Electron desktop agent
- **apps/worker**: Python Celery worker (Appium)
- **packages/ui**: Shared UI component library (Storybook 8.6)
- **packages/shared**: Shared TypeScript types and constants
- **packages/emulator-manager**: Docker emulator management
- **packages/stream-hub**: Device screen streaming pipeline

## Design System (RetroUI NeoBrutalist)

- Fonts: Pretendard Variable (`--font-head`, `--font-sans`)
- Primary: `#ffdb33`, Primary Hover: `#ffcc00`
- Size enums: `sm/md/lg` (NOT `default`)
- Key classes: `font-head`, `border-2 border-border`, `shadow-md`, `hover:shadow`
- No `font-mono` in dashboard pages (exceptions: logs, cron expressions)
- No gradients (`bg-gradient-to-*`), no glow shadows (`shadow-[0_0_*]`)
- Status indicators: square dots with `border-2 border-foreground`
