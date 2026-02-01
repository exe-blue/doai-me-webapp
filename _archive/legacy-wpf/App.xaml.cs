using System.Windows;

namespace DoaiDeviceFarm.Client
{
    /// <summary>
    /// App.xaml 코드 비하인드
    /// </summary>
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            
            // 전역 예외 핸들러 등록
            DispatcherUnhandledException += (sender, args) =>
            {
                Logger.Instance.Error("처리되지 않은 예외 발생", args.Exception);
                MessageBox.Show($"예기치 않은 오류가 발생했습니다.\n\n{args.Exception.Message}",
                    "오류", MessageBoxButton.OK, MessageBoxImage.Error);
                args.Handled = true;
            };
            
            Logger.Instance.Info("애플리케이션 시작");
        }
    }
}
