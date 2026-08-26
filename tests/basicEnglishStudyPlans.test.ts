import assert from 'node:assert/strict'
import test from 'node:test'
import { BASIC_ENGLISH_STUDY_PLANS, getBasicEnglishStudyPlan } from '../src/data/basicEnglishStudyPlans.ts'

test('contains the complete Basic English 1-4 study plans from the supplied documents', () => {
  assert.deepEqual(
    Object.values(BASIC_ENGLISH_STUDY_PLANS).map((plan) => plan.totalLessons),
    [50, 30, 30, 40],
  )
  assert.equal(Object.values(BASIC_ENGLISH_STUDY_PLANS).flatMap((plan) => plan.lessons).length, 150)
})

test('each plan has continuous lesson numbering and complete learning content', () => {
  Object.values(BASIC_ENGLISH_STUDY_PLANS).forEach((plan) => {
    assert.equal(plan.lessons.length, plan.totalLessons)
    plan.lessons.forEach((lesson, index) => {
      assert.equal(lesson.number, index + 1)
      assert.ok(lesson.title.trim())
      assert.ok(lesson.objective.trim())
      assert.ok(lesson.activity.trim())
    })
  })
})

test('unknown levels stay compatible by returning an empty result', () => {
  assert.equal(getBasicEnglishStudyPlan(5), null)
})
