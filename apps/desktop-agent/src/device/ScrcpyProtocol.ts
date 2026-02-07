/**
 * scrcpy Control Socket Binary Protocol
 *
 * scrcpy-server와 통신하는 바이너리 프로토콜 시리얼라이저/디시리얼라이저.
 * - Control messages: client → device (touch, key, text, scroll, etc.)
 * - Device messages: device → client (clipboard, ACK)
 * - Video metadata: codec/resolution parsing from video socket
 *
 * Protocol reference: https://github.com/Genymobile/scrcpy/blob/master/doc/develop.md
 */

import { logger } from '../utils/logger';

// ============================================
// Control Message Types (client → device)
// ============================================

export const ControlMessageType = {
  INJECT_KEYCODE: 0x00,
  INJECT_TEXT: 0x01,
  INJECT_TOUCH_EVENT: 0x02,
  INJECT_SCROLL_EVENT: 0x03,
  BACK_OR_SCREEN_ON: 0x04,
  EXPAND_NOTIFICATION_PANEL: 0x05,
  EXPAND_SETTINGS_PANEL: 0x06,
  COLLAPSE_PANELS: 0x07,
  GET_CLIPBOARD: 0x08,
  SET_CLIPBOARD: 0x09,
  SET_SCREEN_POWER_MODE: 0x0a,
  ROTATE_DEVICE: 0x0b,
  UHID_CREATE: 0x0c,
  UHID_INPUT: 0x0d,
  OPEN_HARD_KEYBOARD_SETTINGS: 0x0e,
} as const;

// ============================================
// Device Message Types (device → client)
// ============================================

export const DeviceMessageType = {
  CLIPBOARD: 0x00,
  ACK_CLIPBOARD: 0x01,
  UHID_OUTPUT: 0x02,
} as const;

// ============================================
// Android MotionEvent actions
// ============================================

export const AndroidMotionEventAction = {
  DOWN: 0,
  UP: 1,
  MOVE: 2,
  CANCEL: 3,
  HOVER_MOVE: 7,
  SCROLL: 8,
} as const;

export type MotionAction = (typeof AndroidMotionEventAction)[keyof typeof AndroidMotionEventAction];

// ============================================
// Android KeyEvent actions
// ============================================

export const AndroidKeyEventAction = {
  DOWN: 0,
  UP: 1,
} as const;

// ============================================
// Android KeyEvent meta state flags
// ============================================

export const AndroidMetaState = {
  NONE: 0,
  ALT_ON: 0x02,
  SHIFT_ON: 0x01,
  CTRL_ON: 0x1000,
} as const;

// ============================================
// Screen power modes
// ============================================

export const ScreenPowerMode = {
  OFF: 0,
  NORMAL: 2,
} as const;

// ============================================
// Video codec IDs (from video socket metadata)
// ============================================

export const VideoCodecId = {
  H264: 0x68323634,  // 'h264'
  H265: 0x68323635,  // 'h265'
  AV1: 0x00617631,   // 'av1\0'
} as const;

// ============================================
// Interfaces
// ============================================

export interface TouchEvent {
  action: MotionAction;
  pointerId: bigint;
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  pressure: number;       // 0.0 - 1.0, mapped to u16
  actionButton: number;
  buttons: number;
}

export interface KeyEvent {
  action: 0 | 1;       // DOWN=0, UP=1
  keycode: number;      // Android keycode
  repeat: number;
  metaState: number;
}

export interface ScrollEvent {
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  horizontalScroll: number;   // i32 (float mapped)
  verticalScroll: number;     // i32 (float mapped)
  buttons: number;
}

export interface VideoMeta {
  codecId: number;
  width: number;
  height: number;
}

export interface DeviceClipboardMessage {
  text: string;
}

// ============================================
// Frame header from video socket
// ============================================

export interface FrameHeader {
  pts: bigint;            // 62-bit presentation timestamp
  isKeyFrame: boolean;
  isConfig: boolean;
  packetSize: number;
}

// ============================================
// ScrcpyProtocol — 시리얼라이저
// ============================================

export class ScrcpyProtocol {

  // ------------------------------------
  // Control Messages (client → device)
  // ------------------------------------

  /**
   * Touch 이벤트 직렬화 (28 bytes)
   */
  static serializeTouch(event: TouchEvent): Buffer {
    const buf = Buffer.alloc(28);
    let offset = 0;

    buf.writeUInt8(ControlMessageType.INJECT_TOUCH_EVENT, offset++);
    buf.writeUInt8(event.action, offset++);

    // pointerId: i64 big-endian
    buf.writeBigInt64BE(event.pointerId, offset);
    offset += 8;

    // position: x (i32), y (i32)
    buf.writeInt32BE(event.x, offset);
    offset += 4;
    buf.writeInt32BE(event.y, offset);
    offset += 4;

    // screen size: width (u16), height (u16)
    buf.writeUInt16BE(event.screenWidth, offset);
    offset += 2;
    buf.writeUInt16BE(event.screenHeight, offset);
    offset += 2;

    // pressure: u16 (0-65535, mapped from 0.0-1.0)
    const pressureU16 = Math.round(Math.min(1.0, Math.max(0, event.pressure)) * 0xffff);
    buf.writeUInt16BE(pressureU16, offset);
    offset += 2;

    // actionButton + buttons: u32
    const buttonsField = ((event.actionButton & 0xff) << 24) | (event.buttons & 0xffffff);
    buf.writeUInt32BE(buttonsField, offset);

    return buf;
  }

  /**
   * Key 이벤트 직렬화 (14 bytes)
   */
  static serializeKey(event: KeyEvent): Buffer {
    const buf = Buffer.alloc(14);
    let offset = 0;

    buf.writeUInt8(ControlMessageType.INJECT_KEYCODE, offset++);
    buf.writeUInt8(event.action, offset++);

    buf.writeUInt32BE(event.keycode, offset);
    offset += 4;

    buf.writeUInt32BE(event.repeat, offset);
    offset += 4;

    buf.writeUInt32BE(event.metaState, offset);

    return buf;
  }

  /**
   * Text 이벤트 직렬화 (가변 길이)
   */
  static serializeText(text: string): Buffer {
    const textBytes = Buffer.from(text, 'utf-8');
    const buf = Buffer.alloc(1 + 4 + textBytes.length);

    buf.writeUInt8(ControlMessageType.INJECT_TEXT, 0);
    buf.writeUInt32BE(textBytes.length, 1);
    textBytes.copy(buf, 5);

    return buf;
  }

  /**
   * Scroll 이벤트 직렬화
   */
  static serializeScroll(event: ScrollEvent): Buffer {
    const buf = Buffer.alloc(21);
    let offset = 0;

    buf.writeUInt8(ControlMessageType.INJECT_SCROLL_EVENT, offset++);

    buf.writeInt32BE(event.x, offset);
    offset += 4;
    buf.writeInt32BE(event.y, offset);
    offset += 4;

    buf.writeUInt16BE(event.screenWidth, offset);
    offset += 2;
    buf.writeUInt16BE(event.screenHeight, offset);
    offset += 2;

    // scroll amounts as float → i16 (scrcpy uses fixed-point: value * 8192)
    const hScrollFixed = Math.max(-32768, Math.min(32767, Math.round(event.horizontalScroll * 8192)));
    buf.writeInt16BE(hScrollFixed, offset);
    offset += 2;
    const vScrollFixed = Math.max(-32768, Math.min(32767, Math.round(event.verticalScroll * 8192)));
    buf.writeInt16BE(vScrollFixed, offset);
    offset += 2;

    buf.writeInt32BE(event.buttons, offset);

    return buf;
  }

  /**
   * Back or Screen On (2 bytes)
   */
  static serializeBackOrScreenOn(): Buffer {
    const buf = Buffer.alloc(2);
    buf.writeUInt8(ControlMessageType.BACK_OR_SCREEN_ON, 0);
    buf.writeUInt8(0, 1); // action (keycode action: UP triggers back)
    return buf;
  }

  /**
   * Screen power mode (2 bytes)
   */
  static serializeSetScreenPowerMode(mode: number): Buffer {
    const buf = Buffer.alloc(2);
    buf.writeUInt8(ControlMessageType.SET_SCREEN_POWER_MODE, 0);
    buf.writeUInt8(mode, 1);
    return buf;
  }

  /**
   * Expand notification panel (1 byte)
   */
  static serializeExpandNotificationPanel(): Buffer {
    return Buffer.from([ControlMessageType.EXPAND_NOTIFICATION_PANEL]);
  }

  /**
   * Expand settings panel (1 byte)
   */
  static serializeExpandSettingsPanel(): Buffer {
    return Buffer.from([ControlMessageType.EXPAND_SETTINGS_PANEL]);
  }

  /**
   * Collapse panels (1 byte)
   */
  static serializeCollapsePanels(): Buffer {
    return Buffer.from([ControlMessageType.COLLAPSE_PANELS]);
  }

  /**
   * Rotate device (1 byte)
   */
  static serializeRotateDevice(): Buffer {
    return Buffer.from([ControlMessageType.ROTATE_DEVICE]);
  }

  /**
   * Set clipboard (variable length)
   *
   * @param text clipboard text
   * @param paste if true, also paste after setting
   */
  static serializeSetClipboard(text: string, paste = false): Buffer {
    const textBytes = Buffer.from(text, 'utf-8');
    // sequence (u64) + paste (u8) + length (u32) + text
    const buf = Buffer.alloc(1 + 8 + 1 + 4 + textBytes.length);
    let offset = 0;

    buf.writeUInt8(ControlMessageType.SET_CLIPBOARD, offset++);

    // sequence number (u64, 0 for now)
    buf.writeBigUInt64BE(0n, offset);
    offset += 8;

    // paste flag
    buf.writeUInt8(paste ? 1 : 0, offset++);

    // text length + text
    buf.writeUInt32BE(textBytes.length, offset);
    offset += 4;
    textBytes.copy(buf, offset);

    return buf;
  }

  // ------------------------------------
  // Video Socket Parsing
  // ------------------------------------

  /**
   * 비디오 소켓 최초 12바이트 메타데이터 파싱
   * Codec ID (u32) + Width (u32) + Height (u32)
   */
  static parseVideoMeta(data: Buffer): VideoMeta {
    if (data.length < 12) {
      throw new Error(`Video meta too short: ${data.length} bytes (need 12)`);
    }

    return {
      codecId: data.readUInt32BE(0),
      width: data.readUInt32BE(4),
      height: data.readUInt32BE(8),
    };
  }

  /**
   * 비디오 프레임 헤더 파싱 (12 bytes header + 4 bytes size)
   *
   * Byte layout:
   *   [0-7]  : PTS (62-bit) + flags in MSB (C=config, K=keyframe)
   *   [8-11] : packet size (u32)
   */
  static parseFrameHeader(data: Buffer): FrameHeader {
    if (data.length < 12) {
      throw new Error(`Frame header too short: ${data.length} bytes (need 12)`);
    }

    const ptsRaw = data.readBigUInt64BE(0);

    // Top 2 bits are flags
    const isConfig = Boolean(ptsRaw & (1n << 63n));
    const isKeyFrame = Boolean(ptsRaw & (1n << 62n));
    const pts = ptsRaw & ((1n << 62n) - 1n);

    const packetSize = data.readUInt32BE(8);

    return { pts, isKeyFrame, isConfig, packetSize };
  }

  /**
   * 코덱 ID를 사람이 읽을 수 있는 문자열로 변환
   */
  static codecIdToString(codecId: number): string {
    switch (codecId) {
      case VideoCodecId.H264: return 'h264';
      case VideoCodecId.H265: return 'h265';
      case VideoCodecId.AV1: return 'av1';
      default: return `unknown(0x${codecId.toString(16)})`;
    }
  }

  // ------------------------------------
  // Device Messages Parsing (device → client)
  // ------------------------------------

  /**
   * Device message 파싱 (clipboard, ACK, UHID)
   */
  static parseDeviceMessage(data: Buffer): { type: number; payload: unknown } | null {
    if (data.length < 1) return null;

    const type = data.readUInt8(0);

    switch (type) {
      case DeviceMessageType.CLIPBOARD: {
        if (data.length < 5) return null;
        const textLength = data.readUInt32BE(1);
        if (data.length < 5 + textLength) return null;
        const text = data.subarray(5, 5 + textLength).toString('utf-8');
        return { type, payload: { text } as DeviceClipboardMessage };
      }

      case DeviceMessageType.ACK_CLIPBOARD: {
        if (data.length < 9) return null;
        const sequence = data.readBigUInt64BE(1);
        return { type, payload: { sequence } };
      }

      default:
        logger.debug('[ScrcpyProtocol] Unknown device message type', { type });
        return { type, payload: data.subarray(1) };
    }
  }

  // ------------------------------------
  // Helper: 고수준 제스처 시리얼라이즈
  // ------------------------------------

  /**
   * 단순 탭 (DOWN + UP)
   */
  static serializeTap(
    x: number,
    y: number,
    screenWidth: number,
    screenHeight: number
  ): Buffer[] {
    const base: Omit<TouchEvent, 'action'> = {
      pointerId: -1n,  // MOUSE
      x,
      y,
      screenWidth,
      screenHeight,
      pressure: 1.0,
      actionButton: 1,  // PRIMARY
      buttons: 1,
    };

    return [
      ScrcpyProtocol.serializeTouch({ ...base, action: AndroidMotionEventAction.DOWN }),
      ScrcpyProtocol.serializeTouch({ ...base, action: AndroidMotionEventAction.UP, pressure: 0, actionButton: 0, buttons: 0 }),
    ];
  }

  /**
   * 스와이프 모션 생성 (DOWN → MOVE × N → UP)
   *
   * @param steps 중간 MOVE 이벤트 수 (기본 10)
   */
  static serializeSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    screenWidth: number,
    screenHeight: number,
    steps = 10
  ): Buffer[] {
    const buffers: Buffer[] = [];

    const base = {
      pointerId: -1n,
      screenWidth,
      screenHeight,
      actionButton: 1,
      buttons: 1,
    };

    // DOWN at start position
    buffers.push(ScrcpyProtocol.serializeTouch({
      ...base,
      action: AndroidMotionEventAction.DOWN,
      x: x1,
      y: y1,
      pressure: 1.0,
    }));

    // MOVE steps (interpolate)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      buffers.push(ScrcpyProtocol.serializeTouch({
        ...base,
        action: AndroidMotionEventAction.MOVE,
        x: Math.round(x1 + (x2 - x1) * t),
        y: Math.round(y1 + (y2 - y1) * t),
        pressure: 1.0,
      }));
    }

    // UP at end position
    buffers.push(ScrcpyProtocol.serializeTouch({
      ...base,
      action: AndroidMotionEventAction.UP,
      x: x2,
      y: y2,
      pressure: 0,
      actionButton: 0,
      buttons: 0,
    }));

    return buffers;
  }

  /**
   * 길게 누르기 (DOWN만 반환 — 호출자가 타이머 후 UP 전송)
   */
  static serializeLongPressDown(
    x: number,
    y: number,
    screenWidth: number,
    screenHeight: number
  ): Buffer {
    return ScrcpyProtocol.serializeTouch({
      action: AndroidMotionEventAction.DOWN,
      pointerId: -1n,
      x,
      y,
      screenWidth,
      screenHeight,
      pressure: 1.0,
      actionButton: 1,
      buttons: 1,
    });
  }

  static serializeLongPressUp(
    x: number,
    y: number,
    screenWidth: number,
    screenHeight: number
  ): Buffer {
    return ScrcpyProtocol.serializeTouch({
      action: AndroidMotionEventAction.UP,
      pointerId: -1n,
      x,
      y,
      screenWidth,
      screenHeight,
      pressure: 0,
      actionButton: 0,
      buttons: 0,
    });
  }
}

export default ScrcpyProtocol;
