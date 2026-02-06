/**
 * Network Step
 * 
 * 네트워크 설정: WiFi, 프록시 설정 (선택적)
 */

import { BaseStep, StepContext } from './BaseStep';

export class NetworkStep extends BaseStep {
  constructor() {
    super('network');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial, config } = context;
    const { network } = config;

    const results: Record<string, unknown> = {
      wifiConfigured: false,
      proxyConfigured: false,
    };

    // 1. 현재 네트워크 상태 확인
    const wifiState = await this.shell(deviceSerial, 'dumpsys wifi');
    const isWifiEnabled = wifiState.includes('Wi-Fi is enabled');
    const isConnected = wifiState.includes('mNetworkInfo');

    results.currentState = {
      wifiEnabled: isWifiEnabled,
      connected: isConnected,
    };

    // 2. WiFi 설정 (제공된 경우)
    if (network?.wifi) {
      const { ssid, password } = network.wifi;
      
      try {
        // WiFi 활성화
        if (!isWifiEnabled) {
          await this.shell(deviceSerial, 'svc wifi enable');
          await this.sleep(3000); // WiFi 활성화 대기
        }

        // WiFi 연결 (Android 10+에서는 제한됨)
        // 참고: 일부 기기에서는 수동 연결 필요
        try {
          await this.shell(deviceSerial, 
            `cmd wifi connect-network '${ssid}' wpa2 '${password}'`);
          await this.sleep(5000); // 연결 대기
          results.wifiConfigured = true;
        } catch {
          // Android 버전에 따라 실패할 수 있음
          results.wifiNote = 'Auto-connect not supported, manual connection required';
        }

      } catch (error) {
        results.wifiError = error instanceof Error ? error.message : String(error);
      }
    }

    // 3. 프록시 설정 (제공된 경우)
    if (network?.proxy) {
      const { host, port } = network.proxy;
      
      try {
        // 글로벌 HTTP 프록시 설정
        await this.putSetting(deviceSerial, 'global', 'http_proxy', `${host}:${port}`);
        await this.putSetting(deviceSerial, 'global', 'global_http_proxy_host', host);
        await this.putSetting(deviceSerial, 'global', 'global_http_proxy_port', port.toString());
        
        results.proxyConfigured = true;
        results.proxy = { host, port };
      } catch (error) {
        results.proxyError = error instanceof Error ? error.message : String(error);
      }
    }

    // 4. 인터넷 연결 테스트
    try {
      const pingResult = await this.shell(deviceSerial, 'ping -c 1 -W 5 8.8.8.8');
      results.internetConnected = pingResult.includes('1 received');
    } catch {
      results.internetConnected = false;
    }

    // 5. 모바일 데이터 비활성화 (WiFi 우선)
    try {
      await this.shell(deviceSerial, 'svc data disable');
      results.mobileDataDisabled = true;
    } catch {
      results.mobileDataDisabled = false;
    }

    // 6. 비행기 모드 해제 확인
    const airplaneMode = await this.getSetting(deviceSerial, 'global', 'airplane_mode_on');
    if (airplaneMode === '1') {
      await this.putSetting(deviceSerial, 'global', 'airplane_mode_on', '0');
      await this.shell(deviceSerial, 
        'am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false');
    }
    results.airplaneModeOff = true;

    return results;
  }

  protected override async postValidate(context: StepContext): Promise<void> {
    const { deviceSerial } = context;
    
    // 인터넷 연결 확인 (필수는 아님)
    try {
      const ping = await this.shell(deviceSerial, 'ping -c 1 -W 5 8.8.8.8');
      if (!ping.includes('1 received')) {
        console.warn('[Onboarding] Network step: Internet not connected');
      }
    } catch {
      console.warn('[Onboarding] Network step: Could not verify internet connection');
    }
  }
}

export default NetworkStep;
