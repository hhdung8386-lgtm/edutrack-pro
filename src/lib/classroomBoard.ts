import { z } from 'zod'
import type {
  ClassroomBoardDraft,
  ClassroomBoardSnapshot,
  OnlineClassroomRole,
  OnlineClassroomScreenAnnotationSession,
} from '@/lib/onlineClassroom'

export const BOARD_MESSAGE_NAMESPACE = '123english-classroom-board'
export const BOARD_SCHEMA_VERSION = 1 as const
export const MAX_BOARD_OPERATIONS = 1_500
export const MAX_BOARD_MESSAGE_BYTES = 48_000
export type BoardSurface = 'board' | 'screen'

const boardPointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
}).strict()

const operationAuthorFields = {
  id: z.string().min(8).max(120),
  authorRole: z.enum(['admin', 'teacher', 'student']),
  createdAt: z.number().int().nonnegative(),
}

const strokeOperationSchema = z.object({
  ...operationAuthorFields,
  kind: z.literal('stroke'),
  tool: z.enum(['pen', 'highlighter', 'eraser']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  width: z.number().finite().min(1).max(36),
  opacity: z.number().finite().min(0.05).max(1),
  points: z.array(boardPointSchema).min(1).max(800),
}).strict()

const shapeOperationSchema = z.object({
  ...operationAuthorFields,
  kind: z.literal('shape'),
  shape: z.enum(['rectangle', 'ellipse', 'arrow']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  width: z.number().finite().min(1).max(18),
  opacity: z.number().finite().min(0.05).max(1),
  start: boardPointSchema,
  end: boardPointSchema,
}).strict()

const textOperationSchema = z.object({
  ...operationAuthorFields,
  kind: z.literal('text'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  fontSize: z.number().finite().min(12).max(48),
  point: boardPointSchema,
  text: z.string().trim().min(1).max(240),
}).strict()

export const boardOperationSchema = z.discriminatedUnion('kind', [
  strokeOperationSchema,
  shapeOperationSchema,
  textOperationSchema,
])

export type BoardOperation = z.infer<typeof boardOperationSchema>
export type BoardTool = 'pen' | 'highlighter' | 'eraser' | 'rectangle' | 'ellipse' | 'arrow' | 'text'
export type BoardPoint = z.infer<typeof boardPointSchema>

export type ValidatedBoardSnapshot = {
  version: number
  generation: number
  studentCanWrite: boolean
  operations: BoardOperation[]
}

const boardSnapshotSchema = z.object({
  version: z.number().int().nonnegative(),
  generation: z.number().int().nonnegative().default(0),
  studentCanWrite: z.boolean(),
  operations: z.array(boardOperationSchema).max(MAX_BOARD_OPERATIONS),
}).strict()

const envelopeFields = {
  namespace: z.literal(BOARD_MESSAGE_NAMESPACE),
  schemaVersion: z.literal(BOARD_SCHEMA_VERSION),
  bookingId: z.string().min(1).max(160),
  messageId: z.string().min(8).max(120),
  senderRole: z.enum(['admin', 'teacher', 'student']),
  sentAt: z.number().int().nonnegative(),
  // Omitted for the legacy whiteboard so cached clients keep accepting the
  // existing wire format. Screen annotations use their own explicit surface.
  surface: z.literal('screen').optional(),
}

const boardMessageSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelopeFields,
    type: z.literal('hello'),
  }).strict(),
  z.object({
    ...envelopeFields,
    type: z.literal('operation'),
    boardVersion: z.number().int().nonnegative(),
    boardGeneration: z.number().int().nonnegative().optional(),
    operation: boardOperationSchema,
  }).strict(),
  z.object({
    ...envelopeFields,
    type: z.literal('snapshot'),
    snapshot: boardSnapshotSchema,
  }).strict(),
  z.object({
    ...envelopeFields,
    type: z.literal('snapshot-request'),
  }).strict(),
  z.object({
    ...envelopeFields,
    type: z.literal('snapshot-refresh'),
    boardVersion: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    ...envelopeFields,
    surface: z.literal('screen'),
    type: z.literal('frame-refresh'),
  }).strict(),
]).superRefine((message, context) => {
  if (message.surface === 'screen'
    && message.type === 'operation'
    && message.boardGeneration === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['boardGeneration'],
      message: 'Screen operations require an explicit board generation.',
    })
  }
})

export type BoardWireMessage = z.infer<typeof boardMessageSchema>
export type BoardMessagePayload =
  | { type: 'hello' }
  | { type: 'operation'; boardVersion: number; boardGeneration?: number; operation: BoardOperation }
  | { type: 'snapshot'; snapshot: ValidatedBoardSnapshot }
  | { type: 'snapshot-request' }
  | { type: 'snapshot-refresh'; boardVersion: number }
  | { type: 'frame-refresh' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function createBoardId(prefix = 'board'): string {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${randomPart}`
}

export function sanitizeBoardSnapshot(snapshot: ClassroomBoardSnapshot | unknown): ValidatedBoardSnapshot {
  if (!isRecord(snapshot)) {
    return { version: 0, generation: 0, studentCanWrite: true, operations: [] }
  }

  const version = Number.isSafeInteger(snapshot.version) && Number(snapshot.version) >= 0
    ? Number(snapshot.version)
    : 0
  const generation = Number.isSafeInteger(snapshot.generation) && Number(snapshot.generation) >= 0
    ? Number(snapshot.generation)
    : 0
  const studentCanWrite = typeof snapshot.studentCanWrite === 'boolean'
    ? snapshot.studentCanWrite
    : true
  const rawOperations = Array.isArray(snapshot.operations)
    ? snapshot.operations.slice(0, MAX_BOARD_OPERATIONS)
    : []
  const operations: BoardOperation[] = []

  for (const candidate of rawOperations) {
    const parsed = boardOperationSchema.safeParse(candidate)
    if (parsed.success) operations.push(parsed.data)
  }

  return { version, generation, studentCanWrite, operations }
}

export function sanitizeScreenAnnotationSession(value: unknown): OnlineClassroomScreenAnnotationSession | null {
  if (!isRecord(value)
    || typeof value.sessionId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,119}$/.test(value.sessionId)
    || typeof value.active !== 'boolean') return null
  return {
    sessionId: value.sessionId,
    active: value.active,
    boardSnapshot: sanitizeBoardSnapshot(value.boardSnapshot),
  }
}

export function toCallableBoardDraft(snapshot: ValidatedBoardSnapshot): ClassroomBoardDraft {
  return {
    generation: snapshot.generation,
    studentCanWrite: snapshot.studentCanWrite,
    operations: snapshot.operations,
  }
}

export function makeBoardMessage(
  bookingId: string,
  senderRole: OnlineClassroomRole,
  payload: BoardMessagePayload,
  surface: BoardSurface = 'board',
): BoardWireMessage {
  const common = {
    namespace: BOARD_MESSAGE_NAMESPACE,
    schemaVersion: BOARD_SCHEMA_VERSION,
    bookingId,
    messageId: createBoardId('message'),
    senderRole,
    sentAt: Date.now(),
    ...(surface === 'screen' ? { surface: 'screen' as const } : {}),
  } as const

  return boardMessageSchema.parse({ ...common, ...payload })
}

export function boardMessageSurface(message: BoardWireMessage): BoardSurface {
  return message.surface === 'screen' ? 'screen' : 'board'
}

export function isBoardOperationGenerationCurrent(
  message: BoardWireMessage,
  currentGeneration: number,
): boolean {
  if (message.type !== 'operation') return false
  return boardMessageSurface(message) === 'board'
    || message.boardGeneration === currentGeneration
}

export function serializeBoardMessage(message: BoardWireMessage): string | null {
  const serialized = JSON.stringify(message)
  return utf8ByteLength(serialized) <= MAX_BOARD_MESSAGE_BYTES ? serialized : null
}

export function parseBoardMessage(raw: unknown, expectedBookingId: string): BoardWireMessage | null {
  if (typeof raw !== 'string' || raw.length === 0 || utf8ByteLength(raw) > MAX_BOARD_MESSAGE_BYTES) {
    return null
  }

  try {
    const parsed = boardMessageSchema.safeParse(JSON.parse(raw) as unknown)
    if (!parsed.success || parsed.data.bookingId !== expectedBookingId) return null
    return parsed.data
  } catch {
    return null
  }
}

export function isBoardManager(role: OnlineClassroomRole): boolean {
  return role === 'admin' || role === 'teacher'
}
