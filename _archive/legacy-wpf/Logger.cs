using System;
using System.IO;
using System.Runtime.CompilerServices;

namespace DoaiDeviceFarm.Client
{
    /// <summary>
    /// 로깅 유틸리티 클래스 (싱글톤 패턴)
    /// 파일 및 콘솔 출력을 지원합니다.
    /// </summary>
    public class Logger
    {
        // 싱글톤 인스턴스
        private static Logger? _instance;
        private static readonly object _lock = new object();
        
        // 로그 파일 경로
        private readonly string _logFilePath;
        
        // 로그 레벨
        public LogLevel MinimumLevel { get; set; } = LogLevel.Debug;
        
        // 콘솔 출력 여부
        public bool EnableConsoleOutput { get; set; } = true;
        
        // 파일 출력 여부
        public bool EnableFileOutput { get; set; } = true;
        
        public static Logger Instance
        {
            get
            {
                if (_instance == null)
                {
                    lock (_lock)
                    {
                        _instance ??= new Logger();
                    }
                }
                return _instance;
            }
        }
        
        private Logger()
        {
            // 로그 디렉토리 생성
            var logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
            Directory.CreateDirectory(logDir);
            
            // 날짜별 로그 파일
            _logFilePath = Path.Combine(logDir, $"doai-client-{DateTime.Now:yyyyMMdd}.log");
        }
        
        public void Debug(string message, [CallerMemberName] string caller = "", [CallerFilePath] string file = "", [CallerLineNumber] int line = 0)
        {
            Log(LogLevel.Debug, message, caller, file, line);
        }
        
        public void Info(string message, [CallerMemberName] string caller = "", [CallerFilePath] string file = "", [CallerLineNumber] int line = 0)
        {
            Log(LogLevel.Info, message, caller, file, line);
        }
        
        public void Warning(string message, [CallerMemberName] string caller = "", [CallerFilePath] string file = "", [CallerLineNumber] int line = 0)
        {
            Log(LogLevel.Warning, message, caller, file, line);
        }
        
        public void Error(string message, Exception? ex = null, [CallerMemberName] string caller = "", [CallerFilePath] string file = "", [CallerLineNumber] int line = 0)
        {
            var fullMessage = ex != null ? $"{message}\n{ex}" : message;
            Log(LogLevel.Error, fullMessage, caller, file, line);
        }
        
        private void Log(LogLevel level, string message, string caller, string file, int line)
        {
            if (level < MinimumLevel) return;
            
            var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
            var fileName = Path.GetFileName(file);
            var logEntry = $"[{timestamp}] [{level,-7}] [{fileName}:{line}] {caller}: {message}";
            
            // 콘솔 출력
            if (EnableConsoleOutput)
            {
                lock (_lock)
                {
                    var originalColor = Console.ForegroundColor;
                    Console.ForegroundColor = GetLogColor(level);
                    Console.WriteLine(logEntry);
                    Console.ForegroundColor = originalColor;
                }
            }            
            // 파일 출력
            if (EnableFileOutput)
            {
                try
                {
                    lock (_lock)
                    {
                        File.AppendAllText(_logFilePath, logEntry + Environment.NewLine);
                    }
                }
                catch
                {
                    // 파일 쓰기 실패 시 무시 (무한 루프 방지)
                }
            }
        }
        
        private ConsoleColor GetLogColor(LogLevel level) => level switch
        {
            LogLevel.Debug => ConsoleColor.Gray,
            LogLevel.Info => ConsoleColor.White,
            LogLevel.Warning => ConsoleColor.Yellow,
            LogLevel.Error => ConsoleColor.Red,
            _ => ConsoleColor.White
        };
    }
    
    public enum LogLevel
    {
        Debug = 0,
        Info = 1,
        Warning = 2,
        Error = 3
    }
}
