import { execFileSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const expectedArg = process.argv.find((arg) => arg.startsWith('--expected-count='))
const expectedCount = expectedArg ? Number(expectedArg.split('=')[1]) : null
const projectId = process.env.FIRESTORE_PROJECT_ID || 'edutrack-pro-78f59'
const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)'
const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`

function accessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
}

const token = accessToken()
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

async function queryStatus(status) {
  const response = await fetch(`${root}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'bookingRequests' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: status },
          },
        },
        select: { fields: [{ fieldPath: 'lessonId' }, { fieldPath: 'status' }] },
      },
    }),
  })
  if (!response.ok) throw new Error(`${status}: ${response.status} ${await response.text()}`)
  const rows = await response.json()
  return rows
    .map((row) => row.document)
    .filter(Boolean)
    .filter((document) => Boolean(document.fields?.lessonId?.stringValue))
}

const candidates = (await Promise.all(['pending', 'confirmed'].map(queryStatus))).flat()
const summary = {
  projectId,
  mode: apply ? 'apply' : 'dry-run',
  candidates: candidates.length,
  sampleDocumentIds: candidates.slice(0, 20).map((document) => document.name.split('/').at(-1)),
}

if (!apply) {
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Dry-run only. To apply safely: node scripts/migrate-completed-bookings.mjs --apply --expected-count=${candidates.length}`)
  process.exit(0)
}

if (!Number.isInteger(expectedCount) || expectedCount !== candidates.length) {
  throw new Error(`Refusing to write: expected ${expectedCount ?? '(missing)'} candidates but found ${candidates.length}. Run dry-run again.`)
}

const completedAt = new Date().toISOString()
let written = 0
for (let index = 0; index < candidates.length; index += 400) {
  const batch = candidates.slice(index, index + 400)
  const response = await fetch(`${root}:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      writes: batch.map((document) => ({
        update: {
          name: document.name,
          fields: {
            status: { stringValue: 'completed' },
            completedAt: { timestampValue: completedAt },
            updatedAt: { timestampValue: completedAt },
            lifecycleMigration: { stringValue: 'completed-v1' },
          },
        },
        updateMask: { fieldPaths: ['status', 'completedAt', 'updatedAt', 'lifecycleMigration'] },
        currentDocument: { updateTime: document.updateTime },
      })),
    }),
  })
  if (!response.ok) throw new Error(`Commit ${index}: ${response.status} ${await response.text()}`)
  written += batch.length
  console.log(`Migrated ${written}/${candidates.length}`)
}

console.log(JSON.stringify({ ...summary, written, completedAt }, null, 2))
