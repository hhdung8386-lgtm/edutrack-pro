import { defineSecret } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'
import { resolveOnlineClassroomJaasSettingsProvisioning } from './onlineClassroomJaas'

const jaasWebhookAuthToken = defineSecret('JAAS_WEBHOOK_AUTH_TOKEN')

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
}, (request, response) => {
  const decision = resolveOnlineClassroomJaasSettingsProvisioning({
    method: request.method,
    appId: process.env.CLASSROOM_JAAS_APP_ID,
    configuredAuthorization: jaasWebhookAuthToken.value(),
    providedAuthorization: request.get('authorization'),
    body: request.body,
  })

  response.set('Cache-Control', 'no-store')
  if (decision.status === 405) response.set('Allow', 'POST')
  response.status(decision.status).json(decision.body)
})
