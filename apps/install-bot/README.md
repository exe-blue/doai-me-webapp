# Install Bot Worker

App installation and management worker for the DoAi.Me platform.

## Features

- **App Installation**: Install APK files from local paths or remote URLs
- **App Uninstallation**: Remove apps with optional data retention
- **App Updates**: Update existing apps with new versions
- **Permission Management**: Automatically grant permissions after installation
- **Verification**: Verify installation success and retrieve version information

## Supported Workflows

- `app_install` - Install new applications
- `app_update` - Update existing applications
- `app_uninstall` - Uninstall applications
- `app_remove` - Remove applications (alias for uninstall)

## Installation

```bash
# Install dependencies
npm install

# Build the worker
npm run build

# Development mode
npm run dev

# Production mode
npm start
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKER_ID` | Unique worker identifier | `install-worker-1` |
| `MANAGER_URL` | Manager server WebSocket URL | `http://localhost:3001` |
| `HEARTBEAT_INTERVAL_MS` | Heartbeat interval in milliseconds | `30000` |
| `CONNECTION_TIMEOUT_MS` | Connection timeout in milliseconds | `10000` |
| `MAX_CONCURRENT_JOBS` | Maximum concurrent jobs | `5` |
| `ADB_HOST` | ADB server host | `localhost` |
| `ADB_PORT` | ADB server port | `5037` |

## Usage

### Install Job Parameters

```typescript
{
  "apkPath": "/path/to/app.apk",      // Optional: Local APK path
  "apkUrl": "https://example.com/app.apk",  // Optional: Remote APK URL
  "packageName": "com.example.app",   // Required: Package name
  "reinstall": true,                  // Optional: Allow reinstall (default: false)
  "grantPermissions": true,           // Optional: Grant permissions (default: false)
  "permissionsToGrant": [             // Optional: Specific permissions to grant
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.SYSTEM_ALERT_WINDOW"
  ]
}
```

### Uninstall Job Parameters

```typescript
{
  "packageName": "com.example.app",   // Required: Package name to uninstall
  "keepData": false                   // Optional: Keep app data (default: false)
}
```

## Job Results

### Install Result

```typescript
{
  "success": true,
  "data": {
    "packageName": "com.example.app",
    "versionName": "1.0.0",
    "versionCode": 100,
    "installedAt": 1707260000000,
    "permissionsGranted": [
      "android.permission.POST_NOTIFICATIONS"
    ]
  }
}
```

### Uninstall Result

```typescript
{
  "success": true,
  "data": {
    "packageName": "com.example.app",
    "uninstalledAt": 1707260000000,
    "dataKept": false
  }
}
```

## Architecture

```
install-bot/
├── src/
│   ├── InstallWorker.ts          # Main worker implementation
│   ├── index.ts                  # Entry point and CLI executable
│   └── handlers/
│       ├── InstallHandler.ts     # App installation handler
│       ├── UninstallHandler.ts   # App uninstallation handler
│       └── index.ts              # Handler exports
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

- `@doai/worker-core` - Core worker utilities (ADB, device management, logging)
- `@doai/worker-types` - Shared type definitions
- `socket.io-client` - WebSocket communication with manager
- `dotenv` - Environment variable management

## Error Codes

| Code | Description | Recoverable |
|------|-------------|-------------|
| `NO_HANDLER` | No handler found for workflow | No |
| `DEVICE_UNAVAILABLE` | Device not available or busy | Yes |
| `VALIDATION_FAILED` | Invalid job parameters | No |
| `INSTALL_FAILED` | Installation failed | Yes |
| `UNINSTALL_FAILED` | Uninstallation failed | Yes |
| `PACKAGE_NOT_FOUND` | Package not found on device | No |
| `EXECUTION_ERROR` | Unexpected execution error | Yes |

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Clean build artifacts
npm run clean
```

## License

MIT
