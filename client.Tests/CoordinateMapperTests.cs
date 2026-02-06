using System.Drawing;
using Xunit;

namespace DoaiDeviceFarm.Client.Tests
{
    /// <summary>
    /// CoordinateMapper 클래스의 단위 테스트
    /// PC 좌표가 스마트폰 좌표로 정확하게 변환되는지 검증합니다.
    /// </summary>
    public class CoordinateMapperTests
    {
        // 테스트용 상수
        private const int TEST_PC_WIDTH = 1920;
        private const int TEST_PC_HEIGHT = 1080;
        private const int TEST_PHONE_WIDTH = 1080;
        private const int TEST_PHONE_HEIGHT = 2400;
        
        #region 기본 좌표 변환 테스트
        
        [Fact]
        public void MapToPhone_Origin_ReturnsPhoneOrigin()
        {
            // Arrange: PC (0,0) -> Phone (0,0)
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            // Act
            var result = mapper.MapToPhone(pcBounds.X, pcBounds.Y);
            
            // Assert
            Assert.Equal(0, result.X);
            Assert.Equal(0, result.Y);
        }
        
        [Fact]
        public void MapToPhone_MaxCoordinates_ReturnsPhoneMaxCoordinates()
        {
            // Arrange: PC (Max, Max) -> Phone (Max-1, Max-1)
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            // Act
            var result = mapper.MapToPhone(pcBounds.Right, pcBounds.Bottom);
            
            // Assert: 클램핑으로 인해 최대값은 해상도-1
            Assert.Equal(TEST_PHONE_WIDTH - 1, result.X);
            Assert.Equal(TEST_PHONE_HEIGHT - 1, result.Y);
        }
        
        [Fact]
        public void MapToPhone_CenterCoordinates_ReturnsPhoneCenter()
        {
            // Arrange: PC 중앙 -> Phone 중앙
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            int pcCenterX = pcBounds.X + pcBounds.Width / 2;
            int pcCenterY = pcBounds.Y + pcBounds.Height / 2;
            
            // Act
            var result = mapper.MapToPhone(pcCenterX, pcCenterY);
            
            // Assert: 중앙 좌표는 각각 해상도의 절반
            Assert.Equal(TEST_PHONE_WIDTH / 2, result.X);
            Assert.Equal(TEST_PHONE_HEIGHT / 2, result.Y);
        }
        
        #endregion
        
        #region 스케일 비율 테스트
        
        [Fact]
        public void ScaleFactors_CalculatedCorrectly()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            // Act
            double expectedScaleX = (double)TEST_PHONE_WIDTH / pcBounds.Width;
            double expectedScaleY = (double)TEST_PHONE_HEIGHT / pcBounds.Height;
            
            // Assert
            Assert.Equal(expectedScaleX, mapper.ScaleX, 4);
            Assert.Equal(expectedScaleY, mapper.ScaleY, 4);
        }
        
        [Theory]
        [InlineData(1080, 1920)]   // 일반 Full HD 폰
        [InlineData(1440, 3200)]   // QHD+ 폰
        [InlineData(720, 1280)]    // HD 폰
        [InlineData(2160, 3840)]   // 4K 폰
        public void MapToPhone_DifferentPhoneResolutions_ScalesCorrectly(int phoneWidth, int phoneHeight)
        {
            // Arrange
            var mapper = new CoordinateMapper(phoneWidth, phoneHeight);
            var pcBounds = mapper.PcScreenBounds;
            
            // Act: PC 우하단 -> Phone 우하단
            var result = mapper.MapToPhone(pcBounds.Right, pcBounds.Bottom);
            
            // Assert: 클램핑 후 최대값
            Assert.Equal(phoneWidth - 1, result.X);
            Assert.Equal(phoneHeight - 1, result.Y);
        }
        
        #endregion
        
        #region 엣지 케이스 테스트 (다중 모니터 환경)
        
        [Fact]
        public void MapToPhone_NegativeCoordinates_ClampedToZero()
        {
            // Arrange: 음수 좌표 (다중 모니터에서 주 모니터 왼쪽에 모니터가 있는 경우)
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            
            // Act
            var result = mapper.MapToPhone(-100, -100);
            
            // Assert: 클램핑되어 (0, 0)이거나 안전 모드 중앙값
            Assert.True(result.X >= 0);
            Assert.True(result.Y >= 0);
        }
        
        [Fact]
        public void MapToPhone_VeryLargeCoordinates_ClampedToMax()
        {
            // Arrange: 매우 큰 좌표 (화면 영역 외부)
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            
            // Act
            var result = mapper.MapToPhone(10000, 10000);
            
            // Assert: 최대값으로 클램핑
            Assert.True(result.X <= TEST_PHONE_WIDTH - 1);
            Assert.True(result.Y <= TEST_PHONE_HEIGHT - 1);
        }
        
        [Fact]
        public void IsWithinMonitorBounds_InsideBounds_ReturnsTrue()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            int testX = pcBounds.X + pcBounds.Width / 2;
            int testY = pcBounds.Y + pcBounds.Height / 2;
            
            // Act
            var result = mapper.IsWithinMonitorBounds(testX, testY);
            
            // Assert
            Assert.True(result);
        }
        
        [Fact]
        public void IsWithinMonitorBounds_OutsideBounds_ReturnsFalse()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            // 모니터 영역 외부 좌표
            int outsideX = pcBounds.Right + 100;
            int outsideY = pcBounds.Bottom + 100;
            
            // Act
            var result = mapper.IsWithinMonitorBounds(outsideX, outsideY);
            
            // Assert
            Assert.False(result);
        }
        
        #endregion
        
        #region 안전 모드 테스트
        
        [Fact]
        public void EnterSafeMode_SetsIsSafeModeTrue()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            
            // Act
            mapper.EnterSafeMode("테스트");
            
            // Assert
            Assert.True(mapper.IsSafeMode);
        }
        
        [Fact]
        public void ExitSafeMode_SetsIsSafeModeFalse()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            mapper.EnterSafeMode("테스트");
            
            // Act
            mapper.ExitSafeMode();
            
            // Assert
            Assert.False(mapper.IsSafeMode);
        }
        
        [Fact]
        public void MapToPhone_InSafeMode_ReturnsCenterCoordinates()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            mapper.EnterSafeMode("테스트");
            
            // Act
            var result = mapper.MapToPhone(0, 0);
            
            // Assert: 안전 모드에서는 화면 중앙 반환
            Assert.Equal(TEST_PHONE_WIDTH / 2, result.X);
            Assert.Equal(TEST_PHONE_HEIGHT / 2, result.Y);
        }
        
        [Fact]
        public void SafeModeEntered_EventFired_WhenEnteringSafeMode()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            SafeModeEventArgs? receivedArgs = null;
            mapper.SafeModeEntered += (sender, args) => receivedArgs = args;
            
            // Act
            mapper.EnterSafeMode("테스트 이유");
            
            // Assert
            Assert.NotNull(receivedArgs);
            Assert.Equal("테스트 이유", receivedArgs!.Reason);
        }
        
        #endregion
        
        #region 해상도 업데이트 테스트
        
        [Fact]
        public void UpdatePhoneResolution_ValidResolution_UpdatesSuccessfully()
        {
            // Arrange
            var mapper = new CoordinateMapper(1080, 1920);
            
            // Act
            mapper.UpdatePhoneResolution(1440, 3200);
            
            // Assert
            Assert.Equal(1440, mapper.PhoneResolution.Width);
            Assert.Equal(3200, mapper.PhoneResolution.Height);
        }
        
        [Fact]
        public void UpdatePhoneResolution_InvalidResolution_EntersSafeMode()
        {
            // Arrange
            var mapper = new CoordinateMapper(1080, 1920);
            
            // Act
            mapper.UpdatePhoneResolution(0, 0);
            
            // Assert
            Assert.True(mapper.IsSafeMode);
        }
        
        [Fact]
        public void UpdatePhoneResolution_NegativeResolution_EntersSafeMode()
        {
            // Arrange
            var mapper = new CoordinateMapper(1080, 1920);
            
            // Act
            mapper.UpdatePhoneResolution(-100, -100);
            
            // Assert
            Assert.True(mapper.IsSafeMode);
        }
        
        #endregion
        
        #region 정밀도 테스트
        
        [Theory]
        [InlineData(100, 100)]
        [InlineData(500, 300)]
        [InlineData(960, 540)]  // 정확히 중앙
        [InlineData(1919, 1079)]  // 거의 최대
        public void MapToPhone_VariousCoordinates_MaintainsPrecision(int relativeX, int relativeY)
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            int pcX = pcBounds.X + relativeX;
            int pcY = pcBounds.Y + relativeY;
            
            // Act
            var result = mapper.MapToPhone(pcX, pcY);
            
            // 예상값 계산
            int expectedX = (int)Math.Round(relativeX * mapper.ScaleX);
            int expectedY = (int)Math.Round(relativeY * mapper.ScaleY);
            
            // 클램핑 적용
            expectedX = Math.Clamp(expectedX, 0, TEST_PHONE_WIDTH - 1);
            expectedY = Math.Clamp(expectedY, 0, TEST_PHONE_HEIGHT - 1);
            
            // Assert
            Assert.Equal(expectedX, result.X);
            Assert.Equal(expectedY, result.Y);
        }
        
        #endregion
        
        #region 경계값 테스트
        
        [Fact]
        public void MapToPhone_ExactBoundaryCoordinates_HandledCorrectly()
        {
            // Arrange
            var mapper = new CoordinateMapper(TEST_PHONE_WIDTH, TEST_PHONE_HEIGHT);
            var pcBounds = mapper.PcScreenBounds;
            
            // Act: 정확히 경계에 있는 좌표들
            var topLeft = mapper.MapToPhone(pcBounds.Left, pcBounds.Top);
            var topRight = mapper.MapToPhone(pcBounds.Right, pcBounds.Top);
            var bottomLeft = mapper.MapToPhone(pcBounds.Left, pcBounds.Bottom);
            var bottomRight = mapper.MapToPhone(pcBounds.Right, pcBounds.Bottom);
            
            // Assert
            Assert.Equal(0, topLeft.X);
            Assert.Equal(0, topLeft.Y);
            
            Assert.Equal(TEST_PHONE_WIDTH - 1, topRight.X);
            Assert.Equal(0, topRight.Y);
            
            Assert.Equal(0, bottomLeft.X);
            Assert.Equal(TEST_PHONE_HEIGHT - 1, bottomLeft.Y);
            
            Assert.Equal(TEST_PHONE_WIDTH - 1, bottomRight.X);
            Assert.Equal(TEST_PHONE_HEIGHT - 1, bottomRight.Y);
        }
        
        #endregion
    }
}
