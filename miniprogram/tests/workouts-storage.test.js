const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const {
  ACTIVE_FILE_KEY, APP_STATE_KEY, LEGACY_WORKOUT_KEY, LEGACY_CHANCE_KEY,
  readAppState, updateAppState
} = require('../lib/workout-storage')
const { createWorkoutStore } = require('../lib/workouts')
const { importWorkoutBackup, exportWorkoutBackup, undoLastRestore } = require('../lib/workout-backup')

const MB = 1024 * 1024
const TIME = Date.parse('2025-11-24T04:00:00Z')

function useSandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'workout-store-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cache = new Map()
  let failure
  const storage = {
    env: { USER_DATA_PATH: root },
    getStorageSync: key => cache.get(key),
    setStorageSync(key, value) {
      if (Buffer.byteLength(JSON.stringify(value)) > MB) throw new Error('wx storage key over 1 MB')
      if (failure === 'pointer' && key === ACTIVE_FILE_KEY) throw new Error('pointer write failed')
      cache.set(key, value)
    },
    removeStorageSync: key => cache.delete(key),
    getFileSystemManager: () => ({
      readFileSync,
      writeFileSync(path, data, encoding) {
        if (failure === 'file') {
          writeFileSync(path, data.slice(0, 50), encoding)
          throw new Error('partial file write')
        }
        writeFileSync(path, data, encoding)
      }
    })
  }
  return { storage, root, fail: value => { failure = value } }
}

test('the file store migrates both legacy keys on commit and survives failed migration', t => {
  const { storage, fail } = useSandbox(t)
  const legacyWorkouts = { version: 1, nextId: 8, exercises: [], workouts: [] }
  const legacyChance = { gameId: 'cup', target: 1 / 3 }
  storage.setStorageSync(LEGACY_WORKOUT_KEY, JSON.stringify(legacyWorkouts))
  storage.setStorageSync(LEGACY_CHANCE_KEY, legacyChance)
  assert.deepEqual(readAppState(storage).workouts, legacyWorkouts)
  assert.deepEqual(readAppState(storage).chance, legacyChance)
  const store = createWorkoutStore(storage, { now: () => TIME })
  fail('pointer')
  assert.throws(() => store.createExercise('举重', 'TOTAL'), /pointer write failed/)
  assert.deepEqual(readAppState(storage).workouts, legacyWorkouts)
  assert.deepEqual(readAppState(storage).chance, legacyChance)
  assert.equal(storage.getStorageSync(ACTIVE_FILE_KEY), undefined)
  fail()
  const created = store.createExercise('举重', 'TOTAL')
  assert.equal(created.id, 'exercise-8')
  assert.equal(storage.getStorageSync(ACTIVE_FILE_KEY), 'a')
  assert.equal(storage.getStorageSync(LEGACY_WORKOUT_KEY), undefined)
  assert.equal(storage.getStorageSync(LEGACY_CHANCE_KEY), undefined)
  assert.equal(storage.getStorageSync(APP_STATE_KEY), undefined)
  assert.deepEqual(readAppState(storage).chance, legacyChance)
})

test('a restored history over the wx per-key limit lives in the file, with atomic rollback on failures', t => {
  const { storage, root, fail } = useSandbox(t)
  const store = createWorkoutStore(storage, { now: () => TIME })
  const existing = store.createAndSelectExercise('深蹲', 'TOTAL')
  const existingDraft = store.getWorkout(existing.workoutId).items[0].draft.id
  const file = JSON.parse(exportWorkoutBackup({ storage, now: () => TIME }))
  const { workoutExerciseId, createdAt, updatedAt } = file.sets[0]
  file.settings.chanceTarget = 0.4
  file.settings.chanceGame = 'revolver'
  file.settings.chanceRevolverStopKey = '4-2-all'
  file.settings.chanceMemory = { 'unknown-model': '0,4,6' }
  file.sets = Array.from({ length: 7400 }, (_, position) => ({
    id: 's-' + position,
    position,
    workoutExerciseId,
    weightGrams: 15563,
    reps: 7,
    status: 'LOGGED',
    loggedAt: TIME,
    createdAt,
    updatedAt
  }))

  const text = JSON.stringify(file)
  assert.ok(Buffer.byteLength(text) > MB)
  assert.throws(() => storage.setStorageSync('test', text), /over 1 MB/)
  for (const failure of ['file', 'pointer']) {
    fail(failure)
    assert.throws(() => importWorkoutBackup(text, { storage }), /write/)
    assert.equal(storage.getStorageSync(ACTIVE_FILE_KEY), 'a')
    assert.equal(store.getWorkout(existing.workoutId).items[0].draft.id, existingDraft)
    assert.deepEqual(readAppState(storage).chance, {})
  }
  fail()
  importWorkoutBackup(text, { storage })
  const slot = storage.getStorageSync(ACTIVE_FILE_KEY)
  assert.equal(slot, 'b')
  assert.ok(readFileSync(join(root, 'exerciseornot-state-' + slot + '.json')).length > MB)
  assert.equal(store.listHistory()[0].totalSets, 7400)
  assert.equal(readAppState(storage).chance.revolverStopKey, '4-2-all')
  updateAppState(storage, state => { state.chance.target = 0.6 })
  assert.equal(store.listHistory()[0].totalSets, 7400)
  undoLastRestore({ storage })
  assert.equal(store.getWorkout(existing.workoutId).items[0].draft.id, existingDraft)
  assert.deepEqual(readAppState(storage).chance, {})
})
