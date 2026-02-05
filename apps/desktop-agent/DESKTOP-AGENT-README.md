# Desktop Agent

Desktop agent for controlling Android devices via DOAI platform.

## Requirements

- **Redis**: This application requires a Redis server to be running for job queue management. Make sure Redis is installed and running before starting the agent.

  - Install Redis: https://redis.io/download
  - Default connection: `localhost:6379` (can be configured via environment variables)

## Development

```bash
npm install
npm run build
npm start
```

## Building

See `electron-builder.yml` for build configuration.

```bash
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```
