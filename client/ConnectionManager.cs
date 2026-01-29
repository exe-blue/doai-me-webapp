using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace DoaiDeviceFarm.Client
{
    /// <summary>
    /// ADB 연결 관리자 - 간헐적 연결 끊김 문제 해결
    /// 
    /// 주요 기능:
    /// 1. 지속적인 ADB 셸 세션 유지 (프로세스 재사용)
    /// 2. 연결 상태 모니터링 (하트비트)
    /// 3. 자동 재연결 (지수 백오프)
    /// 4. 명령 큐 관리 및 타임아웃 처리
    /// </summary>
    public class ConnectionManager : IDisposable
    {
        // 연결 설정 상수
        private const int DEFAULT_COMMAND_TIMEOUT_MS = 5000;
        private const int HEARTBEAT_INTERVAL_MS = 3000;
        private const int MAX_RECONNECT_ATTEMPTS = 5;
        private const int BASE_RECONNECT_DELAY_MS = 500;
        private const int MAX_RECONNECT_DELAY_MS = 16000;
        private const int CONNECTION_CHECK_TIMEOUT_MS = 2000;
        
        // ADB 설정
        private readonly string _adbPath;
        private readonly string _deviceSerial;
        private readonly Logger _logger;
        
        // 연결 상태
        private Process? _adbShellProcess;
        private StreamWriter? _shellInput;
        private StreamReader? _shellOutput;
        private readonly object _processLock = new();
        private bool _isConnected;
        private bool _isDisposed;
        private int _reconnectAttempts;
        
        // 프로세스 동기화 (세마포어 기반)
        private readonly SemaphoreSlim _processSemaphore = new(1, 1);
        private const int PROCESS_SEMAPHORE_TIMEOUT_MS = 5000;
        
        // 강제 정리용 원자적 플래그
        private int _cleanupInProgress = 0; // 0 = idle, 1 = cleanup in progress
        
        // 하트비트 모니터링
        private CancellationTokenSource? _heartbeatCts;
        private Task? _heartbeatTask;
        private DateTime _lastSuccessfulCommand = DateTime.MinValue;
        
        // 명령 큐 (연결 복구 시 재시도용)
        private readonly ConcurrentQueue<PendingCommand> _commandQueue = new();
        private readonly SemaphoreSlim _commandSemaphore = new(1, 1);
        
        // 이벤트
        public event EventHandler<ConnectionStateEventArgs>? ConnectionStateChanged;
        public event EventHandler<string>? DiagnosticMessage;
        
        // 연결 상태 프로퍼티
        public bool IsConnected => _isConnected && !_isDisposed && _adbShellProcess?.HasExited != true;
        public string DeviceSerial => _deviceSerial;
        public DateTime LastSuccessfulCommand => _lastSuccessfulCommand;
        public int CommandTimeoutMs { get; set; } = DEFAULT_COMMAND_TIMEOUT_MS;
        
        /// <summary>
        /// ConnectionManager 생성자
        /// </summary>
        /// <param name="adbPath">ADB 실행 파일 경로</param>
        /// <param name="deviceSerial">대상 디바이스 시리얼 번호</param>
        public ConnectionManager(string adbPath, string deviceSerial)
        {
            _adbPath = adbPath ?? throw new ArgumentNullException(nameof(adbPath));
            _deviceSerial = deviceSerial ?? throw new ArgumentNullException(nameof(deviceSerial));
            _logger = Logger.Instance;
            
            ValidateAdbPath();
            _logger.Info($"ConnectionManager 초기화: Device={deviceSerial}");
        }
        
        /// <summary>
        /// ADB 경로 유효성 검사
        /// </summary>
        private void ValidateAdbPath()
        {
            if (!File.Exists(_adbPath))
            {
                throw new FileNotFoundException($"ADB 실행 파일을 찾을 수 없습니다: {_adbPath}");
            }
        }
        
        /// <summary>
        /// 연결 시작 및 초기화
        /// </summary>
        public async Task<bool> ConnectAsync(CancellationToken cancellationToken = default)
        {
            if (_isDisposed)
            {
                throw new ObjectDisposedException(nameof(ConnectionManager));
            }
            
            _logger.Info($"디바이스 연결 시도: {_deviceSerial}");
            
            // 기기 연결 상태 확인
            var deviceStatus = await CheckDeviceStatusAsync(cancellationToken);
            if (deviceStatus != "device")
            {
                _logger.Error($"디바이스 상태 이상: {deviceStatus}");
                OnConnectionStateChanged(false, $"Device status: {deviceStatus}");
                return false;
            }
            
            // 지속적 셸 세션 시작
            var connected = await EstablishShellSessionAsync(cancellationToken);
            
            if (connected)
            {
                _reconnectAttempts = 0;
                StartHeartbeat();
                OnConnectionStateChanged(true, "Connected");
                _logger.Info($"디바이스 연결 성공: {_deviceSerial}");
            }
            
            return connected;
        }
        
        /// <summary>
        /// 디바이스 연결 상태 확인 (get_connected_devices와 동일한 로직)
        /// </summary>
        public async Task<string> CheckDeviceStatusAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                var output = await ExecuteAdbCommandAsync("devices", cancellationToken, useShell: false);
                var lines = output.Split('\n');
                
                foreach (var line in lines)
                {
                    if (line.StartsWith(_deviceSerial))
                    {
                        var parts = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2)
                        {
                            var status = parts[1].Trim();
                            EmitDiagnostic($"[진단] 디바이스 {_deviceSerial} 상태: {status}");
                            return status;
                        }
                    }
                }
                
                EmitDiagnostic($"[진단] 디바이스 {_deviceSerial}를 찾을 수 없음");
                return "not_found";
            }
            catch (Exception ex)
            {
                _logger.Error($"디바이스 상태 확인 실패: {ex.Message}", ex);
                return "error";
            }
        }
        
        /// <summary>
        /// 최근 로그캣 조회 (capture_logcat_snippet과 동일한 로직)
        /// </summary>
        public async Task<string> CaptureLogcatSnippetAsync(int lines = 100, string filterTag = "", CancellationToken cancellationToken = default)
        {
            try
            {
                var args = $"-s {_deviceSerial} logcat -d -t {lines}";
                if (!string.IsNullOrEmpty(filterTag))
                {
                    args += $" {filterTag}:V";
                }
                
                var output = await ExecuteAdbCommandAsync(args, cancellationToken, useShell: false);
                
                // SocketException 및 크래시 로그 분석
                AnalyzeLogcatForIssues(output);
                
                return output;
            }
            catch (Exception ex)
            {
                _logger.Error($"로그캣 캡처 실패: {ex.Message}", ex);
                return $"Error: {ex.Message}";
            }
        }
        
        /// <summary>
        /// 로그캣 분석 - SocketException 및 크래시 감지
        /// </summary>
        private void AnalyzeLogcatForIssues(string logcat)
        {
            var socketExceptionCount = 0;
            var crashCount = 0;
            
            foreach (var line in logcat.Split('\n'))
            {
                var lowerLine = line.ToLowerInvariant();
                
                if (lowerLine.Contains("socketexception") || 
                    lowerLine.Contains("connection reset") ||
                    lowerLine.Contains("broken pipe"))
                {
                    socketExceptionCount++;
                }
                
                if (lowerLine.Contains("fatal exception") ||
                    lowerLine.Contains("crash") ||
                    lowerLine.Contains("anr"))
                {
                    crashCount++;
                }
            }
            
            if (socketExceptionCount > 0)
            {
                EmitDiagnostic($"[경고] SocketException 발견: {socketExceptionCount}건 - 네트워크 연결 불안정");
            }
            
            if (crashCount > 0)
            {
                EmitDiagnostic($"[경고] 크래시/ANR 발견: {crashCount}건");
            }
            
            if (socketExceptionCount == 0 && crashCount == 0)
            {
                EmitDiagnostic("[진단] 로그캣에서 연결 관련 오류를 발견하지 못함");
            }
        }
        
        /// <summary>
        /// 지속적 셸 세션 시작
        /// </summary>
        private async Task<bool> EstablishShellSessionAsync(CancellationToken cancellationToken)
        {
            lock (_processLock)
            {
                CleanupShellProcess();
                
                try
                {
                    var startInfo = new ProcessStartInfo
                    {
                        FileName = _adbPath,
                        Arguments = $"-s {_deviceSerial} shell",
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardInput = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        StandardOutputEncoding = Encoding.UTF8,
                        StandardErrorEncoding = Encoding.UTF8
                    };
                    
                    _adbShellProcess = new Process { StartInfo = startInfo };
                    _adbShellProcess.Start();
                    
                    _shellInput = _adbShellProcess.StandardInput;
                    _shellOutput = _adbShellProcess.StandardOutput;
                    
                    // 셸 초기화 확인 (echo 테스트)
                    _shellInput.WriteLine("echo CONNECTION_TEST_OK");
                    _shellInput.Flush();
                    
                    // 응답 대기 (타임아웃 포함)
                    var readTask = _shellOutput.ReadLineAsync();
                    var timeoutTask = Task.Delay(CONNECTION_CHECK_TIMEOUT_MS, cancellationToken);
                    
                    if (await Task.WhenAny(readTask, timeoutTask) == timeoutTask)
                    {
                        _logger.Warning("셸 세션 초기화 타임아웃");
                        CleanupShellProcess();
                        return false;
                    }
                    
                    _isConnected = true;
                    _lastSuccessfulCommand = DateTime.Now;
                    return true;
                }
                catch (Exception ex)
                {
                    _logger.Error($"셸 세션 시작 실패: {ex.Message}", ex);
                    CleanupShellProcess();
                    return false;
                }
            }
        }
        
        /// <summary>
        /// 셸 프로세스 정리 (반드시 _processLock 또는 _processSemaphore 보유 상태에서 호출)
        /// </summary>
        private void CleanupShellProcess()
        {
            _isConnected = false;
            
            try
            {
                _shellInput?.Dispose();
                _shellOutput?.Dispose();
                
                if (_adbShellProcess != null && !_adbShellProcess.HasExited)
                {
                    _adbShellProcess.Kill();
                }
                _adbShellProcess?.Dispose();
            }
            catch (Exception ex)
            {
                _logger.Debug($"셸 프로세스 정리 중 예외: {ex.Message}");
            }
            finally
            {
                _shellInput = null;
                _shellOutput = null;
                _adbShellProcess = null;
            }
        }
        
        /// <summary>
        /// 스레드 안전 강제 정리 (세마포어 미보유 상태에서 호출 가능)
        /// 타임아웃으로 _processSemaphore를 획득하지 못했을 때 안전하게 정리하는 메서드
        /// Interlocked로 중복 정리 방지, 짧은 타임아웃으로 세마포어 획득 재시도
        /// </summary>
        /// <param name="reason">정리 사유 (로깅용)</param>
        /// <returns>정리 성공 여부</returns>
        private async Task<bool> CleanupShellProcessForcedAsync(string reason)
        {
            // Interlocked로 중복 정리 방지
            if (Interlocked.CompareExchange(ref _cleanupInProgress, 1, 0) != 0)
            {
                _logger.Debug($"강제 정리 스킵 (이미 진행 중): {reason}");
                return false;
            }
            
            try
            {
                _logger.Warning($"강제 프로세스 정리 시작: {reason}");
                
                // 짧은 타임아웃으로 세마포어 획득 시도
                var acquired = await _processSemaphore.WaitAsync(1000);
                
                try
                {
                    // _processLock으로 추가 동기화 (세마포어 획득 여부와 관계없이 안전하게 정리)
                    lock (_processLock)
                    {
                        // 연결 상태 먼저 해제
                        _isConnected = false;
                        
                        // 각 리소스를 개별적으로 null 체크 후 정리 (원자적 스왑)
                        var shellInput = Interlocked.Exchange(ref _shellInput, null);
                        var shellOutput = Interlocked.Exchange(ref _shellOutput, null);
                        var adbProcess = Interlocked.Exchange(ref _adbShellProcess, null);
                        
                        try
                        {
                            shellInput?.Dispose();
                        }
                        catch (Exception ex)
                        {
                            _logger.Debug($"shellInput 정리 예외: {ex.Message}");
                        }
                        
                        try
                        {
                            shellOutput?.Dispose();
                        }
                        catch (Exception ex)
                        {
                            _logger.Debug($"shellOutput 정리 예외: {ex.Message}");
                        }
                        
                        try
                        {
                            if (adbProcess != null && !adbProcess.HasExited)
                            {
                                adbProcess.Kill();
                            }
                            adbProcess?.Dispose();
                        }
                        catch (Exception ex)
                        {
                            _logger.Debug($"adbProcess 정리 예외: {ex.Message}");
                        }
                    }
                    
                    _logger.Info($"강제 프로세스 정리 완료: {reason}");
                    return true;
                }
                finally
                {
                    if (acquired)
                    {
                        _processSemaphore.Release();
                    }
                }
            }
            finally
            {
                // 정리 완료 플래그 해제
                Interlocked.Exchange(ref _cleanupInProgress, 0);
            }
        }
        
        /// <summary>
        /// 세마포어 획득과 함께 안전하게 셸 프로세스 정리
        /// </summary>
        /// <param name="timeoutMs">세마포어 획득 타임아웃 (ms)</param>
        /// <param name="cancellationToken">취소 토큰</param>
        /// <returns>true: 정상 정리, false: 타임아웃으로 강제 정리 사용</returns>
        private async Task<bool> SafeCleanupShellProcessAsync(int timeoutMs, CancellationToken cancellationToken)
        {
            var acquired = await _processSemaphore.WaitAsync(timeoutMs, cancellationToken);
            
            if (acquired)
            {
                try
                {
                    lock (_processLock)
                    {
                        CleanupShellProcess();
                    }
                    return true;
                }
                finally
                {
                    _processSemaphore.Release();
                }
            }
            else
            {
                // 세마포어 획득 실패 시 강제 정리 사용
                _logger.Warning($"세마포어 획득 타임아웃 ({timeoutMs}ms), 강제 정리 실행");
                await CleanupShellProcessForcedAsync("Semaphore acquisition timeout");
                return false;
            }
        }
        
        /// <summary>
        /// 터치 이벤트 전송 (최적화된 경로)
        /// </summary>
        public async Task<bool> SendTouchEventAsync(TouchEventType type, int x, int y, CancellationToken cancellationToken = default)
        {
            if (!IsConnected)
            {
                // 자동 재연결 시도
                if (!await TryReconnectAsync(cancellationToken))
                {
                    return false;
                }
            }
            
            var command = type switch
            {
                TouchEventType.Down => $"input tap {x} {y}",
                TouchEventType.Move => $"input swipe {x} {y} {x} {y} 0",
                TouchEventType.Up => null, // tap에 포함됨
                _ => null
            };
            
            if (command == null)
            {
                return true;
            }
            
            return await ExecuteShellCommandAsync(command, cancellationToken);
        }
        
        /// <summary>
        /// 셸 명령 실행 (지속 세션 사용)
        /// </summary>
        public async Task<bool> ExecuteShellCommandAsync(string command, CancellationToken cancellationToken = default)
        {
            await _commandSemaphore.WaitAsync(cancellationToken);
            
            try
            {
                if (!IsConnected)
                {
                    if (!await TryReconnectAsync(cancellationToken))
                    {
                        return false;
                    }
                }
                
                lock (_processLock)
                {
                    if (_shellInput == null || _adbShellProcess?.HasExited == true)
                    {
                        _isConnected = false;
                        return false;
                    }
                    
                    try
                    {
                        _shellInput.WriteLine(command);
                        _shellInput.Flush();
                        _lastSuccessfulCommand = DateTime.Now;
                        return true;
                    }
                    catch (IOException ex)
                    {
                        _logger.Warning($"셸 명령 전송 실패 (IOException): {ex.Message}");
                        _isConnected = false;
                        return false;
                    }
                    catch (ObjectDisposedException)
                    {
                        _logger.Warning("셸 세션이 이미 종료됨");
                        _isConnected = false;
                        return false;
                    }
                }
            }
            finally
            {
                _commandSemaphore.Release();
            }
        }
        
        /// <summary>
        /// 일반 ADB 명령 실행 (새 프로세스)
        /// </summary>
        public async Task<string> ExecuteAdbCommandAsync(string arguments, CancellationToken cancellationToken = default, bool useShell = true)
        {
            var fullArgs = useShell ? $"-s {_deviceSerial} shell {arguments}" : arguments;
            
            var tcs = new TaskCompletionSource<string>();
            
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = _adbPath,
                    Arguments = fullArgs,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                }
            };
            
            var output = new StringBuilder();
            var errorOutput = new StringBuilder();
            
            process.OutputDataReceived += (s, e) =>
            {
                if (e.Data != null) output.AppendLine(e.Data);
            };
            
            process.ErrorDataReceived += (s, e) =>
            {
                if (e.Data != null) errorOutput.AppendLine(e.Data);
            };
            
            try
            {
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeoutCts.CancelAfter(CommandTimeoutMs);
                
                await Task.Run(() => process.WaitForExit(), timeoutCts.Token);
                
                if (errorOutput.Length > 0)
                {
                    _logger.Debug($"ADB stderr: {errorOutput}");
                }
                
                _lastSuccessfulCommand = DateTime.Now;
                return output.ToString().Trim();
            }
            catch (OperationCanceledException)
            {
                if (!process.HasExited)
                {
                    process.Kill();
                }
                throw new TimeoutException($"ADB 명령 타임아웃: {fullArgs}");
            }
        }
        
        /// <summary>
        /// 자동 재연결 시도 (지수 백오프)
        /// </summary>
        private async Task<bool> TryReconnectAsync(CancellationToken cancellationToken)
        {
            if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS)
            {
                _logger.Error($"최대 재연결 시도 횟수 초과: {MAX_RECONNECT_ATTEMPTS}회");
                OnConnectionStateChanged(false, "Max reconnect attempts exceeded");
                return false;
            }
            
            _reconnectAttempts++;
            var delayMs = Math.Min(BASE_RECONNECT_DELAY_MS * (int)Math.Pow(2, _reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
            
            _logger.Info($"재연결 시도 {_reconnectAttempts}/{MAX_RECONNECT_ATTEMPTS}, 대기시간: {delayMs}ms");
            EmitDiagnostic($"[재연결] 시도 {_reconnectAttempts}/{MAX_RECONNECT_ATTEMPTS} (지수 백오프: {delayMs}ms)");
            
            await Task.Delay(delayMs, cancellationToken);
            
            return await ConnectAsync(cancellationToken);
        }
        
        /// <summary>
        /// 하트비트 모니터링 시작
        /// </summary>
        private void StartHeartbeat()
        {
            StopHeartbeat();
            
            _heartbeatCts = new CancellationTokenSource();
            _heartbeatTask = HeartbeatLoopAsync(_heartbeatCts.Token);
        }
        
        /// <summary>
        /// 하트비트 중지
        /// </summary>
        private void StopHeartbeat()
        {
            _heartbeatCts?.Cancel();
            _heartbeatCts?.Dispose();
            _heartbeatCts = null;
        }
        
        /// <summary>
        /// 하트비트 루프
        /// </summary>
        private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(HEARTBEAT_INTERVAL_MS, cancellationToken);
                    
                    if (!IsConnected)
                    {
                        _logger.Warning("하트비트 감지: 연결 끊김, 재연결 시도");
                        await TryReconnectAsync(cancellationToken);
                        continue;
                    }
                    
                    // 연결 상태 확인 (echo 테스트)
                    var success = await ExecuteShellCommandAsync("echo HB_OK", cancellationToken);
                    
                    if (!success)
                    {
                        _logger.Warning("하트비트 실패, 연결 상태 재확인");
                        _isConnected = false;
                        OnConnectionStateChanged(false, "Heartbeat failed");
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.Error($"하트비트 예외: {ex.Message}", ex);
                }
            }
        }
        
        /// <summary>
        /// 연결 상태 변경 이벤트 발생
        /// </summary>
        private void OnConnectionStateChanged(bool connected, string reason)
        {
            ConnectionStateChanged?.Invoke(this, new ConnectionStateEventArgs(connected, reason));
        }
        
        /// <summary>
        /// 진단 메시지 발생
        /// </summary>
        private void EmitDiagnostic(string message)
        {
            _logger.Info(message);
            DiagnosticMessage?.Invoke(this, message);
        }
        
        /// <summary>
        /// 연결 해제
        /// </summary>
        public void Disconnect()
        {
            StopHeartbeat();
            
            // 세마포어 획득 시도 (동기 버전)
            var acquired = _processSemaphore.Wait(PROCESS_SEMAPHORE_TIMEOUT_MS);
            
            try
            {
                lock (_processLock)
                {
                    CleanupShellProcess();
                }
            }
            finally
            {
                if (acquired)
                {
                    _processSemaphore.Release();
                }
                else
                {
                    // 세마포어 미획득 시 강제 정리 (비동기 fire-and-forget)
                    _ = CleanupShellProcessForcedAsync("Disconnect timeout - forced cleanup");
                }
            }
            
            OnConnectionStateChanged(false, "Disconnected by user");
            _logger.Info("연결 해제됨");
        }
        
        /// <summary>
        /// 비동기 연결 해제 (권장)
        /// </summary>
        public async Task DisconnectAsync()
        {
            StopHeartbeat();
            
            await SafeCleanupShellProcessAsync(PROCESS_SEMAPHORE_TIMEOUT_MS, CancellationToken.None);
            
            OnConnectionStateChanged(false, "Disconnected by user");
            _logger.Info("연결 해제됨 (async)");
        }
        
        public void Dispose()
        {
            if (_isDisposed) return;
            _isDisposed = true;
            
            Disconnect();
            _commandSemaphore.Dispose();
            _processSemaphore.Dispose();
            
            _logger.Info("ConnectionManager 해제됨");
            GC.SuppressFinalize(this);
        }
        
        ~ConnectionManager()
        {
            Dispose();
        }
    }
    
    /// <summary>
    /// 연결 상태 변경 이벤트 인자
    /// </summary>
    public class ConnectionStateEventArgs : EventArgs
    {
        public bool IsConnected { get; }
        public string Reason { get; }
        public DateTime Timestamp { get; }
        
        public ConnectionStateEventArgs(bool isConnected, string reason)
        {
            IsConnected = isConnected;
            Reason = reason;
            Timestamp = DateTime.Now;
        }
    }
    
    /// <summary>
    /// 대기 중인 명령
    /// </summary>
    internal class PendingCommand
    {
        public string Command { get; set; } = "";
        public DateTime QueuedAt { get; set; } = DateTime.Now;
        public int RetryCount { get; set; }
    }
}
