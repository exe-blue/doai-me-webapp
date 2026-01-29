# Screen Mirroring WebSocket API Specification

## 개요

스마트폰 화면 미러링을 위한 저레이턴시 WebSocket 프로토콜 명세서.

**목표 레이턴시**: < 50ms (end-to-end)

## 연결

### WebSocket Endpoint

```
ws://{host}:{port}?device={device_serial}
```

- `device`: 연결할 디바이스의 시리얼 번호

### 연결 예시

```javascript
const ws = new WebSocket('ws://localhost:8080?device=emulator-5554');
ws.binaryType = 'arraybuffer';
```

## 프로토콜

### 메시지 타입

| 타입 | 포맷 | 방향 | 설명 |
|------|------|------|------|
| Frame | Binary | Client→Server | 화면 프레임 데이터 |
| Control | JSON | 양방향 | 제어 명령 |

### 바이너리 프레임 포맷 (최적화)

프레임 데이터는 **JSON 없이** 고정 크기 바이너리 헤더 + 페이로드로 전송됩니다.

#### 헤더 구조 (24 바이트, Little Endian)

| Offset | Size | Type | Field | Description |
|--------|------|------|-------|-------------|
| 0 | 1 | uint8 | frameType | 0=키프레임, 1=델타프레임 |
| 1 | 8 | float64 | timestamp | 클라이언트 타임스탬프 (ms) |
| 9 | 4 | uint32 | sequenceNumber | 프레임 시퀀스 번호 |
| 13 | 4 | uint32 | payloadSize | 페이로드 크기 (bytes) |
| 17 | 2 | uint16 | width | 화면 너비 |
| 19 | 2 | uint16 | height | 화면 높이 |
| 21 | 3 | - | padding | 4바이트 정렬용 패딩 |

#### 전체 프레임 구조

```
+----------------+------------------+
| Header (24B)   | Payload (N bytes)|
+----------------+------------------+
```

#### 헤더 직렬화 예시 (JavaScript)

```javascript
function serializeFrameHeader(header) {
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer);
  
  view.setUint8(0, header.frameType);
  view.setFloat64(1, header.timestamp, true); // Little Endian
  view.setUint32(9, header.sequenceNumber, true);
  view.setUint32(13, header.payloadSize, true);
  view.setUint16(17, header.width, true);
  view.setUint16(19, header.height, true);
  
  return buffer;
}
```

#### 헤더 파싱 예시 (JavaScript)

```javascript
function parseFrameHeader(buffer) {
  const view = new DataView(buffer, 0, 24);
  
  return {
    frameType: view.getUint8(0),
    timestamp: view.getFloat64(1, true),
    sequenceNumber: view.getUint32(9, true),
    payloadSize: view.getUint32(13, true),
    width: view.getUint16(17, true),
    height: view.getUint16(19, true),
  };
}
```

### 제어 메시지 (JSON)

제어 메시지는 빈도가 낮으므로 JSON 사용.

#### Ping/Pong

```json
// Client → Server
{ "type": "ping" }

// Server → Client
{ "type": "pong", "timestamp": 1706500000000 }
```

#### 통계 요청

```json
// Client → Server
{ "type": "stats" }

// Server → Client
{
  "type": "stats",
  "latency": {
    "min": 12.5,
    "max": 48.2,
    "avg": 23.1,
    "p95": 38.5,
    "p99": 45.2,
    "samples": 1000
  },
  "sessionFrames": 15234,
  "avgLatency": 24.3
}
```

## 레이턴시 최적화 전략

### 1. JSON 직렬화 제거

❌ **기존 (비효율적)**:
```javascript
// 매 프레임마다 JSON 직렬화/역직렬화 발생
ws.send(JSON.stringify({
  type: 'frame',
  timestamp: Date.now(),
  width: 1080,
  height: 1920,
  data: base64Encode(frameBuffer)
}));
```

✅ **최적화 (바이너리)**:
```javascript
// 직접 바이너리 전송 - 직렬화 오버헤드 제거
const header = serializeFrameHeader({...});
const frame = concatenateBuffers(header, frameBuffer);
ws.send(frame);
```

**절감 효과**: ~5-15ms per frame

### 2. Zero-Copy 버퍼 처리

❌ **기존 (버퍼 복사 발생)**:
```javascript
const payload = buffer.slice(HEADER_SIZE); // 새 버퍼 할당
```

✅ **최적화 (Zero-copy)**:
```javascript
const payload = buffer.subarray(HEADER_SIZE); // 뷰만 생성
```

**절감 효과**: ~1-3ms per frame (large payloads)

### 3. 버퍼 재사용

```javascript
// 헤더 버퍼 미리 할당 후 재사용
const headerBuffer = Buffer.allocUnsafe(24);

function sendFrame(header, payload) {
  serializeFrameHeader(header, headerBuffer); // 재사용
  ws.send(Buffer.concat([headerBuffer, payload]));
}
```

### 4. 압축 비활성화

WebSocket perMessageDeflate 비활성화로 CPU 오버헤드 제거.

```javascript
new WebSocketServer({
  perMessageDeflate: false, // 압축 비활성화
});
```

## 성능 요구사항

| 메트릭 | 목표값 | 측정 방법 |
|--------|--------|----------|
| 평균 레이턴시 | < 30ms | 타임스탬프 기반 |
| P95 레이턴시 | < 50ms | 1000 샘플 기준 |
| P99 레이턴시 | < 80ms | 1000 샘플 기준 |
| 프레임 드롭율 | < 1% | 시퀀스 번호 추적 |

## 테스트

### 레이턴시 벤치마크 실행

```bash
npx ts-node backend/latency_test.ts
```

### 예상 출력

```
[Test] 1000회 Mock 프레임 전송 테스트 시작
[Test] 프레임 크기: 1920x1080, 페이로드: 512KB
...
[Result] 테스트 완료
  - 전송 횟수: 1000
  - 평균 레이턴시: 18.5ms
  - P95 레이턴시: 32.1ms
  - P99 레이턴시: 45.8ms
  - 최대 레이턴시: 62.3ms
  - 목표 달성: ✅ (P95 < 50ms)
```

## 버전 히스토리

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| 1.0 | 2026-01-29 | 초기 바이너리 프로토콜 정의 |
