/**
 * ResultCollector Stress Test - Race Condition 검증 (Backend C#)
 *
 * 목적: ADB Pull 시 Race Condition 해결 검증
 * - job_finished 신호 감지 후 500ms grace period 적용 확인
 * - 10회 연속 Pull 요청 시 0byte 파일 발생 여부 확인
 *
 * 실행 방법:
 * - dotnet test
 * - 또는 별도 콘솔 앱으로 실행
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using DoaiDeviceFarm.Backend;

namespace DoaiDeviceFarm.Tests
{
    /// <summary>
    /// ResultCollector Race Condition 스트레스 테스트
    /// </summary>
    public class ResultCollectorStressTest
    {
        // 테스트 설정
        private const int ITERATION_COUNT = 10;           // 연속 Pull 횟수
        private const int DELAY_BETWEEN_PULLS_MS = 100;   // Pull 간 딜레이
        private const int MIN_VALID_FILE_SIZE = 1000;     // 유효 파일 최소 크기 (1KB)
        private const string LOCAL_TEST_DIR = "./stress_test_evidence";

        // 테스트 결과
        private int _totalPulls = 0;
        private int _successCount = 0;
        private int _failCount = 0;
        private int _zeroByteCount = 0;
        private int _gracePeriodApplied = 0;
        private List<PullTestResult> _results = new List<PullTestResult>();

        /// <summary>
        /// 스트레스 테스트 실행 (시뮬레이션)
        /// </summary>
        /// <param name="deviceSerial">대상 기기 시리얼</param>
        /// <param name="remotePaths">Pull할 원격 파일 경로 목록</param>
        public async Task<StressTestSummary> RunStressTestAsync(
            string deviceSerial,
            string[] remotePaths = null)
        {
            Console.WriteLine("╔════════════════════════════════════════════════════════╗");
            Console.WriteLine("║  ResultCollector Race Condition Stress Test           ║");
            Console.WriteLine($"║  iterations: {ITERATION_COUNT}, delay: {DELAY_BETWEEN_PULLS_MS}ms                          ║");
            Console.WriteLine("╚════════════════════════════════════════════════════════╝\n");

            // 테스트 디렉토리 생성
            if (!Directory.Exists(LOCAL_TEST_DIR))
            {
                Directory.CreateDirectory(LOCAL_TEST_DIR);
            }

            var stopwatch = Stopwatch.StartNew();
            var collector = new ResultCollector(localEvidencePath: LOCAL_TEST_DIR);

            // 테스트용 원격 경로 생성 (실제 테스트 시 Android에서 생성된 파일 경로 사용)
            if (remotePaths == null || remotePaths.Length == 0)
            {
                remotePaths = GenerateTestRemotePaths(ITERATION_COUNT);
            }

            for (int i = 0; i < Math.Min(ITERATION_COUNT, remotePaths.Length); i++)
            {
                Console.WriteLine($"\n=== Iteration {i + 1}/{ITERATION_COUNT} ===");

                var result = await TestSinglePullAsync(collector, deviceSerial, remotePaths[i], i + 1);
                _results.Add(result);
                _totalPulls++;

                if (result.Success)
                {
                    _successCount++;
                    Console.WriteLine($"✅ SUCCESS: {result.FileSize} bytes ({result.DurationMs}ms)");

                    if (result.GracePeriodApplied)
                    {
                        _gracePeriodApplied++;
                        Console.WriteLine($"   [RACE FIX] 500ms grace period was applied");
                    }
                }
                else
                {
                    _failCount++;
                    if (result.IsZeroByte)
                    {
                        _zeroByteCount++;
                        Console.WriteLine($"❌ FAIL (0 BYTE): {result.Error}");
                    }
                    else
                    {
                        Console.WriteLine($"❌ FAIL: {result.Error}");
                    }
                }

                // 다음 Pull 전 짧은 딜레이
                if (i < ITERATION_COUNT - 1)
                {
                    await Task.Delay(DELAY_BETWEEN_PULLS_MS);
                }
            }

            stopwatch.Stop();

            // 결과 출력
            PrintResults(stopwatch.ElapsedMilliseconds);

            return CreateSummary(stopwatch.ElapsedMilliseconds);
        }

        /// <summary>
        /// 단일 Pull 테스트
        /// </summary>
        private async Task<PullTestResult> TestSinglePullAsync(
            ResultCollector collector,
            string deviceSerial,
            string remotePath,
            int iteration)
        {
            var result = new PullTestResult
            {
                Iteration = iteration,
                RemotePath = remotePath,
                Success = false
            };

            var stopwatch = Stopwatch.StartNew();

            try
            {
                // SafePull 실행 (내부에서 500ms grace period 적용됨)
                var pullResult = await collector.SafePullAsync(deviceSerial, remotePath);

                stopwatch.Stop();
                result.DurationMs = stopwatch.ElapsedMilliseconds;
                result.LocalPath = pullResult.LocalPath;
                result.Success = pullResult.Success;
                result.Error = pullResult.Error;

                if (pullResult.Success && !string.IsNullOrEmpty(pullResult.LocalPath))
                {
                    if (File.Exists(pullResult.LocalPath))
                    {
                        var fileInfo = new FileInfo(pullResult.LocalPath);
                        result.FileSize = fileInfo.Length;

                        // 0byte 체크
                        if (result.FileSize == 0)
                        {
                            result.IsZeroByte = true;
                            result.Success = false;
                            result.Error = "File is 0 bytes after pull";
                        }
                        // 최소 크기 체크
                        else if (result.FileSize < MIN_VALID_FILE_SIZE)
                        {
                            result.Success = false;
                            result.Error = $"File too small: {result.FileSize} bytes";
                        }
                    }
                }

                // Grace period 적용 여부 확인 (500ms 이상 걸렸으면 적용된 것)
                // WaitForFileReadyAsync 내에서 500ms delay가 추가되므로 확인 가능
                result.GracePeriodApplied = result.DurationMs >= 500;
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                result.DurationMs = stopwatch.ElapsedMilliseconds;
                result.Error = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// 테스트용 원격 경로 생성
        /// </summary>
        private string[] GenerateTestRemotePaths(int count)
        {
            var paths = new string[count];
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            for (int i = 0; i < count; i++)
            {
                paths[i] = $"/sdcard/Scripts/doai-bot/evidence/stress_test_{timestamp}_{i}.png";
            }

            return paths;
        }

        /// <summary>
        /// 테스트 결과 출력
        /// </summary>
        private void PrintResults(long totalTimeMs)
        {
            Console.WriteLine("\n╔════════════════════════════════════════════════════════╗");
            Console.WriteLine("║                   TEST RESULTS                         ║");
            Console.WriteLine("╚════════════════════════════════════════════════════════╝");
            Console.WriteLine($"Total pulls:          {_totalPulls}");
            Console.WriteLine($"Success count:        {_successCount}");
            Console.WriteLine($"Fail count:           {_failCount}");
            Console.WriteLine($"0-byte files:         {_zeroByteCount}");
            Console.WriteLine($"Grace period applied: {_gracePeriodApplied}");
            Console.WriteLine($"Total time:           {totalTimeMs}ms");
            Console.WriteLine($"Avg time/pull:        {totalTimeMs / Math.Max(_totalPulls, 1)}ms");
            Console.WriteLine();

            // Race Condition 해결 여부 판정
            if (_zeroByteCount == 0 && _gracePeriodApplied > 0)
            {
                Console.WriteLine("╔════════════════════════════════════════════════════════╗");
                Console.WriteLine("║  ✅✅✅ RACE CONDITION FIX VERIFIED ✅✅✅              ║");
                Console.WriteLine("║  No 0-byte files + Grace period applied!              ║");
                Console.WriteLine("╚════════════════════════════════════════════════════════╝");
            }
            else if (_zeroByteCount > 0)
            {
                Console.WriteLine("╔════════════════════════════════════════════════════════╗");
                Console.WriteLine("║  ❌❌❌ RACE CONDITION STILL EXISTS ❌❌❌              ║");
                Console.WriteLine($"║  0-byte files: {_zeroByteCount}                                      ║");
                Console.WriteLine("╚════════════════════════════════════════════════════════╝");
            }
        }

        /// <summary>
        /// 테스트 요약 생성
        /// </summary>
        private StressTestSummary CreateSummary(long totalTimeMs)
        {
            return new StressTestSummary
            {
                TestType = "race_condition_stress_test_backend",
                TotalPulls = _totalPulls,
                SuccessCount = _successCount,
                FailCount = _failCount,
                ZeroByteCount = _zeroByteCount,
                GracePeriodAppliedCount = _gracePeriodApplied,
                PassRate = _totalPulls > 0 ? (double)_successCount / _totalPulls * 100 : 0,
                RaceConditionResolved = _zeroByteCount == 0,
                TotalDurationMs = totalTimeMs,
                AvgPullTimeMs = _totalPulls > 0 ? totalTimeMs / _totalPulls : 0,
                Results = _results
            };
        }
    }

    /// <summary>
    /// 단일 Pull 테스트 결과
    /// </summary>
    public class PullTestResult
    {
        public int Iteration { get; set; }
        public bool Success { get; set; }
        public string RemotePath { get; set; }
        public string LocalPath { get; set; }
        public long FileSize { get; set; }
        public long DurationMs { get; set; }
        public bool IsZeroByte { get; set; }
        public bool GracePeriodApplied { get; set; }
        public string Error { get; set; }
    }

    /// <summary>
    /// 스트레스 테스트 요약
    /// </summary>
    public class StressTestSummary
    {
        public string TestType { get; set; }
        public int TotalPulls { get; set; }
        public int SuccessCount { get; set; }
        public int FailCount { get; set; }
        public int ZeroByteCount { get; set; }
        public int GracePeriodAppliedCount { get; set; }
        public double PassRate { get; set; }
        public bool RaceConditionResolved { get; set; }
        public long TotalDurationMs { get; set; }
        public long AvgPullTimeMs { get; set; }
        public List<PullTestResult> Results { get; set; }
    }

    /// <summary>
    /// 테스트 실행 진입점
    /// </summary>
    public class StressTestRunner
    {
        public static async Task Main(string[] args)
        {
            var deviceSerial = args.Length > 0 ? args[0] : "emulator-5554";

            Console.WriteLine($"Running stress test for device: {deviceSerial}");
            Console.WriteLine("Make sure the Android device has test screenshot files ready.\n");

            var test = new ResultCollectorStressTest();
            var summary = await test.RunStressTestAsync(deviceSerial);

            // JSON 결과 출력
            Console.WriteLine("\n[JSON Summary]");
            Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(summary, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true
            }));
        }
    }
}
