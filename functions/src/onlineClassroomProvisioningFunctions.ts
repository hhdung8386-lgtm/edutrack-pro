import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'
import { ONLINE_CLASSROOM_ROOMS_COLLECTION } from './onlineClassroom'
import { resolveOnlineClassroomJaasSettingsProvisioning } from './onlineClassroomJaas'
import {
  decideOnlineClassroomTrialSettingsProvisioning,
  isOnlineClassroomTrialRoomAlias,
} from './onlineClassroomJaasSettingsProvisioning'
import {
  ONLINE_TRIAL_CLASSES_COLLECTION,
  isSafeOnlineTrialClassId,
} from './onlineTrialClass'

const jaasWebhookAuthToken = defineSecret('JAAS_WEBHOOK_AUTH_TOKEN')
const db = new Firestore()

/**
 * JaaS calls this endpoint before creating a conference. Enforcing the lobby
 * here removes the client-side race in which a student could arrive before a
 * teacher has enabled admission controls through the IFrame API.
 */
export const onlineClassroomJaasSettingsProvisioning = onRequest({
  region: 'asia-southeast1',
  timeoutSeconds: 10,
  memory: '256MiB',
  cors: false,
  secrets: [jaasWebhookAuthToken],
}, async (request, response) => {
  const decision = resolveOnlineClassroomJaasSettingsProvisioning({
    method: request.method,
    appId: process.env.CLASSROOM_JAAS_APP_ID,
    configuredAuthorization: jaasWebhookAuthToken.value(),
    providedAuthorization: request.get('authorization'),
    body: request.body,
  })

  response.set('Cache-Control', 'no-store')
  if (decision.status === 405) response.set('Allow', 'POST')
  if (!decision.ok) {
    response.status(decision.status).json(decision.body)
    return
  }

  // Legacy booking rooms retain the exact stateless provisioning behavior.
  // Trial rooms use their own recognizable namespace, so a missing binding can
  // fail closed without changing any pre-existing booking/Jitsi integration.
  const fqn = typeof request.body?.fqn === 'string' ? request.body.fqn.trim() : ''
  const roomAlias = fqn.slice(fqn.indexOf('/') + 1)
  if (!isOnlineClassroomTrialRoomAlias(roomAlias)) {
    response.status(decision.status).json(decision.body)
    return
  }

  try {
    const roomSnapshot = await db
      .collection(ONLINE_CLASSROOM_ROOMS_COLLECTION)
      .where('roomName', '==', roomAlias)
      .limit(2)
      .get()
    const roomDocuments = roomSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    }))
    const trialClassId = roomDocuments.length === 1
      && roomDocuments[0].data
      && typeof roomDocuments[0].data === 'object'
      && !Array.isArray(roomDocuments[0].data)
      ? (roomDocuments[0].data as Record<string, unknown>).trialClassId
      : undefined
    const trialSnapshot = isSafeOnlineTrialClassId(trialClassId)
      ? await db.collection(ONLINE_TRIAL_CLASSES_COLLECTION).doc(trialClassId).get()
      : null
    const lifecycle = decideOnlineClassroomTrialSettingsProvisioning({
      roomAlias,
      roomDocuments,
      trialClassDocument: trialSnapshot?.exists
        ? { id: trialSnapshot.id, data: trialSnapshot.data() }
        : null,
      nowMs: Date.now(),
    })
    if (!lifecycle.ok) {
      logger.warn('Rejected Trial Class JaaS settings provisioning.', {
        reason: lifecycle.error,
      })
      response.status(403).json({ error: 'trial-room-unavailable' })
      return
    }

    response.status(decision.status).json(decision.body)
  } catch (error) {
    logger.error('Trial Class JaaS settings provisioning lookup failed.', {
      error: error instanceof Error ? error.message : String(error),
    })
    response.status(503).json({ error: 'trial-room-check-unavailable' })
  }
})
