"""
YouTube 리소스 ID, 셀렉터, 타임아웃 상수

YouTube UI 변경 시 이 파일만 수정하면 됨.
다중 셀렉터 폴백으로 UI 변경에 대한 내성 확보.
"""

# ============================================
# 앱 정보
# ============================================

YOUTUBE_PACKAGE = "com.google.android.youtube"
YOUTUBE_ACTIVITY = "com.google.android.youtube.HomeActivity"

# ============================================
# 타임아웃 (초)
# ============================================

TIMEOUT_APP_LAUNCH = 15
TIMEOUT_ELEMENT_DEFAULT = 10
TIMEOUT_ELEMENT_SHORT = 3
TIMEOUT_ELEMENT_LONG = 20
TIMEOUT_SEARCH = 10
TIMEOUT_VIDEO_LOAD = 15
TIMEOUT_AD_CHECK = 3

# ============================================
# 검색 관련 셀렉터 (폴백 체인)
# ============================================

# 검색 버튼 (홈 화면)
SEARCH_BUTTON_SELECTORS = [
    ("accessibility_id", "Search"),
    ("accessibility_id", "검색"),
    ("id", "menu_item_1"),
    ("xpath", '//android.widget.ImageView[@content-desc="Search"]'),
    ("xpath", '//android.widget.ImageView[@content-desc="검색"]'),
]

# 검색 입력 필드
SEARCH_INPUT_SELECTORS = [
    ("id", "search_edit_text"),
    ("class_name", "android.widget.EditText"),
    ("xpath", '//android.widget.EditText[@resource-id="com.google.android.youtube:id/search_edit_text"]'),
]

# 검색 결과 영상 제목
SEARCH_RESULT_VIDEO_SELECTORS = [
    ("id", "video_title"),
    ("xpath", '//android.widget.TextView[@resource-id="com.google.android.youtube:id/video_title"]'),
]

# ============================================
# 영상 재생 관련 셀렉터
# ============================================

# 영상 플레이어
PLAYER_VIEW_SELECTORS = [
    ("id", "player_view"),
    ("id", "watch_player"),
    ("xpath", '//android.widget.FrameLayout[@resource-id="com.google.android.youtube:id/player_view"]'),
]

# 재생 시간 표시
TIME_BAR_SELECTORS = [
    ("id", "time_bar_current_time"),
    ("id", "player_control_play_pause_replay_button"),
]

# ============================================
# 광고 관련 셀렉터
# ============================================

AD_SKIP_BUTTON_SELECTORS = [
    ("id", "skip_ad_button"),
    ("text", "Skip ad"),
    ("text", "Skip ads"),
    ("text", "광고 건너뛰기"),
    ("text_contains", "Skip"),
    ("text_contains", "건너뛰"),
    ("xpath", '//android.widget.Button[contains(@text, "Skip")]'),
    ("xpath", '//android.widget.Button[contains(@text, "건너뛰")]'),
    ("id", "ad_progress_text"),
]

AD_INDICATOR_SELECTORS = [
    ("id", "ad_progress_text"),
    ("text_contains", "Ad"),
    ("text_contains", "광고"),
    ("id", "ad_countdown"),
]

# ============================================
# 좋아요/댓글/구독 셀렉터
# ============================================

LIKE_BUTTON_SELECTORS = [
    ("accessibility_id", "like this video along with"),
    ("desc_contains", "like this video"),
    ("desc_contains", "이 동영상 좋아요"),
    ("id", "like_button"),
    ("xpath", '//android.widget.Button[contains(@content-desc, "like")]'),
]

DISLIKE_BUTTON_SELECTORS = [
    ("accessibility_id", "Dislike this video"),
    ("desc_contains", "dislike"),
    ("desc_contains", "싫어요"),
]

COMMENT_BUTTON_SELECTORS = [
    ("id", "comment_button"),
    ("accessibility_id", "Comments"),
    ("accessibility_id", "댓글"),
    ("desc_contains", "comment"),
    ("desc_contains", "댓글"),
]

COMMENT_INPUT_SELECTORS = [
    ("id", "comment_edit_text"),
    ("xpath", '//android.widget.EditText[contains(@resource-id, "comment")]'),
    ("class_name", "android.widget.EditText"),
]

COMMENT_POST_BUTTON_SELECTORS = [
    ("id", "send_button"),
    ("accessibility_id", "Send"),
    ("accessibility_id", "보내기"),
    ("desc_contains", "Send"),
]

SUBSCRIBE_BUTTON_SELECTORS = [
    ("text", "Subscribe"),
    ("text", "구독"),
    ("text_contains", "Subscribe"),
    ("desc_contains", "Subscribe"),
]

# ============================================
# 홈 피드 셀렉터 (RandomSurf)
# ============================================

HOME_TAB_SELECTORS = [
    ("accessibility_id", "Home"),
    ("accessibility_id", "홈"),
    ("text", "Home"),
    ("text", "홈"),
]

FEED_VIDEO_SELECTORS = [
    ("id", "thumbnail"),
    ("id", "video_title"),
    ("xpath", '//android.view.ViewGroup[@resource-id="com.google.android.youtube:id/video_title"]'),
]

# ============================================
# 에러 코드 (ErrorRecovery.js 호환)
# ============================================

class ErrorCode:
    # Network (E1xxx)
    NETWORK_DISCONNECTED = "E1001"
    REQUEST_TIMEOUT = "E1002"
    RATE_LIMITED = "E1003"

    # YouTube (E2xxx)
    VIDEO_UNAVAILABLE = "E2001"
    VIDEO_REGION_BLOCKED = "E2002"
    VIDEO_AGE_RESTRICTED = "E2003"
    PLAYBACK_STALLED = "E2004"

    # Device (E3xxx)
    APP_CRASH = "E3001"
    MEMORY_LOW = "E3002"
    SCREEN_LOCKED = "E3003"
    BATTERY_LOW = "E3004"

    # System (E4xxx)
    UNKNOWN = "E4001"
    SESSION_EXPIRED = "E4002"
    APPIUM_ERROR = "E4003"


# 재시도 가능한 에러 코드
RETRYABLE_ERROR_CODES = {
    ErrorCode.NETWORK_DISCONNECTED,
    ErrorCode.REQUEST_TIMEOUT,
    ErrorCode.RATE_LIMITED,
    ErrorCode.PLAYBACK_STALLED,
    ErrorCode.APP_CRASH,
    ErrorCode.SCREEN_LOCKED,
    ErrorCode.UNKNOWN,
    ErrorCode.SESSION_EXPIRED,
    ErrorCode.APPIUM_ERROR,
}

# 재시도 불가능한 에러 코드 (즉시 실패)
NON_RETRYABLE_ERROR_CODES = {
    ErrorCode.VIDEO_UNAVAILABLE,
    ErrorCode.VIDEO_REGION_BLOCKED,
    ErrorCode.MEMORY_LOW,
    ErrorCode.BATTERY_LOW,
}

# ============================================
# 재시도/복구 상수
# ============================================

MAX_RETRY_COUNT = 3
RETRY_BASE_DELAY_SEC = 5
RETRY_MAX_DELAY_SEC = 60
STALL_DETECTION_TIMEOUT_SEC = 120
NETWORK_WAIT_TIMEOUT_SEC = 300
NETWORK_CHECK_INTERVAL_SEC = 10

# ============================================
# 댓글 템플릿
# ============================================

COMMENT_TEMPLATES = [
    "좋은 영상 감사합니다!",
    "잘 봤습니다 👍",
    "유익한 내용이네요",
    "응원합니다!",
    "좋은 정보 감사해요",
    "재미있게 봤습니다",
    "공감되는 내용이에요",
    "많이 배워갑니다",
]

# ============================================
# 시청 시간 상수
# ============================================

DEFAULT_VIDEO_DURATION_SEC = 180
AD_CHECK_INTERVAL_SEC = 5
PROGRESS_REPORT_INTERVAL_SEC = 10
