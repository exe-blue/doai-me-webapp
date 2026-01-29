/**
 * ResultCollector.cs - Host-side Result Collection Module
 *
 * ADB pull 실행 전 파일 존재 확인 및 동기화 로직
 *
 * Features:
 * 1. ADB shell을 통한 원격 파일 존재 확인
 * 2. .ready 신호 파일 확인 (Android 측 쓰기 완료 신호)
 * 3. 파일 크기 검증 후 pull 실행
 * 4. 재시도 로직 포함
 */

using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DoaiDeviceFarm.Backend
{
    /// <summary>
    /// ADB를 통한 결과 파일 수집기
    /// </summary>
    public class ResultCollector
    {
        // 설정 상수
        private const int FILE_CHECK_TIMEOUT_MS = 30000;    // 파일 확인 최대 대기 시간
        private const int FILE_CHECK_INTERVAL_MS = 500;     // 파일 확인 간격
        private const int MIN_FILE_SIZE_BYTES = 1000;       // 최소 파일 크기 (1KB)
        private const int MAX_RETRY_COUNT = 3;              // 최대 재시도 횟수
        private const int RETRY_DELAY_MS = 1000;            // 재시도 간격

        // [RACE CONDITION FIX] 신호 감지 후 안전 대기 시간
        private const int SIGNAL_GRACE_PERIOD_MS = 500;     // job_finished 신호 감지 후 500ms 대기

        private readonly string _adbPath;
        private readonly string _localEvidencePath;

        public ResultCollector(string adbPath = "adb", string localEvidencePath = null)
        {
            _adbPath = adbPath;
            _localEvidencePath = localEvidencePath ?? Path.Combine(
                Environment.CurrentDirectory, "evidence"
            );

            // 로컬 증거 디렉토리 생성
            if (!Directory.Exists(_localEvidencePath))
            {
                Directory.CreateDirectory(_localEvidencePath);
            }
        }

        /// <summary>
        /// 원격 파일 존재 확인 (ADB shell)
        /// </summary>
        /// <param name="deviceSerial">기기 시리얼</param>
        /// <param name="remotePath">원격 파일 경로</param>
        /// <returns>파일 존재 여부</returns>
        public async Task<bool> CheckRemoteFileExistsAsync(string deviceSerial, string remotePath)
        {
            try
            {
                var result = await ExecuteAdbCommandAsync(
                    deviceSerial,
                    $"shell \"[ -f '{remotePath}' ] && echo EXISTS || echo NOTFOUND\""
                );

                return result.Trim() == "EXISTS";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ResultCollector] File check error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// 원격 파일 크기 확인 (ADB shell)
        /// </summary>
        /// <param name="deviceSerial">기기 시리얼</param>
        /// <param name="remotePath">원격 파일 경로</param>
        /// <returns>파일 크기 (바이트), 실패 시 -1</returns>
        public async Task<long> GetRemoteFileSizeAsync(string deviceSerial, string remotePath)
        {
            try
            {
                var result = await ExecuteAdbCommandAsync(
                    deviceSerial,
                    $"shell stat -c %s '{remotePath}' 2>/dev/null || echo -1"
                );

                if (long.TryParse(result.Trim(), out long size))
                {
                    return size;
                }

                return -1;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ResultCollector] Size check error: {ex.Message}");
                return -1;
            }
        }

        /// <summary>
        /// .ready 신호 파일 확인 및 파싱
        /// </summary>
        /// <param name="deviceSerial">기기 시리얼</param>
        /// <param name="remotePath">스크린샷 파일 경로</param>
        /// <returns>준비 상태 정보</returns>
        public async Task<ReadySignal> CheckReadySignalAsync(string deviceSerial, string remotePath)
        {
            var signalPath = remotePath + ".ready";

            try
            {
                // 신호 파일 존재 확인
                if (!await CheckRemoteFileExistsAsync(deviceSerial, signalPath))
                {
                    return new ReadySignal { Status = "not_found" };
                }

                // 신호 파일 내용 읽기
                var content = await ExecuteAdbCommandAsync(
                    deviceSerial,
                    $"shell cat '{signalPath}'"
                );

                if (string.IsNullOrWhiteSpace(content))
                {
                    return new ReadySignal { Status = "empty" };
                }

                // JSON 파싱
                var signal = JsonSerializer.Deserialize<ReadySignal>(content);
                return signal ?? new ReadySignal { Status = "parse_error" };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ResultCollector] Signal check error: {ex.Message}");
                return new ReadySignal { Status = "error", Error = ex.Message };
            }
        }

        /// <summary>
        /// 파일 준비 완료까지 대기 (폴링)
        /// </summary>
        /// <param name="deviceSerial">기기 시리얼</param>
        /// <param name="remotePath">원격 파일 경로</param>
        /// <param name="timeoutMs">타임아웃 (밀리초)</param>
        /// <returns>준비 완료 여부</returns>
        public async Task<FileReadyResult> WaitForFileReadyAsync(
            string deviceSerial,
            string remotePath,
            int timeoutMs = FILE_CHECK_TIMEOUT_MS)
        {
            var result = new FileReadyResult
            {
                RemotePath = remotePath,
                StartTime = DateTime.UtcNow
            };

            var sw = Stopwatch.StartNew();

            Console.WriteLine($"[ResultCollector] Waiting for file: {remotePath}");

            while (sw.ElapsedMilliseconds < timeoutMs)
            {
                // 1. .ready 신호 파일 확인 (우선)
                var signal = await CheckReadySignalAsync(deviceSerial, remotePath);

                if (signal.Status == "ready")
                {
                    // [RACE CONDITION FIX] 신호 감지 후 500ms 안전 대기 시간
                    // Android 측 파일 시스템 버퍼가 완전히 플러시될 시간을 확보
                    Console.WriteLine($"[ResultCollector] Signal detected, waiting {SIGNAL_GRACE_PERIOD_MS}ms grace period...");
                    await Task.Delay(SIGNAL_GRACE_PERIOD_MS);

                    result.Success = true;
                    result.FileSize = signal.FileSize;
                    result.Duration = sw.Elapsed;
                    result.Method = "signal_file";

                    Console.WriteLine($"[ResultCollector] File ready (signal): {result.FileSize} bytes");
                    return result;
                }

                if (signal.Status == "failed")
                {
                    result.Success = false;
                    result.Error = signal.Error ?? "Remote capture failed";
                    result.Duration = sw.Elapsed;
                    result.Method = "signal_file";

                    Console.WriteLine($"[ResultCollector] File failed (signal): {result.Error}");
                    return result;
                }

                // 2. 직접 파일 확인 (신호 파일 없는 경우)
                if (await CheckRemoteFileExistsAsync(deviceSerial, remotePath))
                {
                    var size = await GetRemoteFileSizeAsync(deviceSerial, remotePath);

                    if (size >= MIN_FILE_SIZE_BYTES)
                    {
                        // 크기 안정화 확인 (1초 후 재확인)
                        await Task.Delay(1000);
                        var size2 = await GetRemoteFileSizeAsync(deviceSerial, remotePath);

                        if (size2 == size)
                        {
                            // [RACE CONDITION FIX] 직접 확인 시에도 500ms 안전 대기
                            Console.WriteLine($"[ResultCollector] Direct check stable, waiting {SIGNAL_GRACE_PERIOD_MS}ms grace period...");
                            await Task.Delay(SIGNAL_GRACE_PERIOD_MS);

                            result.Success = true;
                            result.FileSize = size;
                            result.Duration = sw.Elapsed;
                            result.Method = "direct_check";

                            Console.WriteLine($"[ResultCollector] File ready (direct): {result.FileSize} bytes");
                            return result;
                        }
                    }
                }

                await Task.Delay(FILE_CHECK_INTERVAL_MS);
            }

            // 타임아웃
            result.Success = false;
            result.Error = "Timeout waiting for file";
            result.Duration = sw.Elapsed;

            Console.WriteLine($"[ResultCollector] File timeout: {remotePath}");
            return result;
        }

        /// <summary>
        /// 안전한 ADB Pull (파일 준비 확인 후 실행)
        /// </summary>
        /// <param name="deviceSerial">기기 시리얼</param>
        /// <param name="remotePath">원격 파일 경로</param>
        /// <param name="localPath">로컬 저장 경로 (null이면 자동 생성)</param>
        /// <returns>Pull 결과</returns>
        public async Task<PullResult> SafePullAsync(
            string deviceSerial,
            string remotePath,
            string localPath = null)
        {
            var result = new PullResult
            {
                DeviceSerial = deviceSerial,
                RemotePath = remotePath,
                StartTime = DateTime.UtcNow
            };

            try
            {
                // 1. 파일 준비 완료 대기
                Console.WriteLine($"[ResultCollector] SafePull: Checking file ready...");
                var readyResult = await WaitForFileReadyAsync(deviceSerial, remotePath);

                if (!readyResult.Success)
                {
                    result.Success = false;
                    result.Error = readyResult.Error;
                    return result;
                }

                // 2. 로컬 경로 결정
                if (string.IsNullOrEmpty(localPath))
                {
                    var fileName = Path.GetFileName(remotePath);
                    var subDir = Path.Combine(_localEvidencePath, deviceSerial);

                    if (!Directory.Exists(subDir))
                    {
                        Directory.CreateDirectory(subDir);
                    }

                    localPath = Path.Combine(subDir, fileName);
                }

                result.LocalPath = localPath;

                // 3. ADB Pull 실행 (재시도 로직 포함)
                for (int retry = 0; retry < MAX_RETRY_COUNT; retry++)
                {
                    try
                    {
                        Console.WriteLine($"[ResultCollector] Pulling file (attempt {retry + 1})...");

                        var pullOutput = await ExecuteAdbCommandAsync(
                            deviceSerial,
                            $"pull \"{remotePath}\" \"{localPath}\""
                        );

                        // Pull 성공 확인
                        if (File.Exists(localPath))
                        {
                            var localFileInfo = new FileInfo(localPath);

                            if (localFileInfo.Length >= MIN_FILE_SIZE_BYTES)
                            {
                                result.Success = true;
                                result.FileSize = localFileInfo.Length;
                                result.Duration = DateTime.UtcNow - result.StartTime;

                                Console.WriteLine($"[ResultCollector] Pull SUCCESS: {result.LocalPath} ({result.FileSize} bytes)");
                                return result;
                            }
                        }

                        Console.WriteLine($"[ResultCollector] Pull incomplete, retrying...");
                        await Task.Delay(RETRY_DELAY_MS);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[ResultCollector] Pull attempt {retry + 1} failed: {ex.Message}");
                        await Task.Delay(RETRY_DELAY_MS);
                    }
                }

                result.Success = false;
                result.Error = "Max retries exceeded";
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = ex.Message;
                Console.WriteLine($"[ResultCollector] SafePull error: {ex.Message}");
            }

            result.Duration = DateTime.UtcNow - result.StartTime;
            return result;
        }

        /// <summary>
        /// 여러 파일 일괄 Pull
        /// </summary>
        /// <param name="deviceSerial">기기 시리얼</param>
        /// <param name="remotePaths">원격 파일 경로 목록</param>
        /// <returns>Pull 결과 목록</returns>
        public async Task<BatchPullResult> BatchPullAsync(
            string deviceSerial,
            string[] remotePaths)
        {
            var batchResult = new BatchPullResult
            {
                DeviceSerial = deviceSerial,
                StartTime = DateTime.UtcNow,
                Results = new PullResult[remotePaths.Length]
            };

            for (int i = 0; i < remotePaths.Length; i++)
            {
                batchResult.Results[i] = await SafePullAsync(deviceSerial, remotePaths[i]);
            }

            batchResult.Duration = DateTime.UtcNow - batchResult.StartTime;
            batchResult.SuccessCount = Array.FindAll(batchResult.Results, r => r.Success).Length;
            batchResult.FailCount = remotePaths.Length - batchResult.SuccessCount;

            Console.WriteLine($"[ResultCollector] Batch complete: {batchResult.SuccessCount}/{remotePaths.Length} succeeded");

            return batchResult;
        }

        /// <summary>
        /// 결과 JSON 파일 Pull 및 파싱
        /// </summary>
        /// <param name="deviceSerial">기기 시리얼</param>
        /// <param name="jobId">작업 ID</param>
        /// <returns>결과 데이터</returns>
        public async Task<JobResult> CollectJobResultAsync(string deviceSerial, string jobId)
        {
            var remotePath = $"/sdcard/Scripts/doai-bot/evidence/{jobId}_result.json";

            try
            {
                // 결과 JSON Pull
                var pullResult = await SafePullAsync(deviceSerial, remotePath);

                if (!pullResult.Success)
                {
                    return new JobResult
                    {
                        JobId = jobId,
                        Success = false,
                        Error = pullResult.Error
                    };
                }

                // JSON 파싱
                var content = await File.ReadAllTextAsync(pullResult.LocalPath);
                var jobResult = JsonSerializer.Deserialize<JobResult>(content);

                if (jobResult != null)
                {
                    jobResult.LocalResultPath = pullResult.LocalPath;

                    // 증거 파일 Pull
                    if (jobResult.EvidenceFiles != null && jobResult.EvidenceFiles.Length > 0)
                    {
                        Console.WriteLine($"[ResultCollector] Collecting {jobResult.EvidenceFiles.Length} evidence files...");
                        var evidenceBatch = await BatchPullAsync(deviceSerial, jobResult.EvidenceFiles);
                        jobResult.EvidencePullResults = evidenceBatch.Results;
                    }
                }

                return jobResult ?? new JobResult { JobId = jobId, Success = false, Error = "Parse error" };
            }
            catch (Exception ex)
            {
                return new JobResult
                {
                    JobId = jobId,
                    Success = false,
                    Error = ex.Message
                };
            }
        }

        /// <summary>
        /// ADB 명령 실행
        /// </summary>
        private async Task<string> ExecuteAdbCommandAsync(string deviceSerial, string command)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = _adbPath,
                Arguments = $"-s {deviceSerial} {command}",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = new Process { StartInfo = startInfo };
            process.Start();

            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            return output;
        }
    }

    // =============================================
    // 데이터 모델
    // =============================================

    public class ReadySignal
    {
        public string Status { get; set; }
        public string ScreenshotPath { get; set; }
        public long FileSize { get; set; }
        public string Timestamp { get; set; }
        public int CaptureTimeMs { get; set; }
        public int WriteTimeMs { get; set; }
        public string Error { get; set; }
    }

    public class FileReadyResult
    {
        public bool Success { get; set; }
        public string RemotePath { get; set; }
        public long FileSize { get; set; }
        public TimeSpan Duration { get; set; }
        public DateTime StartTime { get; set; }
        public string Method { get; set; }
        public string Error { get; set; }
    }

    public class PullResult
    {
        public bool Success { get; set; }
        public string DeviceSerial { get; set; }
        public string RemotePath { get; set; }
        public string LocalPath { get; set; }
        public long FileSize { get; set; }
        public TimeSpan Duration { get; set; }
        public DateTime StartTime { get; set; }
        public string Error { get; set; }
    }

    public class BatchPullResult
    {
        public string DeviceSerial { get; set; }
        public PullResult[] Results { get; set; }
        public int SuccessCount { get; set; }
        public int FailCount { get; set; }
        public TimeSpan Duration { get; set; }
        public DateTime StartTime { get; set; }
    }

    public class JobResult
    {
        public string JobId { get; set; }
        public bool Success { get; set; }
        public string Timestamp { get; set; }
        public bool VideoFound { get; set; }
        public bool VideoStarted { get; set; }
        public string[] EvidenceFiles { get; set; }
        public int EvidenceCount { get; set; }
        public string Error { get; set; }
        public string LocalResultPath { get; set; }
        public PullResult[] EvidencePullResults { get; set; }
    }
}
