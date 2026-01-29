; =============================================
; DoAi.Me Worker Installer Script
; Inno Setup Compiler 사용
; =============================================

#define MyAppName "DoAi Worker"
#define MyAppVersion "5.1.0"
#define MyAppPublisher "DoAi.Me"
#define MyAppURL "https://doai.me"
#define MyAppExeName "DoaiWorker.exe"

[Setup]
; 앱 식별자 (GUID 생성 필요)
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE.txt
OutputDir=..\dist
OutputBaseFilename=DoaiWorker_Setup_{#MyAppVersion}
SetupIconFile=..\assets\icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startup"; Description: "Windows 시작 시 자동 실행"; GroupDescription: "추가 옵션:"

[Files]
; 메인 실행 파일
Source: "..\dist\DoaiWorker.exe"; DestDir: "{app}"; Flags: ignoreversion

; 환경 설정 템플릿
Source: "..\env.example"; DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion

; ADB (선택사항: 번들에 포함할 경우)
; Source: "..\adb\*"; DestDir: "{app}\adb"; Flags: ignoreversion recursesubdirs

; README
Source: "..\README-WORKER.md"; DestDir: "{app}"; DestName: "README.txt"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; 시작 프로그램 등록 (선택 시)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
; 설치 완료 후 실행 여부
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// 설치 전 .env 파일 생성 안내
procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvFile: string;
begin
  if CurStep = ssPostInstall then
  begin
    EnvFile := ExpandConstant('{app}\.env');
    if not FileExists(EnvFile) then
    begin
      MsgBox('설치 완료!' + #13#10 + #13#10 + 
             '실행 전에 .env.example을 .env로 복사하고' + #13#10 +
             '필요한 설정 값을 입력해 주세요.' + #13#10 + #13#10 +
             '설정 위치: ' + ExpandConstant('{app}'), 
             mbInformation, MB_OK);
    end;
  end;
end;
