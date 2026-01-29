using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Media;
using Microsoft.Win32;
using System.Windows.Forms;

namespace DoaiDeviceFarm.Client
{
    /// <summary>
    /// MainWindow.xaml 코드 비하인드
    /// </summary>
    public partial class MainWindow : Window
    {
        private CoordinateMapper? _mapper;
        private InputManager? _inputManager;
        private readonly Logger _logger;
        
        // 이벤트 카운터
        private int _sentCount;
        private int _errorCount;
        
        public MainWindow()
        {
            InitializeComponent();
            _logger = Logger.Instance;
            
            InitializeUI();
            LoadMonitors();
            
            _logger.Info("MainWindow 초기화 완료");
        }
        
        /// <summary>
        /// UI 초기화
        /// </summary>
        private void InitializeUI()
        {
            // 기본 ADB 경로 설정
            var envAdbPath = Environment.GetEnvironmentVariable("ADB_PATH");
            if (!string.IsNullOrEmpty(envAdbPath) && File.Exists(envAdbPath))
            {
                txtAdbPath.Text = envAdbPath;
            }
        }
        
        /// <summary>
        /// 모니터 목록 로드
        /// </summary>
        private void LoadMonitors()
        {
            cmbMonitors.Items.Clear();
            
            var screens = Screen.AllScreens;
            for (int i = 0; i < screens.Length; i++)
            {
                var screen = screens[i];
                var isPrimary = screen.Primary ? " (주 모니터)" : "";
                cmbMonitors.Items.Add($"모니터 {i + 1}: {screen.Bounds.Width}x{screen.Bounds.Height}{isPrimary}");
            }
            
            if (cmbMonitors.Items.Count > 0)
            {
                cmbMonitors.SelectedIndex = 0;
            }
            
            AppendLog($"모니터 {screens.Length}개 감지됨");
        }
        
        /// <summary>
        /// ADB 찾기 버튼 클릭
        /// </summary>
        private void BtnBrowseAdb_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new Microsoft.Win32.OpenFileDialog
            {
                Filter = "ADB 실행 파일|adb.exe|모든 파일|*.*",
                Title = "ADB 실행 파일 선택"
            };
            
            if (dialog.ShowDialog() == true)
            {
                txtAdbPath.Text = dialog.FileName;
                AppendLog($"ADB 경로 설정: {dialog.FileName}");
            }
        }
        
        /// <summary>
        /// 디바이스 새로고침 버튼 클릭
        /// </summary>
        private void BtnRefreshDevices_Click(object sender, RoutedEventArgs e)
        {
            RefreshDevices();
        }
        
        /// <summary>
        /// 디바이스 목록 새로고침
        /// </summary>
        private void RefreshDevices()
        {
            cmbDevices.Items.Clear();
            
            try
            {
                var adbPath = txtAdbPath.Text;
                if (!File.Exists(adbPath))
                {
                    AppendLog("[오류] ADB 파일을 찾을 수 없습니다.");
                    return;
                }
                
                var startInfo = new ProcessStartInfo
                {
                    FileName = adbPath,
                    Arguments = "devices -l",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true
                };
                
                using var process = Process.Start(startInfo);
                var output = process?.StandardOutput.ReadToEnd() ?? "";
                process?.WaitForExit(5000);
                
                // 출력 파싱
                var lines = output.Split('\n').Skip(1); // 첫 줄(List of devices...) 제외
                foreach (var line in lines)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    
                    var parts = line.Trim().Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 2 && parts[1] == "device")
                    {
                        var serial = parts[0];
                        var model = Regex.Match(line, @"model:(\S+)").Groups[1].Value;
                        var displayName = string.IsNullOrEmpty(model) ? serial : $"{serial} ({model})";
                        
                        cmbDevices.Items.Add(new DeviceItem { Serial = serial, DisplayName = displayName });
                    }
                }
                
                if (cmbDevices.Items.Count > 0)
                {
                    cmbDevices.SelectedIndex = 0;
                    AppendLog($"디바이스 {cmbDevices.Items.Count}개 발견됨");
                }
                else
                {
                    AppendLog("[경고] 연결된 디바이스가 없습니다.");
                }
            }
            catch (Exception ex)
            {
                _logger.Error("디바이스 목록 새로고침 실패", ex);
                AppendLog($"[오류] 디바이스 목록 조회 실패: {ex.Message}");
            }
        }
        
        /// <summary>
        /// 모니터 선택 변경
        /// </summary>
        private void CmbMonitors_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            UpdateMapperIfNeeded();
        }
        
        /// <summary>
        /// 해상도 적용 버튼 클릭
        /// </summary>
        private void BtnApplyResolution_Click(object sender, RoutedEventArgs e)
        {
            UpdateMapperIfNeeded();
        }
        
        /// <summary>
        /// CoordinateMapper 업데이트
        /// </summary>
        private void UpdateMapperIfNeeded()
        {
            if (!int.TryParse(txtPhoneWidth.Text, out var width) || width <= 0)
            {
                AppendLog("[오류] 유효하지 않은 가로 해상도");
                return;
            }
            
            if (!int.TryParse(txtPhoneHeight.Text, out var height) || height <= 0)
            {
                AppendLog("[오류] 유효하지 않은 세로 해상도");
                return;
            }
            
            var monitorIndex = cmbMonitors.SelectedIndex;
            if (monitorIndex < 0) monitorIndex = 0;
            
            if (_mapper != null)
            {
                _mapper.SafeModeEntered -= OnSafeModeEntered;
            }
            
            _mapper = new CoordinateMapper(width, height, monitorIndex);
            _mapper.SafeModeEntered += OnSafeModeEntered;
            
            UpdateScaleInfo();
            AppendLog($"좌표 매퍼 설정: 모니터 {monitorIndex + 1}, 스마트폰 {width}x{height}");
        }
        
        /// <summary>
        /// 스케일 정보 업데이트
        /// </summary>
        private void UpdateScaleInfo()
        {
            if (_mapper != null)
            {
                txtScaleInfo.Text = $"X: {_mapper.ScaleX:F4}, Y: {_mapper.ScaleY:F4}";
            }
        }
        
        /// <summary>
        /// 캡처 시작 버튼 클릭
        /// </summary>
        private void BtnStart_Click(object sender, RoutedEventArgs e)
        {
            StartCapture();
        }
        
        /// <summary>
        /// 캡처 시작
        /// </summary>
        private void StartCapture()
        {
            // 유효성 검사
            if (_mapper == null)
            {
                UpdateMapperIfNeeded();
            }
            
            if (_mapper == null || _mapper.IsSafeMode)
            {
                AppendLog("[오류] CoordinateMapper가 초기화되지 않았거나 안전 모드입니다.");
                return;
            }
            
            var selectedDevice = cmbDevices.SelectedItem as DeviceItem;
            if (selectedDevice == null)
            {
                AppendLog("[오류] 디바이스를 선택해주세요.");
                return;
            }
            
            var adbPath = txtAdbPath.Text;
            if (!File.Exists(adbPath))
            {
                AppendLog("[오류] ADB 파일을 찾을 수 없습니다.");
                return;
            }
            
            try
            {
                _inputManager?.Dispose();
                _inputManager = new InputManager(_mapper, adbPath, selectedDevice.Serial);
                _inputManager.TouchEventSent += OnTouchEventSent;
                _inputManager.ErrorOccurred += OnErrorOccurred;
                _inputManager.StartCapture();
                
                // UI 업데이트
                btnStart.IsEnabled = false;
                btnStop.IsEnabled = true;
                indicatorCapture.Fill = new SolidColorBrush(Color.FromRgb(76, 175, 80)); // 녹색
                txtCaptureStatus.Text = "캡처 중";
                
                _sentCount = 0;
                _errorCount = 0;
                
                AppendLog($"캡처 시작: {selectedDevice.DisplayName}");
            }
            catch (Exception ex)
            {
                _logger.Error("캡처 시작 실패", ex);
                AppendLog($"[오류] 캡처 시작 실패: {ex.Message}");
            }
        }
        
        /// <summary>
        /// 캡처 중지 버튼 클릭
        /// </summary>
        private void BtnStop_Click(object sender, RoutedEventArgs e)
        {
            StopCapture();
        }
        
        /// <summary>
        /// 캡처 중지
        /// </summary>
        private void StopCapture()
        {
            _inputManager?.StopCapture();
            
            // UI 업데이트
            btnStart.IsEnabled = true;
            btnStop.IsEnabled = false;
            indicatorCapture.Fill = new SolidColorBrush(Color.FromRgb(224, 224, 224)); // 회색
            txtCaptureStatus.Text = "캡처 중지됨";
            
            AppendLog("캡처 중지됨");
        }
        
        /// <summary>
        /// 안전 모드 해제 버튼 클릭
        /// </summary>
        private void BtnResetSafeMode_Click(object sender, RoutedEventArgs e)
        {
            _mapper?.ExitSafeMode();
            
            indicatorSafeMode.Fill = new SolidColorBrush(Color.FromRgb(224, 224, 224));
            txtSafeModeStatus.Text = "정상 모드";
            btnResetSafeMode.Visibility = Visibility.Collapsed;
            btnStart.IsEnabled = true;
            
            AppendLog("안전 모드 해제됨");
        }
        
        /// <summary>
        /// 터치 이벤트 전송 완료 핸들러
        /// </summary>
        private void OnTouchEventSent(object? sender, TouchEventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                _sentCount++;
                txtLastPhoneCoord.Text = $"Phone: ({e.X}, {e.Y})";
                txtEventCount.Text = $"전송: {_sentCount} / 오류: {_errorCount}";
            });
        }
        
        /// <summary>
        /// 오류 발생 핸들러
        /// </summary>
        private void OnErrorOccurred(object? sender, string message)
        {
            Dispatcher.Invoke(() =>
            {
                _errorCount++;
                txtEventCount.Text = $"전송: {_sentCount} / 오류: {_errorCount}";
                AppendLog($"[오류] {message}");
            });
        }
        
        /// <summary>
        /// 안전 모드 진입 핸들러
        /// </summary>
        private void OnSafeModeEntered(object? sender, SafeModeEventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                StopCapture();
                
                indicatorSafeMode.Fill = new SolidColorBrush(Color.FromRgb(244, 67, 54)); // 빨강
                txtSafeModeStatus.Text = $"안전 모드: {e.Reason}";
                btnResetSafeMode.Visibility = Visibility.Visible;
                btnStart.IsEnabled = false;
                
                AppendLog($"[경고] 안전 모드 진입: {e.Reason}");
            });
        }
        
        /// <summary>
        /// 로그 추가
        /// </summary>
        private void AppendLog(string message)
        {
            var timestamp = DateTime.Now.ToString("HH:mm:ss");
            txtLog.Text = $"[{timestamp}] {message}\n{txtLog.Text}";
            
            // 로그 길이 제한
            if (txtLog.Text.Length > 5000)
            {
                txtLog.Text = txtLog.Text.Substring(0, 4000);
            }
        }
        
        /// <summary>
        /// 윈도우 닫기 이벤트
        /// </summary>
        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            _inputManager?.Dispose();
            _logger.Info("애플리케이션 종료");
        }
    }
    
    /// <summary>
    /// 디바이스 항목
    /// </summary>
    public class DeviceItem
    {
        public string Serial { get; set; } = "";
        public string DisplayName { get; set; } = "";
        
        public override string ToString() => DisplayName;
    }
}
