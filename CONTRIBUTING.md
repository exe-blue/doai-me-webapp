# Contributing to DoAi.Me

Thank you for your interest in contributing to DoAi.Me!

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm or npm
- Git

### SonarLint Setup (VS Code)

This project uses SonarLint for static code analysis. To set up the connected mode:

1. **Install SonarLint Extension**
   - Install the [SonarLint VS Code extension](https://marketplace.visualstudio.com/items?itemName=SonarSource.sonarlint-vscode)

2. **Add SonarLint Connection**
   - Open VS Code Settings (Ctrl/Cmd + ,)
   - Search for "SonarLint: Connected Mode Servers"
   - Add a new server connection:
     - **Connection ID**: `exe-blue`
     - **Server URL**: `https://sonarqube.exe-blue.com` (or your team's SonarQube/SonarCloud instance URL)
     - Follow the prompts to authenticate with your SonarQube/SonarCloud account

3. **Verify Connection**
   - The `.vscode/settings.json` file is already configured with:
     ```json
     {
       "sonarlint.connectedMode.project": {
         "connectionId": "exe-blue",
         "projectKey": "exe-blue_doai-me-webapp"
       }
     }
     ```
   - Ensure the project key `exe-blue_doai-me-webapp` matches the project in your SonarQube/SonarCloud instance

4. **Test the Connection**
   - Open the VS Code Command Palette (Ctrl/Cmd + Shift + P)
   - Run "SonarLint: Update all project bindings for SonarQube/SonarCloud"
   - Check the SonarLint output panel for successful connection
   - Open any source file and verify that SonarLint rules are being applied

5. **Troubleshooting**
   - If issues are not appearing, check that the connection ID matches exactly: `exe-blue`
   - Verify your authentication token has not expired
   - Ensure network access to the SonarQube/SonarCloud instance

> **Note**: The `exe-blue` connection must be accessible to all team members. Contact your team lead if you need access credentials.

## Code Style

- Follow ESLint rules configured in the project
- Use TypeScript for all new code
- Write tests for new features

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request
