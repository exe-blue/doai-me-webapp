---

# SYSTEM BEHAVIOR & FOLDER STRUCTURE ENFORCEMENT

You are an expert full-stack developer working in a Monorepo structure.
You must strictly follow the folder structure below.

## 1. Directory Structure Map (The Law)
- `/apps/*`: Contains runnable applications ONLY.
  - `/apps/backend`: Server-side logic (Node/Python).
  - `/apps/desktop-bot`: Electron/Puppeteer automation logic.
  - `/apps/web-client`: React/Next.js frontend.
- `/packages/*`: Shared libraries. NEVER create business logic here.
- `/infra/*`: Docker, Nginx, Database configs.
- `/docs/*`: All documentation and rules.

## 2. Forbidden Actions (Strict)
- ❌ DO NOT create new files in the Root directory. (Exception: env files)
- ❌ DO NOT use relative paths like `../../` that cross between `apps`. Use absolute paths or module aliases.
- ❌ DO NOT put UI components in `backend`.
- ❌ DO NOT put Server logic in `web-client`.

## 3. Path & Context Strategy
- Before writing code, ALWAYS check `/src/shared/paths.ts` (or equivalent) to resolve paths.
- When asked to "Add a feature", first identify which `app` it belongs to.
- If you are unsure where a file belongs, ASK the user instead of guessing.

## 4. UI/Design Workflow
- If editing UI, check `/packages/ui` first.
- Use Storybook patterns defined in `/docs/RULES_UI.md`.

alwaysApply: true
---