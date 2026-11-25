const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  draw, games, findGame, resolveSetup, revolverConfigForStop, revolverMask, stopByKey,
} = require('../lib/chance-model')
const { dateKey, readChance, todayResult, updateGame, updateStop, roll } = require('../lib/chance-store')
const { LEGACY_CHANCE_KEY, readAppState } = require('../lib/workout-storage')

function memoryStorage() {
  const values = new Map()
  return {
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
  }
}

test('all published odds match enumeration of the actual draw outcomes', () => {
  for (const game of games) {
    const { model } = game
    for (const stop of model.stops) {
      const trains = model.outcomes.filter((value) => model.trains(stop, value)).length
      assert.equal(trains * stop.denominator, model.outcomes.length * stop.numerator,
        `${game.id} ${stop.key}`)
      assert.equal(stopByKey(model, stop.key), stop)
    }
    assert.equal(model.stops[0].chance, 0)
    assert.equal(model.stops[model.stops.length - 1].chance, 1)
  }
})

test('all chamber counts implement uniform layouts and use the saved rule', () => {
  const { model } = findGame('revolver')
  for (let loaded = 0; loaded <= 6; loaded += 1) {
    for (let shots = 1; shots <= 6; shots += 1) {
      const key = `${loaded}-${shots}-any`
      const stop = stopByKey(model, key)
      assert.deepEqual(revolverConfigForStop(key), { loaded, shots, all: false })
      const layouts = new Map()
      for (const outcome of model.outcomes) {
        const mask = revolverMask(key, outcome)
        assert.equal(mask.toString(2).split('1').length - 1, loaded)
        layouts.set(mask, (layouts.get(mask) || 0) + 1)
        assert.equal(model.trains(stop, outcome), (mask & ((1 << shots) - 1)) !== 0)
      }
      assert.equal(new Set(layouts.values()).size, 1)
      assert.equal(model.outcomes.filter((value) => model.trains(stop, value)).length * stop.denominator,
        60 * stop.numerator)
    }
  }
})

test('the default rule draws exactly one uniform die with high faces meaning train', () => {
  const setup = resolveSetup({})
  assert.equal(setup.stop.key, '3/6')
  for (let face = 1; face <= 6; face += 1) {
    let calls = 0
    const result = draw(setup, () => {
      calls += 1
      return (face - 0.5) / 6
    })
    assert.equal(calls, 1)
    assert.equal(result.outcomeId, String(face))
    assert.equal(result.train, face >= 4)
  }
})

test('changing games keeps the requested odds and intermediate odds avoid extreme rules', () => {
  const storage = memoryStorage()
  updateGame(storage, 'lots')
  updateStop(storage, '1/10')
  assert.equal(resolveSetup(updateGame(storage, 'dice')).stop.key, '1/6')
  assert.equal(resolveSetup(updateGame(storage, 'lots')).stop.key, '1/10')
  assert.equal(resolveSetup({ gameId: 'dice', target: 0.95 }).stop.key, '5/6')
  assert.equal(resolveSetup({ gameId: 'dice', target: 0 }).stop.key, '0/6')
  assert.equal(resolveSetup({ gameId: 'dice', target: 1 }).stop.key, '6/6')
  assert.equal(resolveSetup({ gameId: 'lots', target: 0.55 }).stop.key, '5/10')

  updateGame(storage, 'revolver')
  updateStop(storage, '1-3-any')
  updateGame(storage, 'dice')
  assert.equal(resolveSetup(updateGame(storage, 'revolver')).stop.key, '1-3-any')
})

test('reroll replaces the same-day outcome while probability and game edits preserve it', () => {
  const storage = memoryStorage()
  const date = new Date(2026, 10, 24, 23, 55)
  assert.equal(dateKey(date), '2026-11-24')

  const first = roll(storage, { date, random: () => 0.01 }).result
  assert.equal(first.outcomeId, '1')
  assert.equal(first.train, false)
  updateStop(storage, '6/6')
  assert.equal(resolveSetup(updateGame(storage, 'cup')).game.model.id, first.modelId)
  assert.deepEqual(todayResult(readChance(storage), date), first)

  const next = roll(storage, { date, random: () => 0.99 }).result
  assert.equal(next.outcomeId, '6')
  assert.equal(next.stopKey, '6/6')
  assert.equal(next.train, true)
  assert.deepEqual(todayResult(readChance(storage), date), next)
  assert.equal(todayResult(readChance(storage), new Date(2026, 10, 25, 0, 1)), null)
})

test('a failed write retains the previous result', () => {
  const storage = memoryStorage()
  const saved = roll(storage, { random: () => 0.99 })
  storage.setStorageSync = () => { throw new Error('storage full') }
  assert.throws(() => roll(storage, { random: () => 0 }), /storage full/)
  assert.deepEqual(readChance(storage), saved)
})

test('the shared store migrates the Android-compatible legacy result and preserves model memory', () => {
  const storage = memoryStorage()
  const result = { gameId: 'dice', modelId: 'd6', outcomeId: '1', train: false, date: '2026-11-24' }
  storage.setStorageSync(LEGACY_CHANCE_KEY, { gameId: 'dice', result, memory: { laterModel: '{"bag":[]}' } })
  assert.deepEqual(readChance(storage).result, result)
  updateGame(storage, 'cup')
  const { chance, workouts } = readAppState(storage)
  assert.deepEqual(chance.memory, { laterModel: '{"bag":[]}' })
  assert.deepEqual(chance.result, result)
  assert.deepEqual(workouts.workouts, [])
})

let options

global.Page = (definition) => { options = definition }
require('../pages/chance/index')
delete global.Page

function openChancePage(t) {
  const storage = memoryStorage()
  t.mock.method(storage, 'setStorageSync')
  storage.switchTab = t.mock.fn()
  global.wx = storage
  t.after(() => { delete global.wx })
  const shown = []
  const reveals = []
  const page = {
    ...options,
    data: structuredClone(options.data),
    setData(value) { Object.assign(this.data, value) },
    scheduleDateCheck() {},
    loadScene() {
      this.sceneRenderer = {
        ready: () => true,
        reveal: (outcome) => {
          assert.equal(readChance(storage).result.outcomeId, outcome)
          return new Promise((resolve, reject) => reveals.push({ outcome, resolve, reject }))
        },
        show: (outcome) => shown.push(outcome),
        update() {},
        dispose() {},
      }
      this.sceneRenderer.show(this.currentSceneState().outcomeId)
    },
  }
  page.onShow()
  t.after(() => page.onUnload())
  return { page, storage, shown, reveals }
}

test('the page persists the exact outcome before starting the renderer and ignores extra taps', async (t) => {
  const { page, storage, reveals } = openChancePage(t)
  t.mock.method(Math, 'random', () => 0.57)
  page.onPrimary()
  page.onPrimary()
  assert.equal(storage.setStorageSync.mock.callCount(), 1)
  assert.equal(page.data.result, null)
  assert.equal(reveals.length, 1)
  assert.equal(reveals[0].outcome, '4')
  reveals[0].resolve('4')
  await Promise.resolve()
  assert.equal(page.data.result.outcomeId, '4')
  assert.equal(page.data.result.train, true)
  assert.equal(page.data.drawing, false)
})

test('leaving during a reroll restores the persisted result and record remains reachable', async (t) => {
  const { page, storage, reveals, shown } = openChancePage(t)
  const random = t.mock.method(Math, 'random', () => 0.99)
  page.onPrimary()
  reveals[0].resolve('6')
  await Promise.resolve()
  random.mock.mockImplementation(() => 0.03)
  page.onPrimary()
  page.goToRecord()
  assert.equal(storage.switchTab.mock.calls[0].arguments[0].url, '/pages/record/index')
  page.onHide()
  page.onShow()
  reveals[1].resolve('1')
  await Promise.resolve()
  assert.equal(page.data.drawing, false)
  assert.equal(page.data.result.outcomeId, '1')
  assert.equal(shown.at(-1), '1')
  assert.equal(storage.setStorageSync.mock.callCount(), 2)
})

test('a wrong renderer acknowledgement repaints only the saved outcome', async (t) => {
  const { page, reveals, shown } = openChancePage(t)
  t.mock.method(Math, 'random', () => 0.57)
  page.onPrimary()
  reveals[0].resolve('1')
  await Promise.resolve()
  assert.equal(page.data.result.outcomeId, '4')
  assert.equal(shown.at(-1), '4')
  assert.match(page.data.error, /已显示抽取结果/)
})

test('a rejected throw displays the persisted face without drawing again', async (t) => {
  const { page, storage, reveals, shown } = openChancePage(t)
  const random = t.mock.method(Math, 'random', () => 0.57)
  const logged = t.mock.method(console, 'error', () => {})
  page.onPrimary()
  const saved = readChance(storage).result
  const error = new Error('Could not prepare a settled throw')
  reveals[0].reject(error)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(page.data.drawing, false)
  assert.deepEqual(page.data.result, saved)
  assert.deepEqual(readChance(storage).result, saved)
  assert.equal(shown.at(-1), saved.outcomeId)
  assert.match(page.data.error, /已显示抽取结果/)
  assert.equal(random.mock.callCount(), 1)
  assert.equal(storage.setStorageSync.mock.callCount(), 1)
  assert.equal(logged.mock.calls[0].arguments[1], error)
})

test('failed persistence leaves the page ready to try again', (t) => {
  const { page, storage, reveals } = openChancePage(t)
  storage.setStorageSync.mock.mockImplementation(() => { throw new Error('storage full') })
  page.onPrimary()
  assert.equal(page.data.drawing, false)
  assert.equal(page.data.result, null)
  assert.equal(reveals.length, 0)
  assert.match(page.data.error, /保存结果失败/)
})
