using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace DoaiDeviceFarm.Client
{
    /// <summary>
    /// Windows 마우스 이벤트를 캡처하고 ADB를 통해 스마트폰으로 전송하는 관리자 클래스
    /// ConnectionManager를 사용하여 안정적인 연결 유지
    /// </summary>
    public class InputManager : IDisposable
    {
        // 상수 정의 (매직 넘버 방지)
        private const int WH_MOUSE_LL = 14;
        private const int WM_MOUSEMOVE = 0x0200;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_LBUTTONUP = 0x0202;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_RBUTTONUP = 0x0205;
        
        private const int ADB_TOUCH_DOWN = 0;
        private const int ADB_TOUCH_UP = 1;
        private const int ADB_TOUCH_MOVE = 2;
        
        private const int DEBOUNCE_MS = 16; // 약 60fps
        
        // 훅 프로시저 델리게이트 (GC 방지를 위해 필드로 유지)
        private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);
        private readonly LowLevelMouseProc _proc;
        private IntPtr _hookId = IntPtr.Zero;
        
        // 좌표 매퍼
        private readonly CoordinateMapper _mapper;
        
        // 연결 관리자 (지속 연결, 자동 재연결, 타임아웃 처리)
        private readonly ConnectionManager _connectionManager;
        
        // ADB 설정 (ConnectionManager에 위임하지만 참조 보관)
        private readonly string _adbPath;
        private readonly string _deviceSerial;
        
        // 로거
        private readonly Logger _logger;
        
        // 상태
        private bool _isCapturing;
        private bool _isDisposed;
        private DateTime _lastMoveTime = DateTime.MinValue;
        private CancellationTokenSource? _cts;
        
        // 이벤트
        public event EventHandler<TouchEventArgs>? TouchEventSent;
        public event EventHandler<string>? ErrorOccurred;
        public event EventHandler<ConnectionStateEventArgs>? ConnectionStateChanged;
        public event EventHandler<string>? DiagnosticMessage;
        
        // Win32 API
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);
        
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);
        
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
        
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
        
        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT
        {
            public int X;
            public int Y;
            public uint mouseData;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }
        
        /// <summary>
        /// InputManager 생성자
        /// </summary>
        /// <param name="mapper">좌표 매퍼</param>
        /// <param name="adbPath">ADB 실행 파일 경로</param>
        /// <param name="deviceSerial">대상 디바이스 시리얼 번호</param>
        public InputManager(CoordinateMapper mapper, string adbPath, string deviceSerial)
        {
            _mapper = mapper ?? throw new ArgumentNullException(nameof(mapper));
            _adbPath = adbPath ?? throw new ArgumentNullException(nameof(adbPath));
            _deviceSerial = deviceSerial ?? throw new ArgumentNullException(nameof(deviceSerial));
            _logger = Logger.Instance;
            
            // 델리게이트를 필드에 저장하여 GC에 의해 수집되지 않도록 함
            _proc = HookCallback;
            
            // 안전 모드 이벤트 구독
            _mapper.SafeModeEntered += OnSafeModeEntered;
            
            // ConnectionManager 초기화 (지속 연결, 자동 재연결, 타임아웃 처리)
            _connectionManager = new ConnectionManager(adbPath, deviceSerial);
            _connectionManager.ConnectionStateChanged += OnConnectionStateChanged;
            _connectionManager.DiagnosticMessage += OnDiagnosticMessage;
            
            _logger.Info($"InputManager 초기화: ADB={adbPath}, Device={deviceSerial}");
        }
        
        /// <summary>
        /// 연결 상태 변경 핸들러
        /// </summary>
        private void OnConnectionStateChanged(object? sender, ConnectionStateEventArgs e)
        {
            _logger.Info($"연결 상태 변경: {(e.IsConnected ? "연결됨" : "연결 끊김")} - {e.Reason}");
            
            if (!e.IsConnected && _isCapturing)
            {
                // 연결 끊김 시 자동 재연결은 ConnectionManager가 처리
                // UI에 알림만 전달
                ErrorOccurred?.Invoke(this, $"연결 끊김: {e.Reason}");
            }
            
            ConnectionStateChanged?.Invoke(this, e);
        }
        
        /// <summary>
        /// 진단 메시지 핸들러
        /// </summary>
        private void OnDiagnosticMessage(object? sender, string message)
        {
            DiagnosticMessage?.Invoke(this, message);
        }
        
        /// <summary>
        /// 마우스 캡처 시작
        /// </summary>
        public void StartCapture()
        {
            if (_isCapturing)
            {
                _logger.Warning("이미 캡처 중입니다.");
                return;
            }
            
            if (_mapper.IsSafeMode)
            {
                _logger.Warning("안전 모드 상태에서는 캡처를 시작할 수 없습니다.");
                return;
            }
            
            try
            {
                _cts = new CancellationTokenSource();
                
                // ConnectionManager를 통한 연결 시작 (지속 연결, 재연결 로직 포함)
                Task.Run(async () =>
                {
                    var connected = await _connectionManager.ConnectAsync(_cts.Token);
                    if (!connected)
                    {
                        _logger.Warning("초기 연결 실패, 자동 재연결 대기 중");
                    }
                });
                
                using var curProcess = Process.GetCurrentProcess();
                using var curModule = curProcess.MainModule;
                
                if (curModule == null)
                {
                    throw new InvalidOperationException("현재 프로세스의 메인 모듈을 가져올 수 없습니다.");
                }
                
                _hookId = SetWindowsHookEx(WH_MOUSE_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
                
                if (_hookId == IntPtr.Zero)
                {
                    var errorCode = Marshal.GetLastWin32Error();
                    throw new InvalidOperationException($"마우스 훅 설치 실패. Error: {errorCode}");
                }
                
                _isCapturing = true;
                _logger.Info("마우스 캡처 시작됨");
            }
            catch (Exception ex)
            {
                _logger.Error("마우스 캡처 시작 실패", ex);
                _mapper.EnterSafeMode("캡처 시작 실패");
                ErrorOccurred?.Invoke(this, ex.Message);
            }
        }
        
        /// <summary>
        /// 마우스 캡처 중지
        /// </summary>
        public void StopCapture()
        {
            if (!_isCapturing)
            {
                return;
            }
            
            try
            {
                _cts?.Cancel();
                
                if (_hookId != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(_hookId);
                    _hookId = IntPtr.Zero;
                }
                
                // ConnectionManager 연결 해제 (세션 정리)
                _connectionManager.Disconnect();
                
                _isCapturing = false;
                _logger.Info("마우스 캡처 중지됨");
            }
            catch (Exception ex)
            {
                _logger.Error("마우스 캡처 중지 실패", ex);
            }
        }
        
        /// <summary>
        /// 마우스 훅 콜백
        /// </summary>
        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && _isCapturing && !_mapper.IsSafeMode)
            {
                var hookStruct = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                var messageType = wParam.ToInt32();
                
                ProcessMouseEvent(messageType, hookStruct.X, hookStruct.Y);
            }
            
            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }
        
        /// <summary>
        /// 마우스 이벤트 처리
        /// </summary>
        private void ProcessMouseEvent(int messageType, int pcX, int pcY)
        {
            // 다중 모니터 엣지 케이스: 좌표가 미러링 대상 모니터 영역 밖이면 무시
            if (!_mapper.IsWithinMonitorBounds(pcX, pcY))
            {
                return;
            }
            
            TouchEventType? eventType = messageType switch
            {
                WM_LBUTTONDOWN => TouchEventType.Down,
                WM_LBUTTONUP => TouchEventType.Up,
                WM_MOUSEMOVE when IsDebounced() => TouchEventType.Move,
                _ => null
            };
            
            if (eventType == null)
            {
                return;
            }
            
            var phoneCoord = _mapper.MapToPhone(pcX, pcY);
            
            // 비동기로 ADB 명령 전송 (UI 스레드 블로킹 방지)
            Task.Run(() => SendTouchEvent(eventType.Value, phoneCoord.X, phoneCoord.Y));
        }
        
        /// <summary>
        /// Move 이벤트 디바운싱 (60fps 제한)
        /// </summary>
        private bool IsDebounced()
        {
            var now = DateTime.Now;
            if ((now - _lastMoveTime).TotalMilliseconds < DEBOUNCE_MS)
            {
                return false;
            }
            _lastMoveTime = now;
            return true;
        }
        
        /// <summary>
        /// ADB를 통해 터치 이벤트 전송 (ConnectionManager 사용)
        /// 
        /// 개선사항:
        /// - 지속 연결 세션 사용 (프로세스 재사용)
        /// - 자동 재연결 지원
        /// - 향상된 타임아웃 처리
        /// </summary>
        private async void SendTouchEvent(TouchEventType type, int x, int y)
        {
            if (_cts?.Token.IsCancellationRequested == true)
            {
                return;
            }
            
            try
            {
                // ConnectionManager를 통한 터치 이벤트 전송
                // 지속 연결 세션을 사용하여 성능 향상
                var success = await _connectionManager.SendTouchEventAsync(type, x, y, _cts?.Token ?? CancellationToken.None);
                
                if (success)
                {
                    _logger.Debug($"터치 이벤트 전송: {type} ({x}, {y})");
                    TouchEventSent?.Invoke(this, new TouchEventArgs(type, x, y));
                }
                else
                {
                    _logger.Warning($"터치 이벤트 전송 실패: {type} ({x}, {y}) - 연결 문제");
                    // ConnectionManager가 자동 재연결을 시도하므로 여기서는 오류만 알림
                    ErrorOccurred?.Invoke(this, $"터치 이벤트 전송 실패 - 재연결 시도 중");
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"ADB 터치 이벤트 전송 실패: {ex.Message}", ex);
                ErrorOccurred?.Invoke(this, $"터치 이벤트 전송 실패: {ex.Message}");
            }
        }
        
        /// <summary>
        /// 안전 모드 진입 이벤트 핸들러
        /// </summary>
        private void OnSafeModeEntered(object? sender, SafeModeEventArgs e)
        {
            _logger.Warning($"안전 모드로 인해 캡처 중지: {e.Reason}");
            StopCapture();
        }
        
        public void Dispose()
        {
            if (_isDisposed) return;
            
            StopCapture();
            _cts?.Dispose();
            _mapper.SafeModeEntered -= OnSafeModeEntered;
            
            // ConnectionManager 정리
            _connectionManager.ConnectionStateChanged -= OnConnectionStateChanged;
            _connectionManager.DiagnosticMessage -= OnDiagnosticMessage;
            _connectionManager.Dispose();
            
            _isDisposed = true;
            _logger.Info("InputManager 해제됨");
            
            GC.SuppressFinalize(this);
        }
        
        ~InputManager()
        {
            Dispose();
        }
        
        // 프로퍼티
        public bool IsCapturing => _isCapturing;
        public bool IsConnected => _connectionManager.IsConnected;
        public ConnectionManager Connection => _connectionManager;
        
        /// <summary>
        /// 연결 진단 실행
        /// </summary>
        public async Task<string> RunDiagnosticsAsync()
        {
            var diagnostics = new System.Text.StringBuilder();
            diagnostics.AppendLine("=== ADB 연결 진단 ===");
            diagnostics.AppendLine($"시간: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            diagnostics.AppendLine($"디바이스: {_deviceSerial}");
            diagnostics.AppendLine();
            
            // 1. 디바이스 상태 확인
            diagnostics.AppendLine("[1] 디바이스 연결 상태 확인...");
            var status = await _connectionManager.CheckDeviceStatusAsync();
            diagnostics.AppendLine($"    상태: {status}");
            diagnostics.AppendLine($"    정상 여부: {(status == "device" ? "예" : "아니오")}");
            diagnostics.AppendLine();
            
            // 2. 로그캣 분석
            diagnostics.AppendLine("[2] 로그캣 분석 (최근 100줄)...");
            var logcat = await _connectionManager.CaptureLogcatSnippetAsync(100);
            
            var socketExceptions = 0;
            var crashes = 0;
            foreach (var line in logcat.Split('\n'))
            {
                var lower = line.ToLowerInvariant();
                if (lower.Contains("socketexception") || lower.Contains("connection reset"))
                    socketExceptions++;
                if (lower.Contains("fatal exception") || lower.Contains("crash"))
                    crashes++;
            }
            
            diagnostics.AppendLine($"    SocketException 발견: {socketExceptions}건");
            diagnostics.AppendLine($"    크래시/ANR 발견: {crashes}건");
            diagnostics.AppendLine();
            
            // 3. 연결 상태
            diagnostics.AppendLine("[3] ConnectionManager 상태...");
            diagnostics.AppendLine($"    연결됨: {_connectionManager.IsConnected}");
            diagnostics.AppendLine($"    마지막 성공 명령: {_connectionManager.LastSuccessfulCommand:HH:mm:ss}");
            diagnostics.AppendLine();
            
            diagnostics.AppendLine("=== 진단 완료 ===");
            
            return diagnostics.ToString();
        }
    }
    
    /// <summary>
    /// 터치 이벤트 타입
    /// </summary>
    public enum TouchEventType
    {
        Down,
        Up,
        Move
    }
    
    /// <summary>
    /// 터치 이벤트 인자
    /// </summary>
    public class TouchEventArgs : EventArgs
    {
        public TouchEventType Type { get; }
        public int X { get; }
        public int Y { get; }
        public DateTime Timestamp { get; }
        
        public TouchEventArgs(TouchEventType type, int x, int y)
        {
            Type = type;
            X = x;
            Y = y;
            Timestamp = DateTime.Now;
        }
    }
}
