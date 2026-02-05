/**
 * Account Step
 * 
 * 계정 설정: YouTube 계정 로그인 (수동 단계)
 * 이 단계는 사용자 개입이 필요한 수동 단계입니다.
 */

import { BaseStep, StepContext } from './BaseStep';

export class AccountStep extends BaseStep {
  constructor() {
    super('account');
  }

  protected async run(context: StepContext): Promise<Record<string, unknown>> {
    const { deviceSerial } = context;

    const results: Record<string, unknown> = {
      manual: true,
      instructions: [
        '1. YouTube 앱을 실행합니다',
        '2. Google 계정으로 로그인합니다',
        '3. 로그인 완료 후 이 단계를 완료로 표시합니다',
      ],
    };

    // 1. Google 계정 확인
    const accountsOutput = await this.shell(deviceSerial, 'dumpsys account');
    const googleAccounts = accountsOutput
      .split('\n')
      .filter(line => line.includes('name=') && line.includes('@gmail.com'))
      .map(line => {
        const match = line.match(/name=([^\s,]+@gmail\.com)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    results.existingGoogleAccounts = googleAccounts;
    results.hasGoogleAccount = googleAccounts.length > 0;

    // 2. YouTube 앱 설치 확인
    const youtubeInstalled = await this.isPackageInstalled(deviceSerial, 'com.google.android.youtube');
    results.youtubeInstalled = youtubeInstalled;

    if (!youtubeInstalled) {
      results.warning = 'YouTube app not installed. Please install it first.';
    }

    // 3. YouTube 앱이 설치되어 있고 계정이 있으면 자동 완료
    if (youtubeInstalled && googleAccounts.length > 0) {
      // YouTube 앱 데이터 확인 (로그인 여부)
      try {
        const ytDataOutput = await this.shell(deviceSerial, 
          'run-as com.google.android.youtube ls /data/data/com.google.android.youtube/shared_prefs/');
        
        // 로그인 데이터가 있는지 확인
        if (ytDataOutput.includes('youtube')) {
          results.youtubeLoggedIn = true;
          results.autoCompleted = true;
        }
      } catch {
        // run-as 권한 없음 - 수동 확인 필요
        results.youtubeLoggedIn = 'unknown';
        results.needsManualVerification = true;
      }
    }

    // 4. 수동 단계 안내
    if (!results.autoCompleted) {
      // YouTube 앱 실행
      if (youtubeInstalled) {
        try {
          await this.shell(deviceSerial, 
            'am start -n com.google.android.youtube/.HomeActivity');
          results.youtubeAppLaunched = true;
        } catch {
          results.youtubeAppLaunched = false;
        }
      }

      results.status = 'awaiting_manual_completion';
      results.message = 'Please log in to YouTube manually and mark this step as complete';
    }

    return results;
  }

  protected override async preValidate(context: StepContext): Promise<void> {
    // 기본 검증만 수행
    await super.preValidate(context);
  }

  protected override async postValidate(_context: StepContext): Promise<void> {
    // 수동 단계이므로 검증 생략
    // 사용자가 직접 완료 표시
  }
}

export default AccountStep;
