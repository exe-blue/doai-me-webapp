#!/usr/bin/env node

/**
 * verify-resources.js
 *
 * 빌드 전 필수 리소스 파일 존재 여부를 확인합니다.
 * - platform-tools (adb 바이너리)
 * - APK 파일
 *
 * 누락 시 다운로드 안내 메시지를 출력하고 에러로 종료합니다.
 */

const fs = require('fs');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');
const MONO_ROOT = path.resolve(PKG_ROOT, '..', '..');
const isWindows = process.platform === 'win32';

/**
 * 리소스 파일을 찾습니다.
 * 1순위: 패키지 로컬 (apps/desktop-agent/resources/)
 * 2순위: 모노레포 루트 (resources/)
 */
function findResource(subpath) {
  const local = path.join(PKG_ROOT, 'resources', subpath);
  if (fs.existsSync(local)) return local;
  const mono = path.join(MONO_ROOT, 'resources', subpath);
  if (fs.existsSync(mono)) return mono;
  return null;
}

const REQUIRED_RESOURCES = [
  {
    // adb.exe 또는 adb 중 하나만 있으면 OK (WSL에서 Windows 빌드 가능)
    subpaths: [
      path.join('platform-tools', 'adb.exe'),
      path.join('platform-tools', 'adb'),
    ],
    name: 'ADB (Android Debug Bridge)',
    downloadUrl: 'https://developer.android.com/tools/releases/platform-tools',
    instruction: `resources/platform-tools/ 디렉토리에 platform-tools를 압축 해제하세요.`,
  },
];

const OPTIONAL_APKS = [
  {
    subpath: path.join('apks', 'youtube.apk'),
    name: 'YouTube APK',
  },
  {
    subpath: path.join('apks', 'appium-settings.apk'),
    name: 'Appium Settings APK',
  },
];

let hasError = false;
let hasWarning = false;

console.log('\n🔍 리소스 검증 시작...\n');

// 필수 리소스 확인
for (const resource of REQUIRED_RESOURCES) {
  const candidates = resource.subpaths || [resource.subpath];
  let found = null;
  for (const sp of candidates) {
    found = findResource(sp);
    if (found) break;
  }
  if (found) {
    console.log(`  ✅ ${resource.name} (${found})`);
  } else {
    hasError = true;
    console.error(`  ❌ ${resource.name} — 파일 없음`);
    console.error(`     검색 경로:`);
    for (const sp of candidates) {
      console.error(`       - ${path.join(PKG_ROOT, 'resources', sp)}`);
      console.error(`       - ${path.join(MONO_ROOT, 'resources', sp)}`);
    }
    console.error(`     다운로드: ${resource.downloadUrl}`);
    console.error(`     ${resource.instruction}`);
  }
}

// 선택 APK 확인
for (const apk of OPTIONAL_APKS) {
  const found = findResource(apk.subpath);
  if (found) {
    console.log(`  ✅ ${apk.name} (${found})`);
  } else {
    hasWarning = true;
    console.warn(`  ⚠️  ${apk.name} — 파일 없음 (선택사항)`);
    console.warn(`     검색 경로:`);
    console.warn(`       - ${path.join(PKG_ROOT, 'resources', apk.subpath)}`);
    console.warn(`       - ${path.join(MONO_ROOT, 'resources', apk.subpath)}`);
  }
}

console.log('');

if (hasError) {
  console.error('❌ 필수 리소스가 누락되었습니다. 빌드를 중단합니다.');
  console.error('   위 다운로드 링크에서 파일을 받아 지정된 경로에 배치하세요.\n');
  process.exit(1);
}

if (hasWarning) {
  console.warn('⚠️  일부 선택 리소스가 누락되었습니다. 빌드는 계속됩니다.\n');
}

console.log('✅ 리소스 검증 완료\n');
