# Dashboard Control System - Implementation Plan

**Plan ID:** dashboard-control-v1
**Created:** 2026-01-29
**Status:** Executing

---

## Requirements Summary

### 1. 노드 보기 (Dashboard/Nodes)
- PC Worker > Device 2단 계층 구조
- 디바이스 카드: 그리드 레이아웃
- 상태 인디케이터: 🟢 idle, 🟡 running, 🔴 error, ⚪ offline
- 카드 클릭 시 Remote View 모달

### 2. Remote View Modal
- 기기 화면 실시간 보기 (스크린샷 기반)
- 클릭/스크롤 제어
- 화면 갱신 버튼

### 3. Broadcast Control (Master-Slave)
- 마스터 기기 선택
- 슬레이브 기기들 자동 동기화
- 동일 명령 브로드캐스트

---

## Architecture Decision

**Supabase Realtime 사용** (Socket.io 대신)
- 이유: 이미 devices, job_assignments에 Realtime 구독 구현됨
- scrcpy_commands 테이블로 명령 전달 (기존 패턴)
- 스크린샷은 API Route로 처리 (ADB screencap)

---

## Implementation Steps

### Step 1: DB 스키마 확장
- `device_commands` 테이블 추가 (input tap/swipe 명령용)

### Step 2: API Route 추가
- `POST /api/device/screenshot` - 스크린샷 캡처
- `POST /api/device/command` - 입력 명령 전송

### Step 3: Dashboard Nodes Page
- `/dashboard/nodes` 페이지 생성
- PC Worker별 그룹핑
- 디바이스 카드 컴포넌트
- 실시간 상태 업데이트

### Step 4: Remote View Modal
- 스크린샷 표시
- 클릭/스크롤 컨트롤
- 자동 갱신

### Step 5: Broadcast Control
- 마스터 선택 UI
- 슬레이브 체크박스
- 명령 브로드캐스트 로직

---

## Files to Create/Modify

### New Files:
- `dashboard/src/app/dashboard/nodes/page.tsx`
- `dashboard/src/components/nodes/device-card.tsx`
- `dashboard/src/components/nodes/device-group.tsx`
- `dashboard/src/components/nodes/remote-view-modal.tsx`
- `dashboard/src/components/nodes/broadcast-control.tsx`
- `dashboard/src/app/api/device/screenshot/route.ts`
- `dashboard/src/app/api/device/command/route.ts`

### Modify Files:
- `supabase-schema.sql` (device_commands 테이블)
- `client-pc/worker.js` (명령 처리 추가)
