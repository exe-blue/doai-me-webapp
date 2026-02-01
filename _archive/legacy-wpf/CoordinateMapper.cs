using System;
using System.Drawing;
using System.Windows.Forms;

namespace DoaiDeviceFarm.Client
{
    /// <summary>
    /// PC 화면 좌표를 스마트폰 터치 좌표로 변환하는 매핑 클래스
    /// 다중 모니터 환경과 다양한 해상도 비율을 처리합니다.
    /// </summary>
    public class CoordinateMapper
    {
        // PC 화면 영역 (미러링 대상 영역)
        private Rectangle _pcScreenBounds;
        
        // 스마트폰 해상도
        private Size _phoneResolution;
        
        // 스케일 비율
        private double _scaleX;
        private double _scaleY;
        
        // 안전 모드 상태
        public bool IsSafeMode { get; private set; }
        
        // 로거
        private readonly Logger _logger;
        
        // 이벤트: 안전 모드 진입 시 발생
        public event EventHandler<SafeModeEventArgs>? SafeModeEntered;
        
        /// <summary>
        /// CoordinateMapper 생성자
        /// </summary>
        /// <param name="phoneWidth">스마트폰 가로 해상도</param>
        /// <param name="phoneHeight">스마트폰 세로 해상도</param>
        /// <param name="monitorIndex">사용할 모니터 인덱스 (기본: 주 모니터)</param>
        public CoordinateMapper(int phoneWidth, int phoneHeight, int monitorIndex = 0)
        {
            _logger = Logger.Instance;
            _phoneResolution = new Size(phoneWidth, phoneHeight);
            
            try
            {
                InitializeScreenBounds(monitorIndex);
                CalculateScaleFactors();
                
                _logger.Info($"CoordinateMapper 초기화 완료: PC({_pcScreenBounds.Width}x{_pcScreenBounds.Height}) -> Phone({phoneWidth}x{phoneHeight})");
                _logger.Info($"스케일 비율: X={_scaleX:F4}, Y={_scaleY:F4}");
            }
            catch (Exception ex)
            {
                _logger.Error($"CoordinateMapper 초기화 실패: {ex.Message}", ex);
                EnterSafeMode("초기화 실패");
            }
        }
        
        /// <summary>
        /// 모니터 경계 초기화
        /// </summary>
        private void InitializeScreenBounds(int monitorIndex)
        {
            var screens = Screen.AllScreens;
            
            if (monitorIndex < 0 || monitorIndex >= screens.Length)
            {
                _logger.Warning($"모니터 인덱스 {monitorIndex}가 범위를 벗어남. 주 모니터 사용.");
                _pcScreenBounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
            }
            else
            {
                _pcScreenBounds = screens[monitorIndex].Bounds;
            }
            
            _logger.Debug($"모니터 {monitorIndex} 선택: {_pcScreenBounds}");
        }
        
        /// <summary>
        /// 스케일 비율 계산
        /// </summary>
        private void CalculateScaleFactors()
        {
            if (_pcScreenBounds.Width <= 0 || _pcScreenBounds.Height <= 0)
            {
                throw new InvalidOperationException("PC 화면 크기가 유효하지 않습니다.");
            }
            
            if (_phoneResolution.Width <= 0 || _phoneResolution.Height <= 0)
            {
                throw new InvalidOperationException("스마트폰 해상도가 유효하지 않습니다.");
            }
            
            _scaleX = (double)_phoneResolution.Width / _pcScreenBounds.Width;
            _scaleY = (double)_phoneResolution.Height / _pcScreenBounds.Height;
        }
        
        /// <summary>
        /// PC 마우스 좌표를 스마트폰 터치 좌표로 변환
        /// </summary>
        /// <param name="pcX">PC X 좌표 (절대 좌표)</param>
        /// <param name="pcY">PC Y 좌표 (절대 좌표)</param>
        /// <returns>변환된 스마트폰 좌표</returns>
        public Point MapToPhone(int pcX, int pcY)
        {
            if (IsSafeMode)
            {
                _logger.Warning("안전 모드 상태에서 좌표 변환 시도됨. 화면 중앙 반환.");
                return new Point(_phoneResolution.Width / 2, _phoneResolution.Height / 2);
            }
            
            try
            {
                // 다중 모니터 엣지 케이스 처리: 좌표가 해당 모니터 영역 내에 있는지 확인
                if (!IsWithinMonitorBounds(pcX, pcY))
                {
                    _logger.Warning($"좌표 ({pcX}, {pcY})가 모니터 영역 외부. 클램핑 적용.");
                    (pcX, pcY) = ClampToMonitorBounds(pcX, pcY);
                }
                
                // 모니터 기준 상대 좌표로 변환
                int relativeX = pcX - _pcScreenBounds.X;
                int relativeY = pcY - _pcScreenBounds.Y;
                
                // 스케일 적용
                int phoneX = (int)Math.Round(relativeX * _scaleX);
                int phoneY = (int)Math.Round(relativeY * _scaleY);
                
                // 스마트폰 해상도 범위 내로 클램핑
                phoneX = Math.Clamp(phoneX, 0, _phoneResolution.Width - 1);
                phoneY = Math.Clamp(phoneY, 0, _phoneResolution.Height - 1);
                
                _logger.Debug($"좌표 변환: PC({pcX}, {pcY}) -> Phone({phoneX}, {phoneY})");
                
                return new Point(phoneX, phoneY);
            }
            catch (Exception ex)
            {
                _logger.Error($"좌표 변환 중 오류: {ex.Message}", ex);
                EnterSafeMode("좌표 변환 오류");
                return new Point(_phoneResolution.Width / 2, _phoneResolution.Height / 2);
            }
        }
        
        /// <summary>
        /// 좌표가 현재 모니터 영역 내에 있는지 확인
        /// </summary>
        public bool IsWithinMonitorBounds(int x, int y)
        {
            return x >= _pcScreenBounds.Left && x < _pcScreenBounds.Right &&
                   y >= _pcScreenBounds.Top && y < _pcScreenBounds.Bottom;
        }        
        /// <summary>
        /// 좌표를 모니터 영역 내로 클램핑
        /// </summary>
        private (int x, int y) ClampToMonitorBounds(int x, int y)
        {
            int clampedX = Math.Clamp(x, _pcScreenBounds.Left, _pcScreenBounds.Right);
            int clampedY = Math.Clamp(y, _pcScreenBounds.Top, _pcScreenBounds.Bottom);
            return (clampedX, clampedY);
        }
        
        /// <summary>
        /// 안전 모드 진입
        /// </summary>
        public void EnterSafeMode(string reason)
        {
            if (IsSafeMode) return;
            
            IsSafeMode = true;
            _logger.Warning($"안전 모드 진입: {reason}");
            
            SafeModeEntered?.Invoke(this, new SafeModeEventArgs(reason));
        }
        
        /// <summary>
        /// 안전 모드 해제
        /// </summary>
        public void ExitSafeMode()
        {
            if (!IsSafeMode) return;
            
            IsSafeMode = false;
            _logger.Info("안전 모드 해제됨");
        }
        
        /// <summary>
        /// 스마트폰 해상도 업데이트
        /// </summary>
        public void UpdatePhoneResolution(int width, int height)
        {
            if (width <= 0 || height <= 0)
            {
                _logger.Error($"유효하지 않은 해상도: {width}x{height}");
                EnterSafeMode("유효하지 않은 해상도");
                return;
            }
            
            _phoneResolution = new Size(width, height);
            CalculateScaleFactors();
            
            _logger.Info($"스마트폰 해상도 업데이트: {width}x{height}");
        }
        
        /// <summary>
        /// 모니터 변경
        /// </summary>
        public void ChangeMonitor(int monitorIndex)
        {
            try
            {
                InitializeScreenBounds(monitorIndex);
                CalculateScaleFactors();
                ExitSafeMode();
            }
            catch (Exception ex)
            {
                _logger.Error($"모니터 변경 실패: {ex.Message}", ex);
                EnterSafeMode("모니터 변경 실패");
            }
        }
        
        // 테스트용 속성
        public Rectangle PcScreenBounds => _pcScreenBounds;
        public Size PhoneResolution => _phoneResolution;
        public double ScaleX => _scaleX;
        public double ScaleY => _scaleY;
    }
    
    /// <summary>
    /// 안전 모드 이벤트 인자
    /// </summary>
    public class SafeModeEventArgs : EventArgs
    {
        public string Reason { get; }
        public DateTime Timestamp { get; }
        
        public SafeModeEventArgs(string reason)
        {
            Reason = reason;
            Timestamp = DateTime.Now;
        }
    }
}
