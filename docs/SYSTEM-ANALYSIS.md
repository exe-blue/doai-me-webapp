# DoAi.Me 시스템 분석 문서

> 작성일: 2026-01-29
> 버전: 1.0

## 1. 보안 요구사항

### 1.1 job.json 파일 관리 규칙

작업 파일 `/sdcard/job.json`은 모바일 에이전트와 데몬 간의 작업 정보 전달에 사용됩니다.

#### 파일 삭제 규칙

**중요**: `/sdcard/job.json` 파일은 **작업 종료 시 반드시 삭제**해야 합니다.

"작업 완료 후"는 다음 **모든 종료 상태**를 포함합니다:
- ✅ **성공 (Success)**: 작업이 정상적으로 완료된 경우
- ❌ **실패 (Failure)**: 에러 코드와 함께 작업이 실패한 경우  
- ⚠️ **예외 (Exception)**: 예상치 못한 런타임 에러가 발생한 경우
- ⏱️ **타임아웃 (Timeout)**: 작업 제한 시간을 초과한 경우
- 🚫 **취소 (Cancelled)**: 사용자 또는 시스템에 의해 취소된 경우

```javascript
// 예시: AutoX.js에서 종료 시 파일 삭제
async function cleanupJobFile() {
    try {
        const jobFilePath = "/sdcard/job.json";
        if (files.exists(jobFilePath)) {
            files.remove(jobFilePath);
            console.log("job.json 파일 삭제 완료");
        }
    } catch (e) {
        console.error("job.json 삭제 실패:", e);
    }
}

// 모든 종료 경로에서 호출
process.on('exit', cleanupJobFile);
process.on('uncaughtException', (err) => {
    cleanupJobFile();
    throw err;
});
```

#### 민감 정보 저장 금지

**`job.json`에는 민감한 정보를 절대 저장하지 않습니다:**

- ❌ API 키 (supabase_key, anon_key 등)
- ❌ 인증 토큰 (JWT, access_token 등)
- ❌ 비밀번호 또는 자격 증명
- ❌ 개인 식별 정보 (PII)

`job.json`에 저장 가능한 정보:
- ✅ 작업 ID (`job_id`, `assignment_id`)
- ✅ 대상 URL (`target_url`)
- ✅ 스크립트 타입 (`script_type`)
- ✅ 작업 파라미터 (`duration_min_pct`, `prob_like` 등)
- ✅ Supabase URL (`supabase_url` - 공개 엔드포인트)

---

### 1.2 supabase_key 보안 로드 가이드

`supabase_key` (anon key 또는 service role key)는 민감한 정보이므로 안전하게 관리해야 합니다.

#### AutoX.js 환경 (Mobile Bot - 스크립트)

AutoX.js 환경에서는 **환경변수**를 통해 키를 로드합니다.

**환경변수 네이밍 규칙:**
| 환경변수명 | 용도 | 예시 |
|-----------|------|------|
| `SUPABASE_ANON_KEY` | 클라이언트용 익명 키 | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |
| `SUPABASE_SERVICE_KEY` | 서버용 서비스 롤 키 (사용 자제) | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |

**AutoX.js 환경변수 사용 예시:**
```javascript
// 환경변수에서 키 로드 (권장)
const SUPABASE_KEY = $env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_KEY) {
    throw new Error("SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다");
}

// Supabase 클라이언트 초기화
const supabaseUrl = config.supabase_url || $env.get("SUPABASE_URL");
// supabase 클라이언트 생성 시 사용
```

**환경변수 설정 방법 (AutoX.js):**
1. AutoX.js 앱 설정 → 환경변수 설정
2. 또는 시작 스크립트에서 `$env.set()` 사용 (권장하지 않음 - 로그에 노출 가능)

#### Android 앱 환경 (네이티브 데몬)

Android 네이티브 앱에서는 **Android Keystore** 또는 **암호화된 설정 파일**을 사용합니다.

##### 방법 1: Android Keystore 사용 (권장)

**키 네이밍 규칙:**
| 키 식별자 (Alias) | 용도 |
|------------------|------|
| `doaime_supabase_anon_key` | Supabase 익명 키 저장 |
| `doaime_supabase_service_key` | Supabase 서비스 롤 키 저장 |

**접근 권한 정책:**
```kotlin
// KeyStore 초기화
val keyStore = KeyStore.getInstance("AndroidKeyStore").apply {
    load(null)
}

// 키 생성 파라미터 (API 23+)
val keyGenParameterSpec = KeyGenParameterSpec.Builder(
    "doaime_supabase_anon_key",
    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
    .setUserAuthenticationRequired(false) // 앱 실행 시 자동 접근 필요
    .build()

// 키 쿼리 방식
val secretKeyEntry = keyStore.getEntry("doaime_supabase_anon_key", null) as KeyStore.SecretKeyEntry
val secretKey = secretKeyEntry.secretKey
```

##### 방법 2: 암호화된 설정 파일

Android Keystore를 사용할 수 없는 환경에서의 대안입니다.

**파일 권한:**
- 위치: `/data/data/{package_name}/files/secure_config.enc`
- 권한: `MODE_PRIVATE` (앱 전용, `0600`)
- 다른 앱 접근 불가

**암호화 방식:**
- 알고리즘: AES-256-GCM
- 키 파생: PBKDF2WithHmacSHA256 (반복 횟수: 100,000 이상)
- IV: 각 암호화마다 랜덤 생성 (12바이트)

**키 관리:**
- 마스터 키는 Android Keystore에 저장
- 설정 파일 암호화 키는 마스터 키로 암호화하여 별도 저장

```kotlin
// 암호화된 설정 파일 읽기 예시
object SecureConfigManager {
    private const val CONFIG_FILE = "secure_config.enc"
    private const val KEY_ALIAS = "doaime_master_key"
    
    fun getSupabaseKey(context: Context): String {
        val encryptedData = context.openFileInput(CONFIG_FILE).readBytes()
        val masterKey = getMasterKeyFromKeystore(KEY_ALIAS)
        return decrypt(encryptedData, masterKey)
    }
}
```

**안전한 저장 위치:**
| 위치 | 보안 수준 | 용도 |
|-----|---------|------|
| `/data/data/{pkg}/files/` | 높음 (앱 샌드박스) | 암호화된 설정 파일 |
| `/data/data/{pkg}/shared_prefs/` | 중간 | 암호화된 SharedPreferences |
| `/sdcard/` | 낮음 ⚠️ | **절대 사용 금지** |

---

## 2. 설정 스키마

### 2.1 job.json 스키마

다음은 `/sdcard/job.json` 파일의 JSON 스키마입니다.

<!-- 
  주의: 아래 JSON 스키마 내에는 주석을 사용할 수 없습니다.
  모든 설명은 "description" 필드에 포함되어 있습니다.
-->

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JobConfig",
  "type": "object",
  "required": ["job_id", "assignment_id", "supabase_url", "target_url", "script_type"],
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid",
      "description": "작업 고유 식별자"
    },
    "assignment_id": {
      "type": "string",
      "format": "uuid",
      "description": "할당 고유 식별자"
    },
    "supabase_url": {
      "type": "string",
      "format": "uri",
      "description": "Supabase API URL (공개 URL). Mobile Bot은 환경변수 SUPABASE_URL을 우선 확인하고, 없을 경우 이 값 사용"
    },
    "target_url": {
      "type": "string",
      "format": "uri",
      "description": "작업 대상 URL (예: YouTube 영상)"
    },
    "script_type": {
      "type": "string",
      "enum": ["youtube_watch", "youtube_shorts", "youtube_subscribe"],
      "description": "실행할 스크립트 타입"
    },
    "duration_min_pct": {
      "type": "integer",
      "minimum": 10,
      "maximum": 100,
      "default": 30,
      "description": "최소 시청 비율 (%)"
    },
    "duration_max_pct": {
      "type": "integer",
      "minimum": 10,
      "maximum": 100,
      "default": 90,
      "description": "최대 시청 비율 (%)"
    },
    "prob_like": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "default": 50,
      "description": "좋아요 확률 (%)"
    },
    "prob_comment": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "default": 30,
      "description": "댓글 확률 (%)"
    }
  },
  "additionalProperties": false
}
```

> **보안 주의사항**: 
> - `supabase_key`는 이 파일에 **절대 포함하지 않습니다**
> - 위 1.2절의 보안 로드 가이드를 참조하세요

---

### 2.2 supabase_url 로드 전략

`supabase_url`은 공개 엔드포인트이므로 `job.json`에 포함할 수 있습니다.

#### 로드 우선순위 (Priority Order)

**환경변수가 job.json보다 우선합니다:**

```
1순위: 환경변수 SUPABASE_URL
2순위: job.json의 supabase_url 필드
3순위: 하드코딩된 기본값 (fallback, 권장하지 않음)
```

이 전략의 이유:
- **개발 환경**: `job.json`에 로컬/스테이징 URL 사용
- **프로덕션 환경**: 환경변수로 프로덕션 URL 오버라이드

#### 구현 예시

```javascript
// supabase_url 로드 함수
function getSupabaseUrl(jobConfig) {
    // 1순위: 환경변수 (ENV_SUPABASE_URL 또는 SUPABASE_URL)
    const envUrl = $env.get("SUPABASE_URL") || $env.get("ENV_SUPABASE_URL");
    if (envUrl) {
        console.log("supabase_url: 환경변수에서 로드");
        return envUrl;
    }
    
    // 2순위: job.json 설정
    if (jobConfig && jobConfig.supabase_url) {
        console.log("supabase_url: job.json에서 로드");
        return jobConfig.supabase_url;
    }
    
    // 3순위: 기본값 (권장하지 않음)
    console.warn("supabase_url: 기본값 사용 (권장하지 않음)");
    return "https://your-project.supabase.co";
}

// 사용 예시
const jobConfig = JSON.parse(files.read("/sdcard/job.json"));
const supabaseUrl = getSupabaseUrl(jobConfig);
```

#### 배포 환경별 설정

| 환경 | supabase_url 소스 | 설정 방법 |
|-----|------------------|----------|
| 개발 (dev) | `job.json` | 테스트 프로젝트 URL 하드코딩 |
| 스테이징 (staging) | 환경변수 | `SUPABASE_URL` 환경변수 설정 |
| 프로덕션 (prod) | 환경변수 | `SUPABASE_URL` 환경변수 설정 |

---

## 3. 런타임 검증 체크리스트

코드 구현 시 다음 사항을 확인하세요:

- [ ] `job.json` 파싱 전 파일 존재 여부 확인
- [ ] 모든 종료 경로에서 `/sdcard/job.json` 삭제 로직 포함
- [ ] `supabase_key`가 `job.json`에 포함되지 않았는지 검증
- [ ] 환경변수에서 `SUPABASE_ANON_KEY` 로드 확인
- [ ] `supabase_url` 로드 시 우선순위 준수 (환경변수 > job.json)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0 | 2026-01-29 | 보안 요구사항 및 설정 스키마 문서화 |
