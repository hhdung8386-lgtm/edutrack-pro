import {
  FieldPath,
  FieldValue,
  Firestore,
  Timestamp,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import {
  ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION,
  ONLINE_CLASSROOM_GIFT_RATE_LIMITS_COLLECTION,
  ONLINE_CLASSROOM_GIFT_RETENTION_MS,
} from './onlineClassroomGift'
import { ONLINE_CLASSROOM_ROOMS_COLLECTION } from './onlineClassroom'

const db = new Firestore()
const ROOMS_PER_RUN = 40
const ARTIFACTS_PER_ROOM = 25
const BOARD_RATE_LIMITS_PER_RUN = 300
const DELETE_BATCH_SIZE = 450
const ROOM_QUERY_CONCURRENCY = 8
const MAINTENANCE_DOCUMENT = 'onlineClassroomMaintenance/ephemeralCleanup'

async function loadRoomPage(cursor: string): Promise<QueryDocumentSnapshot[]> {
  const rooms = db.collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
    .orderBy(FieldPath.documentId())
    .limit(ROOMS_PER_RUN)
  const page = await (cursor ? rooms.startAfter(cursor) : rooms).get()
  if (!page.empty || !cursor) return page.docs
  // Reaching the end wraps to the first page so cleanup keeps making progress
  // without requiring collection-group indexes.
  return (await rooms.get()).docs
}

async function expiredArtifactsForRoom(
  room: QueryDocumentSnapshot,
  now: Timestamp,
  staleGiftRateLimitCutoff: Timestamp,
): Promise<DocumentReference[]> {
  const [giftEvents, giftRateLimits] = await Promise.all([
    room.ref.collection(ONLINE_CLASSROOM_GIFT_EVENTS_COLLECTION)
      .where('expiresAt', '<=', now)
      .limit(ARTIFACTS_PER_ROOM)
      .get(),
    // updatedAt also catches rate documents written before expiresAt was added.
    room.ref.collection(ONLINE_CLASSROOM_GIFT_RATE_LIMITS_COLLECTION)
      .where('updatedAt', '<=', staleGiftRateLimitCutoff)
      .limit(ARTIFACTS_PER_ROOM)
      .get(),
  ])
  return [...giftEvents.docs, ...giftRateLimits.docs].map((document) => document.ref)
}

async function expiredArtifactsForRooms(
  rooms: QueryDocumentSnapshot[],
  now: Timestamp,
  staleGiftRateLimitCutoff: Timestamp,
): Promise<DocumentReference[]> {
  const references: DocumentReference[] = []
  for (let offset = 0; offset < rooms.length; offset += ROOM_QUERY_CONCURRENCY) {
    const chunk = await Promise.all(rooms
      .slice(offset, offset + ROOM_QUERY_CONCURRENCY)
      .map((room) => expiredArtifactsForRoom(room, now, staleGiftRateLimitCutoff)))
    references.push(...chunk.flat())
  }
  return references
}

async function deleteInBatches(references: DocumentReference[]): Promise<void> {
  for (let offset = 0; offset < references.length; offset += DELETE_BATCH_SIZE) {
    const batch = db.batch()
    references.slice(offset, offset + DELETE_BATCH_SIZE)
      .forEach((reference) => batch.delete(reference))
    await batch.commit()
  }
}

/**
 * Backstop for inactive rooms that no longer receive opportunistic cleanup.
 * Room pagination intentionally uses collection-scoped queries: filtered
 * collection-group queries need separate deployed indexes. One run is bounded
 * below Firestore's 500-write batch limit and persists a cursor so inactive
 * rooms are swept round-robin. Deletes are chunked below Firestore's
 * 500-write limit so one busy room cannot make the whole maintenance run fail.
 */
export const cleanupOnlineClassroomEphemeralData = onSchedule({
  region: 'asia-southeast1',
  schedule: 'every 6 hours',
  timeZone: 'Asia/Ho_Chi_Minh',
  timeoutSeconds: 120,
  memory: '256MiB',
}, async () => {
  const now = Timestamp.now()
  const staleGiftRateLimitCutoff = Timestamp.fromMillis(
    now.toMillis() - ONLINE_CLASSROOM_GIFT_RETENTION_MS,
  )
  const maintenanceRef = db.doc(MAINTENANCE_DOCUMENT)
  const maintenanceSnapshot = await maintenanceRef.get()
  const cursor = typeof maintenanceSnapshot.data()?.cursor === 'string'
    ? maintenanceSnapshot.data()!.cursor
    : ''
  const rooms = await loadRoomPage(cursor)
  const [roomArtifacts, boardRateLimits] = await Promise.all([
    expiredArtifactsForRooms(rooms, now, staleGiftRateLimitCutoff),
    db.collection('onlineClassroomBoardRateLimits')
      .where('expiresAt', '<=', now)
      .limit(BOARD_RATE_LIMITS_PER_RUN)
      .get(),
  ])
  const artifactRefs = [
    ...roomArtifacts,
    ...boardRateLimits.docs.map((document) => document.ref),
  ]
  const nextCursor = rooms.length === ROOMS_PER_RUN ? rooms.at(-1)!.id : ''
  await deleteInBatches(artifactRefs)
  await maintenanceRef.set({
    cursor: nextCursor,
    processedRoomCount: rooms.length,
    deletedArtifactCount: artifactRefs.length - boardRateLimits.size,
    deletedBoardRateLimitCount: boardRateLimits.size,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  logger.info('Online classroom ephemeral cleanup completed', {
    processedRooms: rooms.length,
    deletedRoomArtifacts: artifactRefs.length - boardRateLimits.size,
    deletedBoardRateLimits: boardRateLimits.size,
    wrapped: Boolean(cursor && rooms.length > 0 && rooms[0].id <= cursor),
  })
})
