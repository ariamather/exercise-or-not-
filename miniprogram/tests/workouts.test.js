const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  EXERCISE_PRESETS,
  createWorkoutStore,
  formatWeight,
  formatSet
} = require('../lib/workouts')
const { APP_STATE_KEY } = require('../lib/workout-storage')

function fixture(date = '2025-11-24') {
  let time = Date.parse(date + 'T12:00:00')
  const values = new Map()
  let writeError
  const storage = {
    getStorageSync(key) {
      return values.get(key)
    },
    setStorageSync(key, data) {
      assert.equal(key, APP_STATE_KEY)
      if (writeError) throw writeError
      values.set(key, data)
    }
  }
  const options = { now: () => time }
  return {
    store: createWorkoutStore(storage, options),
    reopen: () => createWorkoutStore(storage, options),
    setTime: dateTime => { time = Date.parse(dateTime) },
    failWrites: error => { writeError = error },
    raw: () => values.get(APP_STATE_KEY),
    corrupt: value => { values.set(APP_STATE_KEY, value) }
  }
}

test('exercise suggestions are independent of the store and choosing a draft leaves history empty', () => {
  const { store, reopen } = fixture()
  assert.ok(EXERCISE_PRESETS.length)
  assert.deepEqual(store.listExercises(), [])
  const selected = store.createAndSelectExercise('  杠铃卧推  ', 'TOTAL')
  const entry = reopen().getWorkout(selected.workoutId)
  assert.equal(entry.date, '2025-11-24')
  assert.equal(entry.items[0].id, selected.itemId)
  assert.equal(entry.items[0].name, '杠铃卧推')
  assert.equal(entry.items[0].draft.status, 'DRAFT')
  assert.equal(store.listExercises()[0].lastUsedAt, null)
  assert.deepEqual(store.listHistory(), [])
  assert.equal(store.getStats().isEmpty, true)
})

test('same-day selections resume the workout and log a set once when confirmation repeats', () => {
  const { store, reopen } = fixture()
  const first = store.createAndSelectExercise('哑铃肩推', 'PER_SIDE')
  const second = store.createAndSelectExercise('引体向上', 'BODYWEIGHT')
  assert.equal(second.workoutId, first.workoutId)
  const initial = store.getWorkout(first.workoutId).items[0].draft
  store.saveDraft(initial.id, { weightKg: '15.0625', reps: '' })
  assert.equal(reopen().latestWorkout().items[0].draft.weightGrams, 15063)
  assert.throws(() => store.addSet(initial.id, { weightKg: '15.0625', reps: '' }), /次数/)
  const nextId = store.addSet(initial.id, { weightKg: '15.0625', reps: '8' })
  assert.equal(store.addSet(initial.id, { weightKg: '99', reps: '6' }), nextId)
  reopen().saveDraft(initial.id, { weightKg: null, reps: null })
  const workout = reopen().latestWorkout()
  const item = workout.items[0]
  assert.equal(workout.totalSets, 1)
  assert.equal(item.sets[0].weightGrams, 15063)
  assert.equal(item.sets[0].reps, 8)
  assert.equal(item.draft.id, nextId)
  assert.equal(formatWeight(item.draft.weightGrams), '15.063')
  assert.equal(item.draft.reps, 8)
  assert.deepEqual(store.listHistory()[0].items.map(row => row.name), ['哑铃肩推'])
})

test('the same exercise history skips a draft-only day and uses the most recent completed workout', () => {
  const { store } = fixture()
  const { workoutId } = store.createAndSelectExercise('深蹲', 'TOTAL', { date: '2025-11-21' })
  const first = store.getWorkout(workoutId).items[0]
  const secondSet = store.addSet(first.draft.id, { weightKg: '60', reps: 9 })
  store.addSet(secondSet, { weightKg: '62,5', reps: 8 })
  store.selectExercise(first.exerciseId, { date: '2025-11-23' })
  const today = store.selectExercise(first.exerciseId)
  const item = store.getWorkout(today.workoutId).items[0]
  assert.equal(item.previous.date, '2025-11-21')
  assert.deepEqual(item.previous.sets.map(set => set.weightGrams), [60000, 62500])
  assert.equal(item.draft.weightGrams, 62500)
  assert.equal(item.draft.reps, 8)
  assert.deepEqual(store.getPrevious(item.id), item.previous)
  assert.equal(store.listExerciseHistory(first.exerciseId).length, 1)
})

test('same-day previous attempts require a strictly earlier performed time', () => {
  const { store, setTime } = fixture()
  const exercise = store.createExercise('杠铃卧推', 'TOTAL')
  const first = store.selectExercise(exercise.id, { date: '2025-11-23', newWorkout: true })
  const firstWorkout = store.getWorkout(first.workoutId)
  store.addSet(firstWorkout.items[0].draft.id, { weightKg: 50, reps: 10 })

  setTime('2025-11-24T12:00:01.001')
  const sameTime = store.selectExercise(exercise.id, { date: '2025-11-23', newWorkout: true })
  const secondWorkout = store.getWorkout(sameTime.workoutId)
  assert.equal(secondWorkout.performedAt, firstWorkout.performedAt)
  assert.ok(secondWorkout.createdAt > firstWorkout.createdAt)
  assert.equal(secondWorkout.items[0].previous, null)
  assert.equal(secondWorkout.items[0].draft.weightGrams, null)

  const earlierToday = store.selectExercise(exercise.id, { newWorkout: true })
  const earlierWorkout = store.getWorkout(earlierToday.workoutId)
  store.addSet(earlierWorkout.items[0].draft.id, { weightKg: 60, reps: 8 })
  setTime('2025-11-24T12:00:01.002')
  const laterToday = store.selectExercise(exercise.id, { newWorkout: true })
  const laterWorkout = store.getWorkout(laterToday.workoutId)
  assert.equal(laterWorkout.performedAt - earlierWorkout.performedAt, 1)
  assert.equal(laterWorkout.items[0].previous.workoutId, earlierToday.workoutId)
  assert.equal(laterWorkout.items[0].draft.weightGrams, 60000)
})

test('weight modes preserve zero and optional added weight, while rejecting invalid values', () => {
  const { store } = fixture()
  const bodyweight = store.createAndSelectExercise('俯卧撑', 'BODYWEIGHT')
  const weighted = store.createAndSelectExercise('深蹲', 'TOTAL')
  const [body, squat] = store.getWorkout(bodyweight.workoutId).items
  const next = store.addSet(body.draft.id, { weightKg: '', reps: 12 })
  store.addSet(next, { weightKg: '5', reps: 10 })
  assert.equal(formatSet(store.getWorkout(bodyweight.workoutId).items[0].sets[0]), '自重 × 12 次')
  assert.equal(formatSet(store.getWorkout(bodyweight.workoutId).items[0].sets[1], 'BODYWEIGHT'), '自重 + 5 kg × 10 次')
  assert.throws(() => store.addSet(squat.draft.id, { weightKg: '', reps: 10 }), /填写重量/)
  assert.throws(() => store.addSet(squat.draft.id, { weightKg: '-1', reps: 10 }), /非负/)
  assert.throws(() => store.addSet(squat.draft.id, { weightKg: '2147483.648', reps: 10 }), /范围/)
  assert.throws(() => store.addSet(squat.draft.id, { weightKg: '60', reps: '3.5' }), /次数/)
  store.addSet(squat.draft.id, { weightKg: 0, reps: 10 })
  assert.equal(store.getWorkout(weighted.workoutId).items[1].sets[0].weightGrams, 0)
})

test('backfilled workouts appear on their training dates and factor into calendar and trends', () => {
  const { store, setTime } = fixture('2025-03-31')
  const exercise = store.createExercise('俯卧撑', 'BODYWEIGHT')
  const days = ['2025-02-28', '2025-03-10', '2025-03-31']
  for (const [index, date] of days.entries()) {
    const result = store.selectExercise(exercise.id, { date })
    const { draft } = store.getWorkout(result.workoutId).items[0]
    store.addSet(draft.id, { weightKg: index ? '1.5' : '', reps: index + 10 })
    setTime('2025-03-31T12:00:0' + (index + 1))
  }
  const todayExtra = store.selectExercise(exercise.id, { newWorkout: true })
  const extra = store.getWorkout(todayExtra.workoutId).items[0]
  assert.equal(extra.previous.date, '2025-03-31')
  store.addSet(extra.draft.id, { weightKg: '', reps: 14 })

  const summary = store.getStats()
  assert.equal(summary.monthDays, 2)
  assert.equal(summary.monthSets, 3)
  assert.equal(summary.monthExercises, 1)
  assert.equal(summary.lastMonthSameDays, 1)
  assert.equal(summary.lastTrainedDay, '2025-03-31')
  assert.equal(summary.heatStart, '2025-01-13')
  assert.deepEqual(summary.exercises.map(row => row.metric), ['REPS'])
  assert.equal(summary.exercises[0].sessionCount, 4)
  assert.deepEqual(summary.exercises[0].sessions.map(session => session.value), [10, 11, 12, 14])
  assert.equal(summary.days['2025-03-31'].totalSets, 2)
  assert.equal(summary.days['2025-03-31'].workoutId, todayExtra.workoutId)
  assert.deepEqual(store.listHistoryDays().map(day => day.date), days.reverse())
})

test('editing or renaming retains original logging times and historical exercise labels', () => {
  const { store, setTime } = fixture()
  const selection = store.createAndSelectExercise('推举', 'TOTAL')
  const initial = store.getWorkout(selection.workoutId).items[0]
  store.addSet(initial.draft.id, { weightKg: '20', reps: 8 })
  const logged = store.listHistory()[0].items[0].sets[0]
  setTime('2025-11-24T15:00:00')
  store.updateSet(logged.id, { weightKg: '21', reps: 7 })
  store.renameExercise(initial.exerciseId, '杠铃推举')
  const edited = store.listHistory()[0].items[0]
  assert.equal(edited.name, '推举')
  assert.equal(edited.sets[0].loggedAt, logged.loggedAt)
  assert.equal(edited.sets[0].weightGrams, 21000)
  assert.equal(edited.sets[0].reps, 7)
  store.archiveExercise(initial.exerciseId)
  assert.deepEqual(store.listExercises(), [])
  assert.equal(store.createExercise('杠铃推举', 'BODYWEIGHT').weightMode, 'TOTAL')
  store.changeWorkoutDate(selection.workoutId, '2025-11-22')
  assert.equal(store.listHistory()[0].date, '2025-11-22')
  store.deleteSet(logged.id)
  assert.deepEqual(store.listHistory(), [])
  assert.equal(store.getWorkout(selection.workoutId).items[0].draft.reps, 8)
  store.deleteWorkout(selection.workoutId)
  assert.equal(store.getWorkout(selection.workoutId), null)
})

test('reusing a workout creates drafts only and skips existing and archived definitions', () => {
  const { store } = fixture()
  const source = store.createAndSelectExercise('卧推', 'TOTAL', { date: '2025-11-22' })
  const archived = store.createAndSelectExercise('俯卧撑', 'BODYWEIGHT', { workoutId: source.workoutId })
  const items = store.getWorkout(source.workoutId).items
  store.addSet(items[0].draft.id, { weightKg: '40', reps: 8 })
  store.addSet(items[1].draft.id, { weightKg: '', reps: 9 })
  store.archiveExercise(items.find(item => item.id === archived.itemId).exerciseId)
  const result = store.reuseWorkout(source.workoutId)
  assert.equal(result.added, 1)
  assert.equal(result.skippedArchived, 1)
  assert.equal(store.latestWorkout().items[0].draft.weightGrams, 40000)
  assert.equal(store.latestWorkout().totalSets, 0)
  assert.equal(store.reuseWorkout(source.workoutId).skippedExisting, 1)
  assert.equal(store.listHistory().length, 1)
})

test('failed writes and invalid changes cannot partially save anything', () => {
  const { store, reopen, failWrites, raw, corrupt } = fixture()
  assert.throws(() => store.createAndSelectExercise('卧推', 'TOTAL', { date: '2025-11-25' }), /晚于今天/)
  assert.throws(() => store.createAndSelectExercise('卧推', 'TOTAL', { date: '2025-02-30' }), /日期格式/)
  assert.deepEqual(store.listExercises(), [])
  const selection = store.createAndSelectExercise('卧推', 'TOTAL')
  const { draft } = store.getWorkout(selection.workoutId).items[0]
  const project = raw()
  failWrites(new Error('disk full'))
  assert.throws(() => store.addSet(draft.id, { weightKg: '20', reps: 8 }), /disk full/)
  assert.equal(raw(), project)
  assert.equal(reopen().getWorkout(selection.workoutId).items[0].draft.id, draft.id)
  failWrites()
  store.addSet(draft.id, { weightKg: '20', reps: 8 })
  assert.equal(reopen().listHistory()[0].totalSets, 1)
  corrupt('{')
  assert.throws(() => store.createExercise('俯卧撑', 'BODYWEIGHT'), /无法读取/)
  assert.equal(raw(), '{')
})

test('delete undo preserves set, item and workout IDs, times and order', () => {
  const { store } = fixture()
  const chosen = store.createAndSelectExercise('卧推', 'TOTAL')
  const set = store.getWorkout(chosen.workoutId).items[0].draft
  const second = store.addSet(set.id, { weightKg: '30', reps: 9 })
  store.addSet(second, { weightKg: '40', reps: 8 })
  store.createAndSelectExercise('引体向上', 'BODYWEIGHT')
  const before = store.getWorkout(chosen.workoutId)
  const removedFirst = store.deleteSet(set.id)
  const removedSecond = store.deleteSet(second)
  store.undo(removedFirst)
  store.undo(removedSecond)
  assert.deepEqual(store.getWorkout(chosen.workoutId).items[0].sets, before.items[0].sets)
  const removedExercise = store.removeExercise(chosen.itemId)
  assert.equal(store.getWorkout(chosen.workoutId).items.length, 1)
  store.undo(removedExercise)
  const removedWorkout = store.deleteWorkout(chosen.workoutId)
  assert.equal(store.getWorkout(chosen.workoutId), null)
  store.undo(removedWorkout)
  assert.deepEqual(store.getWorkout(chosen.workoutId), before)
})

test('latest activity uses the latest set creation even when a session is backfilled', () => {
  const { store, setTime } = fixture()
  const current = store.createAndSelectExercise('卧推', 'TOTAL')
  setTime('2025-11-24T16:00:00')
  const earlier = store.createAndSelectExercise('深蹲', 'TOTAL', { date: '2025-11-21' })
  assert.equal(store.latestWorkout().id, current.workoutId)
  assert.equal(store.latestActivityWorkout().id, earlier.workoutId)
  assert.deepEqual(store.listWorkouts().map(workout => workout.id), [current.workoutId, earlier.workoutId])
  store.archiveExercise(store.getWorkout(current.workoutId).items[0].exerciseId)
  assert.equal(store.getWorkout(current.workoutId).items.length, 1)
  const item = store.getWorkout(current.workoutId).items[0]
  assert.equal(store.selectExercise(item.exerciseId, { workoutId: current.workoutId }).itemId, item.id)
  assert.throws(() => store.selectExercise(item.exerciseId, { newWorkout: true }), /归档/)
})
