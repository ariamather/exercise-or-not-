const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createWorkoutStore } = require('../lib/workouts')
const { APP_STATE_KEY, readAppState, updateAppState } = require('../lib/workout-storage')
const { MAX_BACKUP_LENGTH, previewWorkoutBackup, importWorkoutBackup, exportWorkoutBackup,
  getBackupStatus, markBackupExported, undoLastRestore } = require('../lib/workout-backup')
const backupPage = require('../lib/backup-page')

const NOW = Date.parse('2025-04-10T12:00:00+08:00')

function fixture() {
  const values = new Map()
  let writeFailure
  const storage = {
    getStorageSync: key => values.get(key),
    setStorageSync(key, data) {
      if (writeFailure) throw writeFailure
      values.set(key, data)
    }
  }
  return {
    storage,
    store: createWorkoutStore(storage, { now: () => NOW }),
    failWrites: error => { writeFailure = error }
  }
}

function androidFile() {
  const times = { createdAt: NOW, updatedAt: NOW }
  const logged = {
    workoutExerciseId: 'item-42',
    weightGrams: 60000,
    reps: 7,
    status: 'LOGGED',
    loggedAt: NOW,
    ...times
  }
  return {
    formatVersion: 1,
    schemaVersion: 1,
    appVersion: '0.5.0',
    exportedAt: NOW,
    exercises: [
      { id: 'exercise-1', name: '杠铃深蹲', weightMode: 'TOTAL', archived: false, ...times },
      { id: 'exercise-2', name: '引体向上', weightMode: 'BODYWEIGHT', archived: true, ...times }
    ],
    workouts: [
      { id: 'workout-3', trainingDate: '2025-04-09', performedAt: NOW - 86400000, zoneId: 'Asia/Shanghai', ...times }
    ],
    workoutExercises: [
      {
        id: 'item-42',
        workoutId: 'workout-3',
        exerciseId: 'exercise-1',
        position: 2,
        nameSnapshot: '深蹲',
        weightModeSnapshot: 'TOTAL',
        ...times
      }
    ],
    sets: [
      { id: 'set-52', position: 3, ...logged },
      { id: 'set-51', position: 1, ...logged, weightGrams: 57500, reps: 8 },
      { id: 'set-53', position: 4, ...logged, status: 'DRAFT', reps: null, loggedAt: null }
    ],
    settings: { diceTrainFaces: [5, 6], chanceGame: 'lots', chanceTarget: 0.33, chanceMemory: { lot: 'data' } }
  }
}

test('preview reads Android v1 workouts without touching the store', () => {
  const { storage } = fixture()
  const preview = previewWorkoutBackup('\uFEFF' + JSON.stringify(androidFile()))
  assert.deepEqual(preview, {
    formatVersion: 1,
    appVersion: '0.5.0',
    exportedAt: NOW,
    exerciseCount: 2,
    workoutCount: 1,
    loggedSetCount: 2,
    draftCount: 1,
    firstDate: '2025-04-09',
    lastDate: '2025-04-09',
    restoresChance: true,
    chanceGame: '签筒',
    unavailableChanceGame: null,
    chanceTarget: 0.33
  })
  assert.equal(storage.getStorageSync(APP_STATE_KEY), undefined)
})

test('Android import restores ordered rows, snapshots, pending input and IDs in one replacement', () => {
  const { storage, store } = fixture()
  store.createAndSelectExercise('卧推', 'TOTAL')
  const file = androidFile()
  importWorkoutBackup(JSON.stringify(file), { storage })
  assert.equal(readAppState(storage).chance.gameId, 'lots')
  assert.deepEqual(store.listExercises().map(row => row.name), ['杠铃深蹲'])
  const [day] = store.listHistoryDays()
  assert.equal(day.date, '2025-04-09')
  assert.equal(day.totalSets, 2)
  const uploaded = store.getWorkout('workout-3')
  assert.equal(uploaded.zoneId, 'Asia/Shanghai')
  assert.equal(uploaded.items[0].name, '深蹲')
  assert.deepEqual(uploaded.items[0].sets.map(row => row.weightGrams), [57500, 60000])
  const draft = uploaded.items[0].draft
  assert.equal(draft.id, 'set-53')
  assert.equal(draft.reps, null)
  assert.equal(store.addSet(draft.id, { weightKg: '61', reps: '6' }), 'set-54')
  assert.equal(store.getWorkout('workout-3').items[0].draft.position, 5)
})

test('Android v1 export round trips training metadata, exact gameplay probability and memory', () => {
  const source = fixture()
  const target = fixture()
  const android = androidFile()
  importWorkoutBackup(JSON.stringify(android), { storage: source.storage })
  const exported = exportWorkoutBackup({ storage: source.storage, now: () => NOW })
  const file = JSON.parse(exported)
  assert.deepEqual(file.settings, {
    ...android.settings,
    chanceRevolverStopKey: null,
    chanceResult: null
  })
  assert.equal(file.workouts[0].zoneId, 'Asia/Shanghai')
  assert.deepEqual(file.exercises, android.exercises)
  assert.deepEqual(file.workoutExercises, android.workoutExercises)
  assert.deepEqual(file.sets, android.sets.sort((a, b) => a.position - b.position))
  assert.equal(importWorkoutBackup(exported, { storage: target.storage }).restoresChance, true)
  assert.deepEqual(readAppState(source.storage).chance, readAppState(target.storage).chance)
  assert.deepEqual(target.store.listHistory(), source.store.listHistory())

  const native = source.store.createAndSelectExercise('划船', 'PER_SIDE')
  const ownDraft = source.store.getWorkout(native.workoutId).items[0].draft
  source.store.addSet(ownDraft.id, { weightKg: '15.0625', reps: 12 })
  const withNative = exportWorkoutBackup({ storage: source.storage })
  assert.equal(importWorkoutBackup(withNative, { storage: target.storage }).loggedSetCount, 3)
  assert.deepEqual(target.store.listHistory(), source.store.listHistory())
})

test('unsupported versions, bad references and slot errors leave the original training data intact', () => {
  const { storage, store, failWrites } = fixture()
  store.createAndSelectExercise('俯卧撑', 'BODYWEIGHT')
  const before = storage.getStorageSync(APP_STATE_KEY)
  const mutations = [
    [file => { file.formatVersion = 2 }, /版本不受支持/],
    [file => { file.workoutExercises[0].workoutId = 'missing' }, /不存在的训练/],
    [file => { file.workouts[0].trainingDate = '2025-02-30' }, /日期格式/],
    [file => { file.workouts[0].zoneId = 'Invalid/Zone' }, /时区/],
    [file => { file.exercises[0].weightMode = 'CUSTOM' }, /重量口径/],
    [file => { file.sets[0].weightGrams = -1 }, /重量/],
    [file => { file.sets[0].loggedAt = null }, /记录时间/],
    [file => { file.sets[0].notes = 'warmup' }, /不支持的字段/],
    [file => { file.sets.push({ ...file.sets[2], id: 'another-draft' }) }, /多个待确认组/],
    [file => { file.exercises.push({ ...file.exercises[0] }) }, /ID 重复/],
    [file => { file.settings.chanceTarget = 1.1 }, /训练概率/],
    [file => { file.settings.chanceMemory = { '../lot': 'data' } }, /玩法记忆/]
  ]
  for (const [mutate, error] of mutations) {
    const file = androidFile()
    mutate(file)
    assert.throws(() => importWorkoutBackup(JSON.stringify(file), { storage }), error)
    assert.equal(storage.getStorageSync(APP_STATE_KEY), before)
  }
  failWrites(new Error('disk full'))
  assert.throws(() => importWorkoutBackup(JSON.stringify(androidFile()), { storage }), /disk full/)
  assert.equal(storage.getStorageSync(APP_STATE_KEY), before)
})

test('undo restore rolls all local training and chance back and expires deleted row snapshots', () => {
  const { storage, store } = fixture()
  const before = { gameId: 'slot', target: 0.625, memory: { 'x-model': '42' } }
  updateAppState(storage, app => { app.chance = before })
  const workout = store.createAndSelectExercise('推举', 'TOTAL')
  const deleted = store.removeExercise(workout.itemId)
  const exportedAt = NOW - 10000
  markBackupExported(exportedAt, { storage })
  const file = androidFile()
  file.settings.chanceGame = 'revolver'
  file.settings.chanceTarget = 0.5
  file.settings.chanceRevolverStopKey = '1-3-any'
  importWorkoutBackup(JSON.stringify(file), { storage, now: () => NOW })
  assert.equal(readAppState(storage).chance.revolverStopKey, '1-3-any')
  assert.equal(getBackupStatus({ storage }).undoAvailableAt, NOW)
  assert.equal(getBackupStatus({ storage }).lastExportAt, exportedAt)
  assert.throws(() => store.undo(deleted), /已替换/)
  undoLastRestore({ storage })
  assert.deepEqual(readAppState(storage).chance, before)
  assert.deepEqual(store.listExercises().map(item => item.name), ['推举'])
  assert.equal(getBackupStatus({ storage }).undoAvailableAt, null)
  assert.equal(getBackupStatus({ storage }).lastExportAt, exportedAt)
  assert.throws(() => undoLastRestore({ storage }), /没有可撤销/)
})

test('supports old Android face-only and the previous mini-program training-only exports', () => {
  const { storage } = fixture()
  const old = androidFile()
  old.settings = { diceTrainFaces: [2, 2, 6] }
  assert.equal(importWorkoutBackup(JSON.stringify(old), { storage }).chanceTarget, 1 / 3)
  assert.equal(readAppState(storage).chance.target, 1 / 3)
  old.settings.diceTrainFaces = [4, 5, 6]
  old.workoutsOnly = true
  assert.equal(importWorkoutBackup(JSON.stringify(old), { storage }).restoresChance, false)
  assert.equal(readAppState(storage).chance.target, 1 / 3)
})

test('editing an imported date retains its original time of day across time zones', () => {
  const { storage, store } = fixture()
  const file = androidFile()
  file.workouts[0].trainingDate = '2025-03-08'
  file.workouts[0].zoneId = 'America/New_York'
  file.workouts[0].performedAt = Date.parse('2025-03-08T02:30:00-05:00')
  importWorkoutBackup(JSON.stringify(file), { storage })
  store.changeWorkoutDate('workout-3', '2025-03-09')
  const moved = store.getWorkout('workout-3')
  assert.equal(moved.zoneId, 'America/New_York')
  assert.equal(moved.performedAt, Date.parse('2025-03-09T03:30:00-04:00'))
})

test('settings restores a chosen file after confirmation, can undo, and timestamps only a shared export', t => {
  const { storage, store } = fixture()
  store.createExercise('恢复之前', 'TOTAL')
  const content = JSON.stringify(androidFile())
  const disk = new Map([['/chosen.json', content]])
  const fs = {
    writeFileSync(path, data) { disk.set(path, data) },
    readFileSync(path) { return disk.get(path) },
    writeFile({ filePath, data, success }) { disk.set(filePath, data); success() },
    readFile({ filePath, success }) { success({ data: disk.get(filePath) }) }
  }
  let modal, share
  const original = global.wx
  t.after(() => { global.wx = original })
  global.wx = {
    ...storage, env: { USER_DATA_PATH: '/sandbox' }, getFileSystemManager: () => fs,
    chooseMessageFile({ success }) { success({ tempFiles: [{ path: '/chosen.json', size: Buffer.byteLength(content) }] }) },
    showModal(options) { modal = options },
    shareFileMessage(options) { share = options }
  }
  const page = { ...backupPage, data: { ...backupPage.data }, setData(change) { Object.assign(this.data, change) } }
  page.chooseBackup()
  assert.match(modal.content, /2 个动作，1 场训练，2 组已记录，1 组待确认/)
  modal.success({ confirm: false })
  assert.equal(page.data.busy, false)
  assert.equal(createWorkoutStore(global.wx).listExercises()[0].name, '恢复之前')
  page.chooseBackup()
  modal.success({ confirm: true })
  assert.equal(createWorkoutStore(global.wx).getWorkout('workout-3').totalSets, 2)
  page.confirmUndoRestore()
  modal.success({ confirm: true })
  assert.equal(createWorkoutStore(global.wx).listExercises()[0].name, '恢复之前')
  page.exportBackup()
  assert.equal(JSON.parse(disk.get(share.filePath)).exercises[0].name, '恢复之前')
  assert.equal(page.data.busy, true)
  share.fail({ errMsg: 'shareFileMessage:fail cancel' })
  assert.equal(page.data.lastExportText, '从未导出')
  page.exportBackup()
  share.success()
  assert.equal(page.data.busy, false)
  assert.notEqual(page.data.lastExportText, '从未导出')
})

test('export accepts an exact 20 MiB UTF-8 backup and blocks sharing one byte over the restore limit', t => {
  const { storage } = fixture()
  const options = { storage, now: () => NOW }
  const baseline = JSON.parse(exportWorkoutBackup(options))
  const memory = baseline.settings.chanceMemory
  const multibyte = '备'.repeat(16384)
  for (let i = 0; i < 426; i += 1) memory['test' + i] = multibyte
  memory.tail = ''
  const remaining = MAX_BACKUP_LENGTH - Buffer.byteLength(JSON.stringify(baseline))
  memory.tail = '备'.repeat(Math.floor(remaining / 3)) + 'a'.repeat(remaining % 3)
  updateAppState(storage, app => { app.chance.memory = memory })
  const exported = exportWorkoutBackup(options)
  assert.equal(Buffer.byteLength(exported), MAX_BACKUP_LENGTH)
  assert.ok(exported.length < MAX_BACKUP_LENGTH)
  assert.equal(previewWorkoutBackup(exported).restoresChance, true)

  memory.tail += 'a'
  updateAppState(storage, app => { app.chance.memory = memory })
  let filesWritten = 0
  let filesShared = 0
  const originalWx = global.wx
  t.after(() => { global.wx = originalWx })
  global.wx = {
    ...storage,
    env: { USER_DATA_PATH: '/sandbox' },
    getFileSystemManager: () => ({ writeFile() { filesWritten += 1 } }),
    shareFileMessage() { filesShared += 1 }
  }
  const page = {
    ...backupPage,
    data: { ...backupPage.data },
    setData(patch) { Object.assign(this.data, patch) }
  }
  assert.throws(() => exportWorkoutBackup(options), /超过 20 MB/)
  page.exportBackup()
  assert.equal(filesWritten, 0)
  assert.equal(filesShared, 0)
  assert.equal(page.data.busy, false)
  assert.match(page.data.backupNote, /超过 20 MB/)
})
