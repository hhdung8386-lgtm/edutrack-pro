import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

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
