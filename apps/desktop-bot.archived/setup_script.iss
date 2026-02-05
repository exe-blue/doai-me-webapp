; =============================================
; [DOAI Worker Installer Configuration]
; Inno Setup Script
; =============================================

[Setup]
; Application Metadata
AppName=DOAI Worker
AppVersion=1.0
AppPublisher=DOAI Automation
DefaultDirName={autopf}\DOAI Worker
DefaultGroupName=DOAI Worker
UninstallDisplayIcon={app}\doai-worker.exe

; Output Settings
OutputDir=Output
OutputBaseFilename=DOAI_Worker_Setup_v1.0
Compression=lzma2
SolidCompression=yes

; Privileges
PrivilegesRequired=lowest

[Files]
; 1. The Main Executable (Source relative to this script)
Source: "doai-worker.exe"; DestDir: "{app}"; Flags: ignoreversion

; 2. Configuration Files (Copy only if not exists to preserve user settings)
Source: ".env.example"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "device-map.json"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall

; 3. Resources (ADB & Scripts)
Source: "platform-tools\*"; DestDir: "{app}\platform-tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Shortcuts
Name: "{group}\DOAI Worker"; Filename: "{app}\doai-worker.exe"
Name: "{group}\Uninstall DOAI Worker"; Filename: "{uninstallexe}"
Name: "{autodesktop}\DOAI Worker"; Filename: "{app}\doai-worker.exe"

[Run]
; Post-install Actions
; 1. Open .env for editing (Blocking)
Filename: "notepad.exe"; Parameters: "{app}\.env"; Description: "설정 파일(.env) 열기 - PC 코드 및 API 키 입력"; Flags: postinstall shellexec waituntilterminated
; 2. Launch the worker (Optional)
Filename: "{app}\doai-worker.exe"; Description: "DOAI Worker 즉시 실행"; Flags: postinstall nowait unchecked
