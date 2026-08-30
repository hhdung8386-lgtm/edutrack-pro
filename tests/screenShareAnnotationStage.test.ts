import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import {
  isTrialScreenCaptureCurrent,
  nextTrialScreenHistoryVersion,
  resolveTrialScreenShareTransition,
} from '../src/lib/trialScreenShare.ts'

type ContainRect = { left: number; top: number; width: number; height: number }
type StageModule = {
  computeContainRect: (
    containerWidth: number,
    containerHeight: number,
    mediaWidth: number,
    mediaHeight: number,
  ) => ContainRect
}

function loadGeometryExport(): StageModule {
  const source = readFileSync(
    new URL('../src/components/classroom/ScreenShareAnnotationStage.tsx', import.meta.url),
    'utf8',
  )
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} as Record<string, unknown> }
  const inertModule = new Proxy<Record<string, unknown>>({}, {
    get: () => () => null,
  })
  const requireStub = (specifier: string): unknown => {
    if (specifier === 'react/jsx-runtime') {
      return { Fragment: Symbol('Fragment'), jsx: () => null, jsxs: () => null }
    }
    return inertModule
  }
  const evaluate = new Function('require', 'module', 'exports', transpiled)
  evaluate(requireStub, module, module.exports)
  return module.exports as unknown as StageModule
}

const { computeContainRect } = loadGeometryExport()

function approximately(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 0.000_001, `${actual} ≠ ${expected}`)
}

test('contain rect căn giữa ảnh ngang và giữ nguyên tỉ lệ', () => {
  const rect = computeContainRect(1_000, 800, 1_920, 1_080)
  approximately(rect.left, 0)
  approximately(rect.top, 118.75)
  approximately(rect.width, 1_000)
  approximately(rect.height, 562.5)
})

test('contain rect căn giữa ảnh dọc trong sân khấu ngang', () => {
  const rect = computeContainRect(1_200, 675, 1_080, 1_920)
  approximately(rect.left, 410.15625)
  approximately(rect.top, 0)
  approximately(rect.width, 379.6875)
  approximately(rect.height, 675)
})

test('contain rect phủ kín khi container và ảnh cùng tỉ lệ', () => {
  assert.deepEqual(computeContainRect(1_280, 720, 1_920, 1_080), {
    left: 0,
    top: 0,
    width: 1_280,
    height: 720,
  })
})

test('contain rect trả vùng rỗng với kích thước không hợp lệ', () => {
  const empty = { left: 0, top: 0, width: 0, height: 0 }
  assert.deepEqual(computeContainRect(0, 720, 1_920, 1_080), empty)
  assert.deepEqual(computeContainRect(1_280, Number.NaN, 1_920, 1_080), empty)
  assert.deepEqual(computeContainRect(1_280, 720, -1, 1_080), empty)
})

test('giữ presenter ổn định qua nhịp rỗng và nhận ra người share kế tiếp', () => {
  const pendingPresenter = resolveTrialScreenShareTransition(false, '', true, [])
  assert.deepEqual(pendingPresenter, { stablePresenterId: '', newShare: true })

  const started = resolveTrialScreenShareTransition(true, pendingPresenter.stablePresenterId, true, ['presenter-a'])
  assert.deepEqual(started, { stablePresenterId: 'presenter-a', newShare: false })

  const transientGap = resolveTrialScreenShareTransition(true, started.stablePresenterId, true, [])
  assert.deepEqual(transientGap, { stablePresenterId: 'presenter-a', newShare: false })

  const handoff = resolveTrialScreenShareTransition(true, transientGap.stablePresenterId, true, ['presenter-b'])
  assert.deepEqual(handoff, { stablePresenterId: 'presenter-b', newShare: true })

  const stopped = resolveTrialScreenShareTransition(true, handoff.stablePresenterId, false, [])
  assert.deepEqual(stopped, { stablePresenterId: '', newShare: false })
})

test('bỏ kết quả chụp cũ sau khi share dừng hoặc epoch đã đổi', () => {
  assert.equal(isTrialScreenCaptureCurrent(7, 7, true), true)
  assert.equal(isTrialScreenCaptureCurrent(7, 8, true), false)
  assert.equal(isTrialScreenCaptureCurrent(7, 7, false), false)
})

test('undo sau khi xóa không được hạ generation của màn hình chú thích', () => {
  assert.deepEqual(nextTrialScreenHistoryVersion(12, 2, 1), {
    version: 13,
    generation: 2,
  })
  assert.deepEqual(nextTrialScreenHistoryVersion(13, 2, 2), {
    version: 14,
    generation: 2,
  })
})
