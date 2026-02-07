-- =============================================
-- DoAi.Me Consolidated Database Schema
-- =============================================
-- Fresh Supabase database deployment
-- Consolidated from: supabase-schema.sql + 20 migration files
-- Generated: 2026-02-07
--
-- 실행 방법: Supabase SQL Editor에서 전체 실행
-- =============================================

-- =============================================
-- 0. 유틸리티 함수
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 1. ENUM 타입
-- =============================================

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM (
        'pending', 'running', 'success', 'failed', 'retrying', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE onboarding_status AS ENUM (
        'not_started', 'in_progress', 'completed', 'failed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE device_status AS ENUM (
        'IDLE', 'RUNNING', 'BUSY', 'OFFLINE', 'ERROR', 'QUARANTINE'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE pc_status AS ENUM (
        'ONLINE', 'OFFLINE', 'ERROR'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. 테이블 생성 (의존성 순서)
-- =============================================

-- -----------------------------------------
-- 2.1 PCs 테이블 (미니PC 관리)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS pcs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pc_number VARCHAR(4) UNIQUE NOT NULL,
    ip_address INET UNIQUE,
    hostname VARCHAR(100),
    label VARCHAR(100),
    location VARCHAR(100),
    max_devices INT DEFAULT 20,
    status VARCHAR(20) DEFAULT 'offline'
        CHECK (status IN ('online', 'offline', 'error')),
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT pc_number_format CHECK (pc_number ~ '^PC[0-9]{2}$')
);

-- -----------------------------------------
-- 2.2 Devices 테이블 (통합)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- PC 연결
    pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL,

    -- 관리번호
    device_number INT,
    management_code VARCHAR(10) UNIQUE,
    management_number TEXT,

    -- 식별자
    serial_number TEXT UNIQUE,
    ip_address INET,
    name TEXT,

    -- 그룹 (레거시 호환)
    group_id TEXT DEFAULT 'P1-G1',

    -- 디바이스 정보
    model TEXT,
    model_name TEXT,
    android_version TEXT,

    -- 연결
    connection_type VARCHAR(10) DEFAULT 'usb'
        CHECK (connection_type IN ('usb', 'wifi', 'both', 'adb_wifi')),
    usb_port INT,

    -- 상태 (모니터링)
    state TEXT DEFAULT 'DISCONNECTED'
        CHECK (state IN ('DISCONNECTED', 'IDLE', 'QUEUED', 'RUNNING', 'ERROR', 'QUARANTINE')),

    -- 상태 (잡 시스템)
    status TEXT DEFAULT 'idle'
        CHECK (status IN ('idle', 'busy', 'offline', 'online', 'error')),

    -- 배터리
    battery INT CHECK (battery IS NULL OR (battery >= 0 AND battery <= 100)),
    battery_level INT CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)),

    -- 에러
    error_count INT DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,

    -- 참조
    last_workflow_id TEXT,
    last_task_at TIMESTAMPTZ,

    -- 하트비트
    last_seen TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ,

    -- 메타
    metadata JSONB DEFAULT '{}',

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 제약조건
    CONSTRAINT device_number_range CHECK (device_number IS NULL OR device_number BETWEEN 1 AND 999)
);

-- -----------------------------------------
-- 2.3 Jobs 테이블 (작업 공고)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    keyword TEXT DEFAULT NULL,
    video_title TEXT,
    duration_sec INTEGER DEFAULT 60,
    target_group TEXT,
    target_url TEXT NOT NULL,
    video_url TEXT,
    script_type TEXT NOT NULL DEFAULT 'youtube_watch',
    duration_min_pct INTEGER NOT NULL DEFAULT 30,
    duration_max_pct INTEGER NOT NULL DEFAULT 90,
    prob_like INTEGER NOT NULL DEFAULT 0,
    like_probability INTEGER,
    prob_comment INTEGER NOT NULL DEFAULT 0,
    prob_playlist INTEGER NOT NULL DEFAULT 0,
    base_reward INTEGER NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT true,
    total_assignments INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.4 Job Assignments 테이블 (작업 할당)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS job_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    device_serial TEXT,
    agent_id UUID,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paused', 'running', 'completed', 'failed', 'cancelled')),
    progress_pct INTEGER NOT NULL DEFAULT 0,
    final_duration_sec INTEGER,
    watch_percentage INTEGER DEFAULT 0,
    did_like BOOLEAN DEFAULT false,
    did_comment BOOLEAN DEFAULT false,
    did_playlist BOOLEAN DEFAULT false,
    search_success BOOLEAN DEFAULT false,
    error_log TEXT,
    error_code TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0
        CHECK (retry_count >= 0 AND retry_count <= 10),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- -----------------------------------------
-- 2.5 Salary Logs 테이블 (급여 로그)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS salary_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES job_assignments(id),
    job_id UUID NOT NULL REFERENCES jobs(id),
    watch_percentage INTEGER NOT NULL,
    actual_duration_sec INTEGER NOT NULL,
    rank_in_group INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.6 Monitored Channels 테이블 (채널 모니터링)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS monitored_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id TEXT NOT NULL UNIQUE,
    channel_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_video_id TEXT,
    last_checked_at TIMESTAMPTZ,
    preset_settings JSONB DEFAULT '{
        "duration_sec": 60,
        "duration_min_pct": 30,
        "duration_max_pct": 90,
        "prob_like": 50,
        "prob_comment": 30,
        "prob_playlist": 10,
        "script_type": "youtube_search"
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.7 Device States 테이블 (실시간 상태)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS device_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    node_id TEXT,
    state TEXT DEFAULT 'DISCONNECTED'
        CHECK (state IN ('DISCONNECTED', 'IDLE', 'QUEUED', 'RUNNING', 'ERROR', 'QUARANTINE')),
    current_workflow_id TEXT,
    current_step TEXT,
    progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error_message TEXT,
    battery INT,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.8 Workflows 테이블 (워크플로우 정의)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    version INT DEFAULT 1,
    steps JSONB NOT NULL DEFAULT '[]',
    params JSONB DEFAULT '{}',
    params_schema JSONB DEFAULT '{}',
    timeout INT DEFAULT 300000,
    timeout_ms INTEGER DEFAULT 600000,
    retry_policy JSONB DEFAULT '{}',
    on_error JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT workflows_version_unique UNIQUE (id, version)
);

-- -----------------------------------------
-- 2.9 Workflow Executions 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id TEXT UNIQUE,
    workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
    workflow_version INT,
    device_id UUID,
    device_ids TEXT[] DEFAULT '{}',
    node_id TEXT,
    node_ids TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'queued'
        CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed', 'cancelled', 'partial')),
    params JSONB DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    current_step TEXT,
    progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_devices INT DEFAULT 0,
    completed_devices INT DEFAULT 0,
    failed_devices INT DEFAULT 0,
    triggered_by UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.10 Execution Logs 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS execution_logs (
    id BIGSERIAL PRIMARY KEY,
    execution_id TEXT,
    device_id TEXT,
    workflow_id TEXT,
    step_id TEXT,
    level TEXT DEFAULT 'info'
        CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    status TEXT
        CHECK (status IN ('started', 'progress', 'completed', 'failed', 'skipped', 'retrying')),
    message TEXT,
    data JSONB DEFAULT '{}',
    details JSONB DEFAULT '{}',
    video_id TEXT,
    watch_duration_sec INT,
    error_category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.11 Settings 테이블 (시스템 설정)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.12 Alerts 테이블 (알림)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    level TEXT CHECK (level IN ('critical', 'warning', 'info')),
    message TEXT NOT NULL,
    source TEXT,
    data JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.13 Videos 테이블 (콘텐츠)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT,
    channel_id TEXT,
    channel_name TEXT,
    thumbnail_url TEXT,
    duration_sec INT,
    video_duration_sec INT,
    search_keyword TEXT,
    target_views INT DEFAULT 100,
    completed_views INT DEFAULT 0,
    failed_views INT DEFAULT 0,
    watch_duration_sec INT DEFAULT 60,
    watch_duration_min_pct INT DEFAULT 30,
    watch_duration_max_pct INT DEFAULT 90,
    prob_like INT DEFAULT 0,
    prob_comment INT DEFAULT 0,
    prob_subscribe INT DEFAULT 0,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    priority TEXT DEFAULT 'normal'
        CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    last_scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.14 Channels 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    handle TEXT,
    profile_url TEXT,
    banner_url TEXT,
    thumbnail_url TEXT,
    subscriber_count TEXT,
    video_count INT DEFAULT 0,
    total_views INT DEFAULT 0,
    category TEXT,
    is_monitored BOOLEAN DEFAULT false,
    auto_collect BOOLEAN DEFAULT false,
    collect_interval_hours INT DEFAULT 24,
    last_collected_at TIMESTAMPTZ,
    last_video_check_at TIMESTAMPTZ,
    default_watch_duration_sec INT DEFAULT 60,
    default_prob_like INT DEFAULT 0,
    default_prob_comment INT DEFAULT 0,
    default_prob_subscribe INT DEFAULT 0,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'archived')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.15 Keywords 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS keywords (
    id SERIAL PRIMARY KEY,
    keyword TEXT NOT NULL UNIQUE,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    collect_interval_hours INT DEFAULT 12,
    max_results INT DEFAULT 10,
    discovered_count INT DEFAULT 0,
    used_count INT DEFAULT 0,
    last_collected_at TIMESTAMPTZ,
    min_views INT DEFAULT 0,
    min_duration_sec INT DEFAULT 30,
    max_duration_sec INT DEFAULT 3600,
    exclude_keywords TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.16 Schedules 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    cron_expression TEXT NOT NULL,
    timezone TEXT DEFAULT 'Asia/Seoul',
    schedule_type TEXT DEFAULT 'workflow'
        CHECK (schedule_type IN ('workflow', 'video_batch', 'channel_collect', 'keyword_collect', 'maintenance')),
    workflow_id TEXT,
    video_id TEXT,
    video_filter JSONB DEFAULT '{}',
    batch_size INT DEFAULT 100,
    params JSONB DEFAULT '{}',
    max_concurrent INT DEFAULT 50,
    is_active BOOLEAN DEFAULT true,
    run_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    fail_count INT DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    last_status TEXT,
    last_run_status TEXT,
    last_run_result JSONB,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT schedules_name_unique UNIQUE (name)
);

-- -----------------------------------------
-- 2.17 Daily Stats 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS daily_stats (
    date DATE PRIMARY KEY,
    total_executions INT DEFAULT 0,
    total_completed INT DEFAULT 0,
    total_failed INT DEFAULT 0,
    total_cancelled INT DEFAULT 0,
    success_rate DECIMAL(5,2),
    total_watch_time_sec BIGINT DEFAULT 0,
    avg_watch_time_sec DECIMAL(10,2),
    total_likes INT DEFAULT 0,
    total_comments INT DEFAULT 0,
    total_subscribes INT DEFAULT 0,
    unique_videos INT DEFAULT 0,
    unique_devices INT DEFAULT 0,
    active_devices INT DEFAULT 0,
    avg_tasks_per_device DECIMAL(10,2),
    by_hour JSONB DEFAULT '{}',
    by_node JSONB DEFAULT '{}',
    by_video JSONB DEFAULT '{}',
    by_status JSONB DEFAULT '{}',
    by_workflow JSONB DEFAULT '{}',
    error_breakdown JSONB DEFAULT '{}',
    error_summary JSONB DEFAULT '{}',
    peak_hour INT,
    avg_completion_rate DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.18 Video Executions 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS video_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    node_id TEXT,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    actual_watch_duration_sec INT,
    watch_percentage INT,
    did_like BOOLEAN DEFAULT false,
    did_comment BOOLEAN DEFAULT false,
    did_subscribe BOOLEAN DEFAULT false,
    comment_text TEXT,
    error_code TEXT,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    execution_date DATE
);

-- -----------------------------------------
-- 2.19 Tasks 테이블 (Celery 작업 이력)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    celery_task_id VARCHAR(255) UNIQUE,
    task_name VARCHAR(100) NOT NULL,
    queue_name VARCHAR(50),
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL,
    status task_status NOT NULL DEFAULT 'pending',
    payload JSONB DEFAULT '{}',
    result JSONB DEFAULT '{}',
    error TEXT,
    error_traceback TEXT,
    retries INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    progress INT DEFAULT 0,
    progress_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds DECIMAL(10, 2),
    meta JSONB DEFAULT '{}',
    CONSTRAINT progress_range CHECK (progress BETWEEN 0 AND 100)
);

-- -----------------------------------------
-- 2.20 System Logs 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info', 'debug')),
    source TEXT NOT NULL CHECK (source IN ('api', 'worker', 'device', 'database', 'network', 'scheduler')),
    component TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    stack_trace TEXT,
    node_id TEXT,
    device_id TEXT,
    request_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.21 Device Issues 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS device_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'app_crash', 'network_error', 'adb_disconnect', 'low_battery',
        'high_temperature', 'memory_full', 'screen_freeze', 'unknown'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    auto_recoverable BOOLEAN DEFAULT false,
    recovery_attempts INT DEFAULT 0,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.22 Device Onboarding States 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS device_onboarding_states (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    node_id TEXT NOT NULL,
    status onboarding_status NOT NULL DEFAULT 'not_started',
    current_step TEXT,
    completed_steps TEXT[] DEFAULT '{}',
    error_message TEXT,
    config JSONB DEFAULT '{}',
    step_results JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------
-- 2.23 Scripts 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('adb_shell', 'python', 'uiautomator2', 'javascript')),
    content TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    target_group TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    params_schema JSONB NOT NULL DEFAULT '{}',
    default_params JSONB NOT NULL DEFAULT '{}',
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------
-- 2.24 Script Executions 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS script_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    script_version INTEGER NOT NULL,
    device_ids TEXT[] NOT NULL DEFAULT '{}',
    pc_ids TEXT[] NOT NULL DEFAULT '{}',
    params JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'partial')),
    total_devices INTEGER NOT NULL DEFAULT 0,
    completed_devices INTEGER NOT NULL DEFAULT 0,
    failed_devices INTEGER NOT NULL DEFAULT 0,
    triggered_by TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------
-- 2.25 Script Device Results 테이블
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS script_device_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES script_executions(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    management_code TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    output TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 3. 인덱스
-- =============================================

-- pcs
CREATE INDEX IF NOT EXISTS idx_pcs_status ON pcs(status);
CREATE INDEX IF NOT EXISTS idx_pcs_pc_number ON pcs(pc_number);
CREATE INDEX IF NOT EXISTS idx_pcs_last_heartbeat ON pcs(last_heartbeat);

-- devices
CREATE INDEX IF NOT EXISTS idx_devices_pc_id ON devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_state ON devices(state);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_id);
CREATE INDEX IF NOT EXISTS idx_devices_management_code ON devices(management_code);
CREATE INDEX IF NOT EXISTS idx_devices_device_number ON devices(device_number);
CREATE INDEX IF NOT EXISTS idx_devices_management_number ON devices(management_number);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON devices(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_devices_ip_address ON devices(ip_address) WHERE ip_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_serial_unique
    ON devices(serial_number) WHERE serial_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_ip_unique
    ON devices(ip_address) WHERE ip_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_pc_number_unique
    ON devices(pc_id, device_number) WHERE pc_id IS NOT NULL;

-- device_states
CREATE INDEX IF NOT EXISTS idx_device_states_device ON device_states(device_id);
CREATE INDEX IF NOT EXISTS idx_device_states_node ON device_states(node_id);
CREATE INDEX IF NOT EXISTS idx_device_states_state ON device_states(state);

-- jobs
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_target_group ON jobs(target_group);
CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);

-- job_assignments
CREATE INDEX IF NOT EXISTS idx_assignments_job ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_assignments_device ON job_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON job_assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_search_success ON job_assignments(search_success);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_at ON job_assignments(assigned_at);
CREATE INDEX IF NOT EXISTS idx_assignments_error_code ON job_assignments(error_code);

-- salary_logs
CREATE INDEX IF NOT EXISTS idx_salary_logs_job_id ON salary_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_salary_logs_assignment_id ON salary_logs(assignment_id);

-- monitored_channels
CREATE INDEX IF NOT EXISTS idx_monitored_channels_active ON monitored_channels(is_active);
CREATE INDEX IF NOT EXISTS idx_monitored_channels_channel_id ON monitored_channels(channel_id);

-- workflows
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflows_category ON workflows(category);
CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows USING GIN(tags);

-- workflow_executions
CREATE INDEX IF NOT EXISTS idx_executions_device ON workflow_executions(device_id);
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_created ON workflow_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_execution_id ON workflow_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started ON workflow_executions(started_at DESC);

-- execution_logs
CREATE INDEX IF NOT EXISTS idx_logs_execution ON execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_logs_device ON execution_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_logs_level ON execution_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created ON execution_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_error ON execution_logs(level) WHERE level IN ('error', 'fatal');
CREATE INDEX IF NOT EXISTS idx_execution_logs_device_time ON execution_logs(device_id, created_at DESC);

-- alerts
CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON alerts(acknowledged) WHERE acknowledged = false;

-- videos
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_priority ON videos(priority);
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_search_keyword ON videos(search_keyword);

-- channels
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);
CREATE INDEX IF NOT EXISTS idx_channels_monitored ON channels(is_monitored) WHERE is_monitored = true;
CREATE INDEX IF NOT EXISTS idx_channels_auto_collect ON channels(auto_collect) WHERE auto_collect = true;
CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category);

-- keywords
CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);

-- schedules
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_schedules_type ON schedules(schedule_type);

-- daily_stats
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- video_executions
CREATE INDEX IF NOT EXISTS idx_video_executions_video ON video_executions(video_id);
CREATE INDEX IF NOT EXISTS idx_video_executions_device ON video_executions(device_id);
CREATE INDEX IF NOT EXISTS idx_video_executions_status ON video_executions(status);
CREATE INDEX IF NOT EXISTS idx_video_executions_created ON video_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_executions_date ON video_executions(execution_date);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_celery_task_id ON tasks(celery_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_name ON tasks(task_name);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_device_id ON tasks(device_id);
CREATE INDEX IF NOT EXISTS idx_tasks_pc_id ON tasks(pc_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_name ON tasks(queue_name);
CREATE INDEX IF NOT EXISTS idx_tasks_device_recent
    ON tasks(device_id, created_at DESC) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_pc_recent
    ON tasks(pc_id, created_at DESC) WHERE pc_id IS NOT NULL;

-- system_logs
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);
CREATE INDEX IF NOT EXISTS idx_system_logs_node ON system_logs(node_id) WHERE node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_device ON system_logs(device_id) WHERE device_id IS NOT NULL;

-- device_issues
CREATE INDEX IF NOT EXISTS idx_device_issues_device ON device_issues(device_id);
CREATE INDEX IF NOT EXISTS idx_device_issues_status ON device_issues(status);
CREATE INDEX IF NOT EXISTS idx_device_issues_severity ON device_issues(severity);
CREATE INDEX IF NOT EXISTS idx_device_issues_type ON device_issues(type);
CREATE INDEX IF NOT EXISTS idx_device_issues_created ON device_issues(created_at DESC);

-- device_onboarding_states
CREATE INDEX IF NOT EXISTS idx_onboarding_device_id ON device_onboarding_states(device_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_node_id ON device_onboarding_states(node_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON device_onboarding_states(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_created_at ON device_onboarding_states(created_at DESC);

-- scripts
CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status);
CREATE INDEX IF NOT EXISTS idx_scripts_type ON scripts(type);
CREATE INDEX IF NOT EXISTS idx_script_executions_script_id ON script_executions(script_id);
CREATE INDEX IF NOT EXISTS idx_script_executions_status ON script_executions(status);
CREATE INDEX IF NOT EXISTS idx_script_device_results_execution_id ON script_device_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_script_device_results_device_id ON script_device_results(device_id);

-- =============================================
-- 4. 함수
-- =============================================

-- PC 번호 자동 생성
CREATE OR REPLACE FUNCTION generate_pc_number()
RETURNS VARCHAR(4) AS $$
DECLARE
    next_num INT;
BEGIN
    SELECT COALESCE(
        (SELECT MIN(n) FROM generate_series(1, 99) n
         WHERE NOT EXISTS (
             SELECT 1 FROM pcs WHERE pc_number = 'PC' || LPAD(n::TEXT, 2, '0')
         )),
        1
    ) INTO next_num;

    IF next_num > 99 THEN
        RAISE EXCEPTION 'PC 번호가 모두 사용됨 (최대 99개)';
    END IF;

    RETURN 'PC' || LPAD(next_num::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql;

-- PC 삽입 시 자동 번호 할당
CREATE OR REPLACE FUNCTION auto_assign_pc_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pc_number IS NULL OR NEW.pc_number = '' THEN
        NEW.pc_number := generate_pc_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 관리번호 조합
CREATE OR REPLACE FUNCTION get_management_code(p_pc_id UUID, p_device_number INT)
RETURNS VARCHAR(10) AS $$
DECLARE
    v_pc_number VARCHAR(4);
BEGIN
    IF p_pc_id IS NULL THEN
        RETURN 'UNASSIGNED-' || LPAD(p_device_number::TEXT, 3, '0');
    END IF;
    SELECT pc_number INTO v_pc_number FROM pcs WHERE id = p_pc_id;
    IF v_pc_number IS NULL THEN
        RETURN 'UNKNOWN-' || LPAD(p_device_number::TEXT, 3, '0');
    END IF;
    RETURN v_pc_number || '-' || LPAD(p_device_number::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql STABLE;

-- 디바이스 번호 자동 생성
CREATE OR REPLACE FUNCTION generate_device_number(target_pc_id UUID)
RETURNS INT AS $$
DECLARE
    next_num INT;
BEGIN
    IF target_pc_id IS NULL THEN
        SELECT COALESCE(
            (SELECT MIN(n) FROM generate_series(1, 999) n
             WHERE NOT EXISTS (
                 SELECT 1 FROM devices WHERE pc_id IS NULL AND device_number = n
             )),
            1
        ) INTO next_num;
    ELSE
        SELECT COALESCE(
            (SELECT MIN(n) FROM generate_series(1, 999) n
             WHERE NOT EXISTS (
                 SELECT 1 FROM devices WHERE pc_id = target_pc_id AND device_number = n
             )),
            1
        ) INTO next_num;
    END IF;

    IF next_num > 999 THEN
        RAISE EXCEPTION '디바이스 번호가 모두 사용됨 (최대 999개)';
    END IF;

    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- management_code 자동 계산 트리거 함수
CREATE OR REPLACE FUNCTION compute_management_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pc_id IS NOT NULL AND NEW.device_number IS NOT NULL THEN
        SELECT pc_number || '-' || LPAD(NEW.device_number::TEXT, 3, '0')
        INTO NEW.management_code
        FROM pcs WHERE id = NEW.pc_id;
    ELSIF NEW.device_number IS NOT NULL THEN
        NEW.management_code := 'XX-' || LPAD(NEW.device_number::TEXT, 3, '0');
    ELSE
        NEW.management_code := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Task 타임스탬프 자동 갱신 (duration 계산 포함)
CREATE OR REPLACE FUNCTION update_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 로그 정리 함수
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    DELETE FROM execution_logs WHERE created_at < NOW() - INTERVAL '30 days';
    DELETE FROM workflow_executions WHERE created_at < NOW() - INTERVAL '90 days';
    DELETE FROM alerts WHERE acknowledged = true AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 디바이스 상태별 카운트
CREATE OR REPLACE FUNCTION get_device_state_counts()
RETURNS TABLE (state TEXT, count BIGINT)
LANGUAGE sql AS $$
    SELECT state, COUNT(*)
    FROM devices
    GROUP BY state
    ORDER BY
        CASE state
            WHEN 'RUNNING' THEN 1
            WHEN 'IDLE' THEN 2
            WHEN 'QUEUED' THEN 3
            WHEN 'ERROR' THEN 4
            WHEN 'QUARANTINE' THEN 5
            WHEN 'DISCONNECTED' THEN 6
        END;
$$;

-- 워크플로우 실행 통계
CREATE OR REPLACE FUNCTION get_workflow_execution_stats(p_execution_id TEXT)
RETURNS TABLE (
    total_devices INTEGER,
    completed_devices INTEGER,
    failed_devices INTEGER,
    running_devices INTEGER,
    progress_percent INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        we.total_devices,
        we.completed_devices,
        we.failed_devices,
        (we.total_devices - we.completed_devices - we.failed_devices)::INTEGER,
        CASE
            WHEN we.total_devices = 0 THEN 0
            ELSE ROUND((we.completed_devices + we.failed_devices)::NUMERIC / we.total_devices * 100)::INTEGER
        END
    FROM workflow_executions we
    WHERE we.execution_id = p_execution_id;
END;
$$;

-- 실행 로그 삽입 헬퍼
CREATE OR REPLACE FUNCTION insert_execution_log(
    p_device_id UUID,
    p_workflow_id TEXT,
    p_execution_id TEXT,
    p_step_id TEXT,
    p_level TEXT,
    p_status TEXT,
    p_message TEXT,
    p_details JSONB DEFAULT '{}'
)
RETURNS execution_logs
LANGUAGE plpgsql AS $$
DECLARE
    v_log execution_logs;
BEGIN
    INSERT INTO execution_logs (device_id, workflow_id, execution_id, step_id, level, status, message, details)
    VALUES (p_device_id::TEXT, p_workflow_id, p_execution_id, p_step_id, p_level, p_status, p_message, p_details)
    RETURNING * INTO v_log;
    RETURN v_log;
END;
$$;

-- Atomic job claiming (race condition 방지)
CREATE OR REPLACE FUNCTION claim_job(p_pc_id TEXT, p_device_id UUID)
RETURNS TABLE(
    assignment_id UUID,
    job_id UUID,
    keyword TEXT,
    video_title TEXT,
    duration_sec INTEGER
) AS $$
DECLARE
    v_assignment_id UUID;
    v_job_id UUID;
    v_keyword TEXT;
    v_video_title TEXT;
    v_duration_sec INTEGER;
BEGIN
    UPDATE job_assignments ja
    SET status = 'running', started_at = NOW()
    FROM jobs j
    WHERE ja.id = (
        SELECT ja2.id
        FROM job_assignments ja2
        WHERE ja2.status = 'pending' AND ja2.device_id = p_device_id
        ORDER BY ja2.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    AND ja.job_id = j.id
    RETURNING ja.id, ja.job_id, j.keyword, j.video_title, 60
    INTO v_assignment_id, v_job_id, v_keyword, v_video_title, v_duration_sec;

    IF v_assignment_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE devices SET status = 'busy' WHERE id = p_device_id;

    assignment_id := v_assignment_id;
    job_id := v_job_id;
    keyword := v_keyword;
    video_title := v_video_title;
    duration_sec := v_duration_sec;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Salary rank 계산
CREATE OR REPLACE FUNCTION compute_rank_in_group(p_job_id UUID, p_assignment_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_rank INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO v_rank
    FROM salary_logs sl
    WHERE sl.job_id = p_job_id AND sl.assignment_id != p_assignment_id;
    RETURN v_rank;
END;
$$;

-- 원자적 salary_log 삽입
CREATE OR REPLACE FUNCTION insert_salary_log_atomic(
    p_assignment_id UUID,
    p_job_id UUID,
    p_watch_percentage INTEGER,
    p_actual_duration_sec INTEGER
) RETURNS TABLE (
    salary_log_id UUID,
    rank_in_group INTEGER,
    was_created BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rank INTEGER;
    v_log_id UUID;
    v_existing_rank INTEGER;
    v_validated_watch_pct INTEGER;
    v_validated_duration INTEGER;
BEGIN
    v_validated_watch_pct := GREATEST(0, LEAST(100, COALESCE(p_watch_percentage, 0)));
    v_validated_duration := GREATEST(0, COALESCE(p_actual_duration_sec, 0));

    PERFORM pg_advisory_xact_lock(hashtext(p_job_id::text));

    SELECT id, sl.rank_in_group INTO v_log_id, v_existing_rank
    FROM salary_logs sl WHERE sl.assignment_id = p_assignment_id;

    IF v_log_id IS NOT NULL THEN
        salary_log_id := v_log_id;
        rank_in_group := v_existing_rank;
        was_created := FALSE;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT COUNT(*) + 1 INTO v_rank FROM salary_logs WHERE job_id = p_job_id;

    INSERT INTO salary_logs (assignment_id, job_id, watch_percentage, actual_duration_sec, rank_in_group, created_at)
    VALUES (p_assignment_id, p_job_id, v_validated_watch_pct, v_validated_duration, v_rank, NOW())
    RETURNING id INTO v_log_id;

    salary_log_id := v_log_id;
    rank_in_group := v_rank;
    was_created := TRUE;
    RETURN NEXT;
END;
$$;

-- Celery Task 생성
CREATE OR REPLACE FUNCTION create_task(
    p_task_name VARCHAR,
    p_celery_task_id VARCHAR DEFAULT NULL,
    p_device_id UUID DEFAULT NULL,
    p_pc_id UUID DEFAULT NULL,
    p_queue_name VARCHAR DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_task_id UUID;
BEGIN
    INSERT INTO tasks (task_name, celery_task_id, device_id, pc_id, queue_name, payload, status)
    VALUES (p_task_name, p_celery_task_id, p_device_id, p_pc_id, p_queue_name, p_payload, 'pending')
    RETURNING id INTO v_task_id;
    RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;

-- Celery Task 상태 업데이트
CREATE OR REPLACE FUNCTION update_task_status(
    p_task_id UUID,
    p_status task_status,
    p_result JSONB DEFAULT NULL,
    p_error TEXT DEFAULT NULL,
    p_progress INT DEFAULT NULL,
    p_progress_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE tasks SET
        status = p_status,
        result = COALESCE(p_result, result),
        error = COALESCE(p_error, error),
        progress = COALESCE(p_progress, progress),
        progress_message = COALESCE(p_progress_message, progress_message),
        started_at = CASE
            WHEN p_status = 'running' AND started_at IS NULL THEN NOW()
            ELSE started_at
        END,
        completed_at = CASE
            WHEN p_status IN ('success', 'failed', 'cancelled') THEN NOW()
            ELSE completed_at
        END
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- Celery Task 재시도
CREATE OR REPLACE FUNCTION increment_task_retry(p_task_id UUID)
RETURNS INT AS $$
DECLARE
    v_retries INT;
BEGIN
    UPDATE tasks SET retries = retries + 1, status = 'retrying'
    WHERE id = p_task_id
    RETURNING retries INTO v_retries;
    RETURN v_retries;
END;
$$ LANGUAGE plpgsql;

-- 오래된 Task 정리
CREATE OR REPLACE FUNCTION cleanup_old_tasks(p_days INT DEFAULT 30)
RETURNS INT AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM tasks
    WHERE created_at < NOW() - (p_days || ' days')::INTERVAL
      AND status IN ('success', 'failed', 'cancelled');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- 영상 완료 카운트 증가
CREATE OR REPLACE FUNCTION increment_video_views(p_video_id TEXT, p_success BOOLEAN DEFAULT true)
RETURNS void AS $$
BEGIN
    IF p_success THEN
        UPDATE videos SET
            completed_views = completed_views + 1,
            status = CASE WHEN completed_views + 1 >= target_views THEN 'completed' ELSE status END
        WHERE id = p_video_id;
    ELSE
        UPDATE videos SET failed_views = failed_views + 1 WHERE id = p_video_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 일일 통계 업데이트
CREATE OR REPLACE FUNCTION update_daily_stats(
    p_date DATE,
    p_completed INT DEFAULT 0,
    p_failed INT DEFAULT 0,
    p_watch_time INT DEFAULT 0,
    p_node_id TEXT DEFAULT NULL,
    p_video_id TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_hour TEXT;
BEGIN
    v_hour := EXTRACT(HOUR FROM NOW())::TEXT;

    INSERT INTO daily_stats (date, total_completed, total_failed, total_watch_time_sec)
    VALUES (p_date, p_completed, p_failed, p_watch_time)
    ON CONFLICT (date) DO UPDATE SET
        total_completed = daily_stats.total_completed + p_completed,
        total_failed = daily_stats.total_failed + p_failed,
        total_watch_time_sec = daily_stats.total_watch_time_sec + p_watch_time,
        total_executions = daily_stats.total_executions + p_completed + p_failed,
        success_rate = CASE
            WHEN (daily_stats.total_completed + p_completed + daily_stats.total_failed + p_failed) > 0
            THEN ROUND((daily_stats.total_completed + p_completed)::DECIMAL /
                 (daily_stats.total_completed + p_completed + daily_stats.total_failed + p_failed) * 100, 2)
            ELSE 0
        END,
        by_hour = jsonb_set(
            COALESCE(daily_stats.by_hour, '{}'::JSONB),
            ARRAY[v_hour],
            to_jsonb(COALESCE((daily_stats.by_hour->>v_hour)::INT, 0) + p_completed)
        ),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 활성 영상 목록
CREATE OR REPLACE FUNCTION get_active_videos(p_limit INT DEFAULT 100)
RETURNS TABLE (
    id TEXT, title TEXT, channel_name TEXT, target_views INT,
    completed_views INT, remaining_views INT, priority TEXT, watch_duration_sec INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT v.id, v.title, v.channel_name, v.target_views, v.completed_views,
        (v.target_views - v.completed_views), v.priority, v.watch_duration_sec
    FROM videos v WHERE v.status = 'active'
    ORDER BY CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
        (v.target_views - v.completed_views) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 랜덤 키워드
CREATE OR REPLACE FUNCTION get_random_keywords(p_count INT DEFAULT 5)
RETURNS TABLE(keyword TEXT, category TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT k.keyword, k.category FROM keywords k WHERE k.is_active = true
    ORDER BY random() LIMIT p_count;
END;
$$ LANGUAGE plpgsql;

-- 키워드 사용 기록
CREATE OR REPLACE FUNCTION mark_keyword_used(p_keyword TEXT)
RETURNS void AS $$
BEGIN
    UPDATE keywords SET used_count = used_count + 1, last_collected_at = NOW(), updated_at = NOW()
    WHERE keyword = p_keyword;
END;
$$ LANGUAGE plpgsql;

-- 제목에서 키워드 추출
CREATE OR REPLACE FUNCTION extract_keyword_from_title(p_title TEXT)
RETURNS TEXT AS $$
DECLARE v_keyword TEXT;
BEGIN
    IF p_title IS NULL THEN RETURN NULL; END IF;
    v_keyword := regexp_replace(p_title, '#[^\s]+', '', 'g');
    v_keyword := regexp_replace(v_keyword, '\[[^\]]*\]', '', 'g');
    v_keyword := regexp_replace(v_keyword, '\([^\)]*\)', '', 'g');
    v_keyword := trim(regexp_replace(v_keyword, '\s+', ' ', 'g'));
    IF length(v_keyword) < 3 THEN RETURN NULL; END IF;
    RETURN v_keyword;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 해시태그 제거 (search_keyword용)
CREATE OR REPLACE FUNCTION extract_search_keyword(p_title TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_title IS NULL THEN RETURN NULL; END IF;
    RETURN TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p_title, '#[^\s]+', '', 'g'), '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 영상 추가 시 키워드 자동 등록
CREATE OR REPLACE FUNCTION auto_create_keyword_from_video()
RETURNS TRIGGER AS $$
DECLARE v_keyword TEXT;
BEGIN
    v_keyword := extract_keyword_from_title(NEW.title);
    IF v_keyword IS NOT NULL AND length(v_keyword) > 0 THEN
        INSERT INTO keywords (keyword, category, metadata)
        VALUES (v_keyword, 'auto', jsonb_build_object('source_video_id', NEW.id, 'original_title', NEW.title))
        ON CONFLICT (keyword) DO UPDATE SET
            discovered_count = keywords.discovered_count + 1, updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- search_keyword 자동 채우기
CREATE OR REPLACE FUNCTION auto_fill_search_keyword()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.search_keyword IS NULL OR TRIM(NEW.search_keyword) = '' THEN
        NEW.search_keyword := extract_search_keyword(NEW.title);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Onboarding 상태 upsert
CREATE OR REPLACE FUNCTION upsert_onboarding_state(
    p_device_id TEXT, p_node_id TEXT,
    p_status onboarding_status DEFAULT 'not_started',
    p_current_step TEXT DEFAULT NULL,
    p_completed_steps TEXT[] DEFAULT '{}',
    p_error_message TEXT DEFAULT NULL,
    p_config JSONB DEFAULT '{}',
    p_step_results JSONB DEFAULT '{}'
) RETURNS device_onboarding_states AS $$
DECLARE result device_onboarding_states;
BEGIN
    INSERT INTO device_onboarding_states (
        device_id, node_id, status, current_step,
        completed_steps, error_message, config, step_results, started_at
    ) VALUES (
        p_device_id, p_node_id, p_status, p_current_step,
        p_completed_steps, p_error_message, p_config, p_step_results,
        CASE WHEN p_status = 'in_progress' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (device_id)
    DO UPDATE SET
        node_id = EXCLUDED.node_id, status = EXCLUDED.status,
        current_step = EXCLUDED.current_step, completed_steps = EXCLUDED.completed_steps,
        error_message = EXCLUDED.error_message,
        config = COALESCE(EXCLUDED.config, device_onboarding_states.config),
        step_results = COALESCE(EXCLUDED.step_results, device_onboarding_states.step_results),
        started_at = CASE
            WHEN EXCLUDED.status = 'in_progress' AND device_onboarding_states.started_at IS NULL THEN NOW()
            ELSE device_onboarding_states.started_at
        END,
        completed_at = CASE
            WHEN EXCLUDED.status IN ('completed', 'failed') THEN NOW()
            ELSE NULL
        END
    RETURNING * INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Onboarding 요약
CREATE OR REPLACE FUNCTION get_onboarding_summary(p_node_id TEXT DEFAULT NULL)
RETURNS TABLE (total BIGINT, not_started BIGINT, in_progress BIGINT, completed BIGINT, failed BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE status = 'not_started')::BIGINT,
        COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT,
        COUNT(*) FILTER (WHERE status = 'failed')::BIGINT
    FROM device_onboarding_states
    WHERE p_node_id IS NULL OR node_id = p_node_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Script 버전 증가
CREATE OR REPLACE FUNCTION increment_script_version(p_script_id UUID)
RETURNS TABLE(version INTEGER) AS $$
BEGIN
    RETURN QUERY
    UPDATE scripts SET version = scripts.version + 1, updated_at = NOW()
    WHERE id = p_script_id RETURNING scripts.version;
END;
$$ LANGUAGE plpgsql;

-- Script 실행 카운트 증가
CREATE OR REPLACE FUNCTION increment_script_exec_count(p_execution_id UUID, p_count_type TEXT)
RETURNS VOID AS $$
BEGIN
    IF p_count_type = 'completed' THEN
        UPDATE script_executions SET completed_devices = completed_devices + 1, updated_at = NOW()
        WHERE id = p_execution_id;
    ELSIF p_count_type = 'failed' THEN
        UPDATE script_executions SET failed_devices = failed_devices + 1, updated_at = NOW()
        WHERE id = p_execution_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- cron 다음 실행 시간
CREATE OR REPLACE FUNCTION calculate_next_run(cron_expr TEXT, from_time TIMESTAMPTZ DEFAULT NOW())
RETURNS TIMESTAMPTZ AS $$
DECLARE
    parts TEXT[];
    minute_part TEXT;
    hour_part TEXT;
    next_time TIMESTAMPTZ;
BEGIN
    parts := string_to_array(cron_expr, ' ');
    IF array_length(parts, 1) IS NULL OR array_length(parts, 1) < 5 THEN
        RETURN NULL;
    END IF;

    minute_part := parts[1];
    hour_part := parts[2];

    IF parts[3] = '*' AND parts[4] = '*' AND parts[5] = '*' THEN
        IF minute_part = '*' THEN minute_part := '0'; END IF;
        IF hour_part = '*' THEN hour_part := '0'; END IF;
        next_time := DATE_TRUNC('day', from_time) +
                     (hour_part::INT || ' hours')::INTERVAL +
                     (minute_part::INT || ' minutes')::INTERVAL;
        IF next_time <= from_time THEN
            next_time := next_time + INTERVAL '1 day';
        END IF;
        RETURN next_time;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. 트리거
-- =============================================

-- PCs
DROP TRIGGER IF EXISTS trg_auto_pc_number ON pcs;
CREATE TRIGGER trg_auto_pc_number
    BEFORE INSERT ON pcs
    FOR EACH ROW EXECUTE FUNCTION auto_assign_pc_number();

DROP TRIGGER IF EXISTS pcs_updated_at ON pcs;
CREATE TRIGGER pcs_updated_at
    BEFORE UPDATE ON pcs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Devices
DROP TRIGGER IF EXISTS trg_compute_management_code ON devices;
CREATE TRIGGER trg_compute_management_code
    BEFORE INSERT OR UPDATE OF pc_id, device_number ON devices
    FOR EACH ROW EXECUTE FUNCTION compute_management_code();

DROP TRIGGER IF EXISTS devices_updated_at ON devices;
CREATE TRIGGER devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Device States
DROP TRIGGER IF EXISTS device_states_updated_at ON device_states;
CREATE TRIGGER device_states_updated_at
    BEFORE UPDATE ON device_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Jobs
DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Monitored Channels
DROP TRIGGER IF EXISTS update_monitored_channels_updated_at ON monitored_channels;
CREATE TRIGGER update_monitored_channels_updated_at
    BEFORE UPDATE ON monitored_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Workflows
DROP TRIGGER IF EXISTS workflows_updated_at ON workflows;
CREATE TRIGGER workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Workflow Executions
DROP TRIGGER IF EXISTS workflow_executions_updated_at ON workflow_executions;
CREATE TRIGGER workflow_executions_updated_at
    BEFORE UPDATE ON workflow_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Settings
DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tasks (Celery)
DROP TRIGGER IF EXISTS tasks_updated ON tasks;
CREATE TRIGGER tasks_updated
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_task_timestamp();

-- Videos
DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS video_auto_keyword ON videos;
CREATE TRIGGER video_auto_keyword
    AFTER INSERT ON videos
    FOR EACH ROW EXECUTE FUNCTION auto_create_keyword_from_video();

DROP TRIGGER IF EXISTS trigger_auto_search_keyword ON videos;
CREATE TRIGGER trigger_auto_search_keyword
    BEFORE INSERT OR UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION auto_fill_search_keyword();

-- Channels
DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Keywords
DROP TRIGGER IF EXISTS update_keywords_updated_at ON keywords;
CREATE TRIGGER update_keywords_updated_at
    BEFORE UPDATE ON keywords
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Schedules
DROP TRIGGER IF EXISTS update_schedules_updated_at ON schedules;
CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Daily Stats
DROP TRIGGER IF EXISTS update_daily_stats_updated_at ON daily_stats;
CREATE TRIGGER update_daily_stats_updated_at
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Device Issues
DROP TRIGGER IF EXISTS update_device_issues_updated_at ON device_issues;
CREATE TRIGGER update_device_issues_updated_at
    BEFORE UPDATE ON device_issues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Device Onboarding
DROP TRIGGER IF EXISTS trg_onboarding_updated_at ON device_onboarding_states;
CREATE TRIGGER trg_onboarding_updated_at
    BEFORE UPDATE ON device_onboarding_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Video Executions: execution_date 자동 채우기
CREATE OR REPLACE FUNCTION auto_fill_execution_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.execution_date := DATE(NEW.created_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_execution_date ON video_executions;
CREATE TRIGGER trg_auto_execution_date
    BEFORE INSERT ON video_executions
    FOR EACH ROW EXECUTE FUNCTION auto_fill_execution_date();

-- Scripts
DROP TRIGGER IF EXISTS set_updated_at_scripts ON scripts;
CREATE TRIGGER set_updated_at_scripts
    BEFORE UPDATE ON scripts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_script_executions ON script_executions;
CREATE TRIGGER set_updated_at_script_executions
    BEFORE UPDATE ON script_executions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================
-- 6. 뷰
-- =============================================

-- 시스템 개요
CREATE OR REPLACE VIEW system_overview AS
SELECT
    (SELECT COUNT(*) FROM pcs WHERE status = 'online') AS online_pcs,
    (SELECT COUNT(*) FROM pcs) AS total_pcs,
    (SELECT COUNT(*) FROM devices) AS total_devices,
    (SELECT COUNT(*) FROM devices WHERE state = 'IDLE') AS idle_devices,
    (SELECT COUNT(*) FROM devices WHERE state = 'RUNNING') AS running_devices,
    (SELECT COUNT(*) FROM devices WHERE state IN ('ERROR', 'QUARANTINE')) AS error_devices,
    (SELECT COUNT(*) FROM workflow_executions WHERE status = 'running') AS running_workflows,
    (SELECT COUNT(*) FROM alerts WHERE acknowledged = false) AS unacknowledged_alerts;

-- 디바이스 전체 현황
CREATE OR REPLACE VIEW device_overview AS
SELECT
    d.id,
    d.management_code,
    p.pc_number,
    d.device_number,
    COALESCE(d.serial_number, 'N/A') as serial,
    COALESCE(d.ip_address::TEXT, 'N/A') as ip,
    d.connection_type,
    d.state as device_status,
    p.status as pc_status,
    d.battery_level,
    d.last_seen as last_heartbeat,
    d.error_count,
    d.model,
    d.android_version
FROM devices d
LEFT JOIN pcs p ON d.pc_id = p.id
ORDER BY p.pc_number NULLS LAST, d.device_number;

-- PC 요약
CREATE OR REPLACE VIEW pc_summary AS
SELECT
    p.id, p.pc_number, p.ip_address, p.hostname, p.label, p.location,
    p.max_devices, p.status, p.last_heartbeat,
    COUNT(d.id) as device_count,
    COUNT(d.id) FILTER (WHERE d.state IN ('IDLE', 'online')) as online_count,
    COUNT(d.id) FILTER (WHERE d.state IN ('ERROR', 'error')) as error_count,
    AVG(d.battery_level) FILTER (WHERE d.battery_level IS NOT NULL) as avg_battery
FROM pcs p
LEFT JOIN devices d ON d.pc_id = p.id
GROUP BY p.id
ORDER BY p.pc_number;

-- PC별 디바이스 현황
CREATE OR REPLACE VIEW pc_device_summary AS
SELECT
    p.id AS pc_id, p.pc_number, p.label, p.location, p.status AS pc_status,
    p.max_devices,
    COUNT(d.id) AS device_count,
    COUNT(d.id) FILTER (WHERE d.state = 'IDLE') AS idle_count,
    COUNT(d.id) FILTER (WHERE d.state = 'RUNNING') AS running_count,
    COUNT(d.id) FILTER (WHERE d.state IN ('ERROR', 'QUARANTINE')) AS error_count,
    COUNT(d.id) FILTER (WHERE d.state = 'DISCONNECTED') AS disconnected_count
FROM pcs p
LEFT JOIN devices d ON d.pc_id = p.id
GROUP BY p.id, p.pc_number, p.label, p.location, p.status, p.max_devices
ORDER BY p.pc_number;

-- 워크플로우 실행 요약
CREATE OR REPLACE VIEW workflow_execution_summary AS
SELECT
    we.id, we.execution_id, we.workflow_id, w.name AS workflow_name,
    we.status, we.total_devices, we.completed_devices, we.failed_devices,
    (we.total_devices - we.completed_devices - we.failed_devices) AS running_devices,
    CASE WHEN we.total_devices = 0 THEN 0
         ELSE ROUND((we.completed_devices + we.failed_devices)::NUMERIC / we.total_devices * 100) END AS progress_percent,
    we.params, we.error_message, we.started_at, we.completed_at, we.created_at,
    EXTRACT(EPOCH FROM (COALESCE(we.completed_at, NOW()) - we.started_at)) AS duration_seconds
FROM workflow_executions we
LEFT JOIN workflows w ON we.workflow_id = w.id;

-- Celery 최근 작업
CREATE OR REPLACE VIEW recent_tasks AS
SELECT
    t.id, t.celery_task_id, t.task_name, t.queue_name, t.status,
    t.progress, t.progress_message, t.retries, t.error,
    t.created_at, t.started_at, t.completed_at, t.duration_seconds,
    d.serial_number as device_serial,
    get_management_code(d.pc_id, d.device_number) as device_code,
    p.pc_number
FROM tasks t
LEFT JOIN devices d ON t.device_id = d.id
LEFT JOIN pcs p ON t.pc_id = p.id
ORDER BY t.created_at DESC;

-- Celery 작업 통계
CREATE OR REPLACE VIEW task_stats AS
SELECT
    task_name, queue_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE status = 'success') as success_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE status = 'running') as running_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration,
    MAX(created_at) as last_task_at
FROM tasks
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY task_name, queue_name
ORDER BY task_name, queue_name;

-- 콘텐츠 현황
CREATE OR REPLACE VIEW content_overview AS
SELECT
    (SELECT COUNT(*) FROM videos WHERE status = 'active') AS active_videos,
    (SELECT COUNT(*) FROM videos WHERE status = 'paused') AS paused_videos,
    (SELECT COUNT(*) FROM videos WHERE status = 'completed') AS completed_videos,
    (SELECT SUM(target_views - completed_views) FROM videos WHERE status = 'active') AS remaining_views,
    (SELECT COUNT(*) FROM channels WHERE status = 'active') AS active_channels,
    (SELECT COUNT(*) FROM channels WHERE auto_collect = true) AS auto_collect_channels,
    (SELECT COUNT(*) FROM keywords WHERE is_active = true) AS active_keywords,
    (SELECT COUNT(*) FROM schedules WHERE is_active = true) AS active_schedules;

-- 대시보드 요약
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
    (SELECT COUNT(*) FROM videos WHERE status = 'active') as active_videos,
    (SELECT COUNT(*) FROM videos WHERE status = 'completed') as completed_videos,
    (SELECT SUM(completed_views) FROM videos) as total_views,
    (SELECT COUNT(*) FROM keywords WHERE is_active = true) as active_keywords,
    (SELECT COUNT(*) FROM schedules WHERE is_active = true) as active_schedules,
    (SELECT COUNT(*) FROM pcs WHERE status = 'online') as online_pcs,
    (SELECT COUNT(*) FROM devices WHERE state = 'IDLE') as idle_devices,
    (SELECT COUNT(*) FROM devices WHERE state = 'RUNNING') as running_devices,
    (SELECT COUNT(*) FROM devices WHERE state IN ('ERROR', 'QUARANTINE')) as problem_devices,
    (SELECT total_completed FROM daily_stats WHERE date = CURRENT_DATE) as today_completed,
    (SELECT total_failed FROM daily_stats WHERE date = CURRENT_DATE) as today_failed;

-- 오늘 통계
CREATE OR REPLACE VIEW today_stats AS
SELECT
    COALESCE(ds.total_completed, 0) AS completed,
    COALESCE(ds.total_failed, 0) AS failed,
    COALESCE(ds.total_executions, 0) AS total,
    COALESCE(ds.success_rate, 0) AS success_rate,
    COALESCE(ds.total_watch_time_sec, 0) AS watch_time_sec,
    COALESCE(ds.by_hour, '{}'::JSONB) AS by_hour
FROM daily_stats ds
WHERE ds.date = CURRENT_DATE;

-- =============================================
-- 7. RLS (Row Level Security)
-- =============================================

ALTER TABLE pcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_device_results ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------
-- Service Role 전체 접근 정책
-- -----------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'pcs', 'devices', 'device_states', 'jobs', 'job_assignments',
        'monitored_channels', 'workflows', 'workflow_executions',
        'execution_logs', 'settings', 'alerts', 'videos', 'channels',
        'keywords', 'schedules', 'daily_stats', 'video_executions',
        'tasks', 'system_logs', 'device_issues', 'device_onboarding_states',
        'scripts', 'script_executions', 'script_device_results'
    ])
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS "Service role full access on %s" ON %s;
             CREATE POLICY "Service role full access on %s" ON %s FOR ALL USING (auth.role() = ''service_role'');',
            t, t, t, t
        );
    END LOOP;
END $$;

-- -----------------------------------------
-- Public/Authenticated 읽기 전용 정책
-- -----------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'pcs', 'devices', 'device_states', 'jobs', 'job_assignments',
        'monitored_channels', 'workflows', 'workflow_executions',
        'execution_logs', 'alerts', 'videos', 'channels',
        'keywords', 'schedules', 'daily_stats', 'video_executions',
        'tasks', 'system_logs', 'device_issues', 'device_onboarding_states',
        'scripts', 'script_executions', 'script_device_results'
    ])
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS "Public read %s" ON %s;
             CREATE POLICY "Public read %s" ON %s FOR SELECT USING (true);',
            t, t, t, t
        );
    END LOOP;
END $$;

-- Settings: 시크릿 제외 읽기
DROP POLICY IF EXISTS "Public read settings" ON settings;
CREATE POLICY "Public read settings" ON settings FOR SELECT USING (key NOT LIKE 'secret_%');

-- Salary Logs: 특수 정책 (직접 INSERT 차단)
DROP POLICY IF EXISTS "Public read salary_logs" ON salary_logs;
CREATE POLICY "Public read salary_logs" ON salary_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Deny direct client inserts on salary_logs" ON salary_logs;
CREATE POLICY "Deny direct client inserts on salary_logs" ON salary_logs FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Deny updates on salary_logs" ON salary_logs;
CREATE POLICY "Deny updates on salary_logs" ON salary_logs FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Deny deletes on salary_logs" ON salary_logs;
CREATE POLICY "Deny deletes on salary_logs" ON salary_logs FOR DELETE USING (false);

-- =============================================
-- 8. 권한 부여
-- =============================================

-- 테이블 권한
GRANT SELECT, INSERT, UPDATE, DELETE ON pcs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;

-- 뷰 권한
GRANT SELECT ON device_overview TO anon, authenticated;
GRANT SELECT ON pc_summary TO anon, authenticated;
GRANT SELECT ON pc_device_summary TO anon, authenticated;
GRANT SELECT ON dashboard_summary TO anon, authenticated;
GRANT SELECT ON content_overview TO anon, authenticated;
GRANT SELECT ON today_stats TO anon, authenticated;
GRANT SELECT ON recent_tasks TO authenticated;
GRANT SELECT ON task_stats TO authenticated;

-- 함수 권한
GRANT EXECUTE ON FUNCTION generate_pc_number() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_device_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_management_code(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_task(VARCHAR, VARCHAR, UUID, UUID, VARCHAR, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_task_status(UUID, task_status, JSONB, TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_task_retry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_tasks(INT) TO authenticated;

-- =============================================
-- 9. Supabase Realtime 활성화
-- =============================================

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_states;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE workflow_executions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE devices;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE job_assignments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE monitored_channels;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE videos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_stats;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_executions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE pcs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE system_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_issues;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================
-- 10. 초기 데이터
-- =============================================

-- 시스템 설정
INSERT INTO settings (key, value, description) VALUES
    ('max_concurrent_per_node', '20', '노드당 최대 동시 실행 워크플로우 수'),
    ('device_heartbeat_timeout', '30000', '디바이스 하트비트 타임아웃 (ms)'),
    ('workflow_default_timeout', '300000', '워크플로우 기본 타임아웃 (ms)'),
    ('error_threshold_quarantine', '3', '격리 전환 에러 횟수 임계값'),
    ('auto_recovery_enabled', 'true', '자동 복구 활성화 여부'),
    ('metrics_retention_days', '30', '메트릭 보관 기간 (일)')
ON CONFLICT (key) DO NOTHING;

-- 기본 워크플로우
INSERT INTO workflows (id, name, version, description, steps, params_schema, timeout_ms, category, tags) VALUES
(
    'youtube_watch', '유튜브 영상 시청', 2,
    'YouTube 앱에서 키워드 검색 후 첫 번째 영상 시청',
    '[
        {"id": "open_app", "action": "appium", "script": "launch(''com.google.android.youtube'')", "timeout": 10000},
        {"id": "search", "action": "appium", "script": "search(''{{keyword}}'')", "timeout": 5000},
        {"id": "play_video", "action": "appium", "script": "click_first_result()", "timeout": 5000},
        {"id": "watch_duration", "action": "wait", "params": {"duration": "{{duration}}"}, "timeout": 600000},
        {"id": "report", "action": "system", "script": "report_completion()", "timeout": 3000}
    ]'::jsonb,
    '{"keyword": {"type": "string", "required": true}, "duration": {"type": "number", "default": 60}}'::jsonb,
    300000, 'youtube', ARRAY['youtube', 'video', 'watch']
),
(
    'youtube_subscribe', '유튜브 채널 구독', 1,
    'YouTube에서 채널 검색 후 구독',
    '[
        {"id": "open_app", "action": "appium", "script": "launch(''com.google.android.youtube'')", "timeout": 10000},
        {"id": "search_channel", "action": "appium", "script": "search(''{{channel_name}}'')", "timeout": 8000},
        {"id": "select_channel", "action": "appium", "script": "click_channel_result(''{{channel_name}}'')", "timeout": 5000},
        {"id": "click_subscribe", "action": "appium", "script": "click(''subscribe_btn'')", "timeout": 5000},
        {"id": "report", "action": "system", "script": "report_completion()", "timeout": 3000}
    ]'::jsonb,
    '{"channel_name": {"type": "string", "required": true}}'::jsonb,
    120000, 'youtube', ARRAY['youtube', 'subscribe', 'channel']
),
(
    'app_install', 'Play Store 앱 설치', 1,
    'Play Store에서 앱 검색 후 설치',
    '[
        {"id": "open_playstore", "action": "appium", "script": "launch(''com.android.vending'')", "timeout": 10000},
        {"id": "search_app", "action": "appium", "script": "search(''{{app_name}}'')", "timeout": 8000},
        {"id": "select_app", "action": "appium", "script": "click_app_result(''{{app_name}}'')", "timeout": 5000},
        {"id": "click_install", "action": "appium", "script": "click(''install_btn'')", "timeout": 5000},
        {"id": "wait_install", "action": "appium", "script": "wait_for_element(''open_btn'', timeout=180s)", "timeout": 180000},
        {"id": "report", "action": "system", "script": "report_completion()", "timeout": 3000}
    ]'::jsonb,
    '{"app_name": {"type": "string", "required": true}, "package_name": {"type": "string", "required": false}}'::jsonb,
    300000, 'app', ARRAY['playstore', 'install', 'app']
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, version = EXCLUDED.version, steps = EXCLUDED.steps,
    params_schema = EXCLUDED.params_schema, timeout_ms = EXCLUDED.timeout_ms, updated_at = NOW();

-- 기본 스케줄
INSERT INTO schedules (name, description, cron_expression, schedule_type, is_active) VALUES
    ('일일 리셋', '매일 새벽 3시 디바이스 초기화', '0 3 * * *', 'maintenance', true),
    ('오전 시청', '오전 9시~12시 영상 시청', '0 9 * * *', 'video_batch', false),
    ('오후 시청', '오후 14시~18시 영상 시청', '0 14 * * *', 'video_batch', false),
    ('저녁 시청', '저녁 19시~22시 영상 시청', '0 19 * * *', 'video_batch', false)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- 11. 테이블 코멘트
-- =============================================

COMMENT ON TABLE pcs IS '미니PC 관리 테이블 - 최대 99대';
COMMENT ON TABLE devices IS '디바이스 관리 테이블 - PC당 최대 999대';
COMMENT ON TABLE jobs IS '작업 공고 테이블';
COMMENT ON TABLE job_assignments IS '작업 할당 테이블';
COMMENT ON TABLE salary_logs IS '급여 로그 테이블';
COMMENT ON TABLE monitored_channels IS '채널 모니터링 테이블';
COMMENT ON TABLE device_states IS '디바이스 실시간 상태';
COMMENT ON TABLE workflows IS '워크플로우 정의 테이블';
COMMENT ON TABLE workflow_executions IS '워크플로우 실행 상태 테이블';
COMMENT ON TABLE execution_logs IS '실행 로그 테이블';
COMMENT ON TABLE settings IS '시스템 설정 테이블';
COMMENT ON TABLE alerts IS '알림 기록 테이블';
COMMENT ON TABLE videos IS '시청할 YouTube 영상 목록';
COMMENT ON TABLE channels IS 'YouTube 채널 관리';
COMMENT ON TABLE keywords IS '검색 키워드 관리';
COMMENT ON TABLE schedules IS '자동 실행 스케줄';
COMMENT ON TABLE daily_stats IS '일일 통계';
COMMENT ON TABLE video_executions IS '영상별 실행 기록';
COMMENT ON TABLE tasks IS 'Celery 작업 이력 관리';
COMMENT ON TABLE system_logs IS '시스템 로그 (API, Worker, Device 등)';
COMMENT ON TABLE device_issues IS '디바이스 이슈 추적';
COMMENT ON TABLE device_onboarding_states IS '디바이스 온보딩 진행 상태';
COMMENT ON TABLE scripts IS '실행 가능한 스크립트 정의';
COMMENT ON TABLE script_executions IS '스크립트 실행 인스턴스';
COMMENT ON TABLE script_device_results IS '디바이스별 스크립트 실행 결과';
COMMENT ON COLUMN devices.management_code IS '관리번호 (PC01-001 형태) - 트리거로 자동 계산';

-- =============================================
-- 완료
-- =============================================
DO $$
BEGIN
    RAISE NOTICE 'DoAi.Me Consolidated Schema - 설치 완료';
    RAISE NOTICE '테이블 25개, 함수 30+개, 뷰 10개, RLS 정책 전체 적용';
END $$;
