/**
 * Re-export all database types from the unified source.
 *
 * 이전에 이 파일에 있던 stale 타입들 (activity_logs, commands, events, personas)은
 * packages/shared/src/database.ts의 통합 Database 타입으로 대체되었습니다.
 */
export {
  type Json,
  type Database,
  type Tables,
  type TablesInsert,
  type TablesUpdate,
  type Enums,
  type CompositeTypes,
} from "../database";
