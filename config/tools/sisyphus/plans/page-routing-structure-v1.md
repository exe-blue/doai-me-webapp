# Next.js Page Routing Structure - DoAi.me Dashboard

## Route Map

```
/                           # Landing page (marketing)
├── /tech                   # Technology explanation
├── /why-not-bot            # Philosophy page
│
├── /dashboard              # Main dashboard (overview)
│   ├── /dashboard/nodes    # [노드 보기] Device management & control
│   ├── /dashboard/analytics# [진행 보기] Statistics & logs
│   ├── /dashboard/jobs     # [작업 관리] Job creation & management
│   └── /dashboard/settings # [설정] System configuration
│
└── /api                    # API routes
    ├── /api/device
    │   ├── /command        # POST: Send device commands
    │   ├── /screenshot     # POST: Capture screenshot
    │   └── /stream         # GET/POST: Streaming control
    ├── /api/jobs
    │   ├── /create         # POST: Create new job
    │   ├── /assign         # POST: Assign job to devices
    │   └── /[id]           # GET/PUT/DELETE: Job CRUD
    ├── /api/analytics
    │   ├── /jobs           # GET: Job-centric statistics
    │   └── /devices        # GET: Device-centric statistics
    └── /api/youtube-meta   # GET: Fetch YouTube video metadata
```

## Page Components Hierarchy

### /dashboard (Overview)
```
DashboardPage
├── StatsCards (Total devices, Active jobs, Completion rate)
├── StatusBoard (10x10 grid visualization)
├── RecentActivity (Latest job completions)
└── AlertsPanel (Errors, zombie devices)
```

### /dashboard/nodes [IMPLEMENTED]
```
NodesPage
├── StatsCards (Total, Online, Working, Offline)
├── BroadcastControl (Master/Slave selection)
├── DeviceGroups (PC-based grouping)
│   └── DeviceCard (Status indicator, serial, actions)
└── RemoteViewModal (Streaming, tap control, broadcast)
```

### /dashboard/analytics [TO IMPLEMENT]
```
AnalyticsPage
├── ViewToggle (Job-centric / Device-centric)
├── DateRangeFilter (Today, 7 days, 30 days, Custom)
├── JobAnalyticsTable (View A)
│   ├── Video Title
│   ├── Assigned Devices Count
│   ├── Completed Devices Count
│   ├── In-Progress Devices List
│   └── Average Watch Time
└── DeviceAnalyticsTable (View B)
    ├── Device Serial Number
    ├── Current Status
    ├── Today's Completed Jobs
    ├── Recent Error Log
    └── Next Scheduled Job Time
```

### /dashboard/jobs [FUTURE]
```
JobsPage
├── CreateJobForm
│   ├── Video URL input
│   ├── Duration settings
│   ├── Probability sliders (like, comment, playlist)
│   └── Target group selection
├── ActiveJobsList
└── JobHistoryTable
```

### /dashboard/settings [FUTURE]
```
SettingsPage
├── PCWorkerConfig (Connection settings)
├── DeviceDefaultsConfig (Resolution, density)
├── NotificationSettings (Alerts, webhooks)
└── APIKeysManagement
```

## Layout Structure

```
app/
├── layout.tsx              # Root layout (ThemeProvider, Toaster)
├── page.tsx                # Landing page
├── dashboard/
│   ├── layout.tsx          # Dashboard layout (Sidebar, Header)
│   ├── page.tsx            # Dashboard overview
│   ├── nodes/
│   │   └── page.tsx        # Node management [DONE]
│   ├── analytics/
│   │   └── page.tsx        # Statistics [TO DO]
│   ├── jobs/
│   │   └── page.tsx        # Job management [FUTURE]
│   └── settings/
│       └── page.tsx        # Settings [FUTURE]
└── api/
    └── device/
        ├── command/route.ts    # [DONE]
        ├── screenshot/route.ts # [DONE]
        └── stream/route.ts     # [DONE]
```

## Navigation Component

```typescript
const dashboardNavItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/dashboard/nodes', label: '노드 보기', icon: Monitor },
  { href: '/dashboard/analytics', label: '진행 보기', icon: BarChart3 },
  { href: '/dashboard/jobs', label: '작업 관리', icon: ListTodo },
  { href: '/dashboard/settings', label: '설정', icon: Settings },
];
```

## Data Flow

```
                    ┌─────────────────┐
                    │   Supabase DB   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  /nodes  │  │/analytics│  │  /jobs   │
        │  (CRUD)  │  │  (READ)  │  │  (CRUD)  │
        └──────────┘  └──────────┘  └──────────┘
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Realtime │  │  Polling │  │ Realtime │
        │ Updates  │  │  + Cache │  │ Updates  │
        └──────────┘  └──────────┘  └──────────┘
```

## Implementation Priority

| Page | Status | Priority |
|------|--------|----------|
| /dashboard | Partial | P1 |
| /dashboard/nodes | DONE | - |
| /dashboard/analytics | TODO | P1 |
| /dashboard/jobs | TODO | P2 |
| /dashboard/settings | TODO | P3 |
