import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCustomerLeadPayload, normalizeVietnamPhone } from '../src/lib/customerLeadForm.ts'

test('normalizes Vietnamese phone formats to 0xxxxxxxxx', () => {
  assert.equal(normalizeVietnamPhone('0912 345 678'), '0912345678')
  assert.equal(normalizeVietnamPhone('+84 912.345.678'), '0912345678')
  assert.equal(normalizeVietnamPhone('912345678'), '0912345678')
  assert.equal(normalizeVietnamPhone('0212345678'), null)
  assert.equal(normalizeVietnamPhone('12345'), null)
})

test('builds a rule-shaped payload tagged with the source page', () => {
  const payload = buildCustomerLeadPayload({
    source: 'hoc-thu-mien-phi',
    name: '  Nguyễn Minh Anh ',
    phone: '0912 345 678',
    ageGroup: 'Bé 6–9 tuổi',
    message: '   ',
    sourcePath: '/hoc-thu-mien-phi',
  })
  assert.deepEqual(payload, {
    source: 'hoc-thu-mien-phi',
    sourceLabel: 'Học thử miễn phí',
    sourcePath: '/hoc-thu-mien-phi',
    name: 'Nguyễn Minh Anh',
    phone: '0912345678',
    status: 'new',
    ageGroup: 'Bé 6–9 tuổi',
  })
})

test('rejects missing name, bad phone or unknown source and clips long text', () => {
  assert.equal(buildCustomerLeadPayload({ source: 'lien-he', name: ' ', phone: '0912345678' }), null)
  assert.equal(buildCustomerLeadPayload({ source: 'lien-he', name: 'A', phone: '123' }), null)
  assert.equal(buildCustomerLeadPayload({ source: 'x' as never, name: 'A', phone: '0912345678' }), null)
  const payload = buildCustomerLeadPayload({ source: 'lien-he', name: 'A', phone: '0912345678', message: 'x'.repeat(5000) })
  assert.equal(payload?.message.length, 2000)
  assert.equal(payload?.sourcePath, '/lien-he')
})
