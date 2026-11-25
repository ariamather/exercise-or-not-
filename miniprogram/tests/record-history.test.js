const assert = require('node:assert/strict')
const { test } = require('node:test')
const { getStore } = require('../lib/workouts')
const { updateAppState } = require('../lib/workout-storage')
const { REQUEST_KEY, monthView, sliderWindow } = require('../pages/record/model')

const tap = dataset => ({ currentTarget: { dataset } })
const input = (value, type) => ({ detail: { value }, type })

test('records, edits, compares, resumes, reuses, and restores Android-style sessions from the page events', async t => {
  const values = new Map()
  const events = {}
  t.mock.method(Date, 'now', () => time)
  let time = new Date(2026, 10, 24, 10, 12).getTime()
  global.wx = {
    getStorageSync: key => values.get(key) ?? '',
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key),
    getWindowInfo: () => ({ statusBarHeight: 47, windowWidth: 393 }),
    getMenuButtonBoundingClientRect: () => ({ left: 295 }),
    navigateTo: config => { events.navigate = config },
    switchTab: config => { events.switchTab = config },
    pageScrollTo: () => {},
    showActionSheet: config => { events.action = config },
  }

  function loadPage(path) {
    let definition
    global.Page = config => { definition = config }
    require(path)
    const page = {
      ...definition,
      data: JSON.parse(JSON.stringify(definition.data)),
      tabBar: { data: { modalOpen: false }, setData(patch) { Object.assign(this.data, patch) } },
      getTabBar() { return this.tabBar },
      setData(patch, callback) {
        for (const [key, value] of Object.entries(patch)) {
          const [head, child] = key.replace(/\[(\d+)\]/g, '.$1').split('.')
          if (child) this.data[head][child] = value
          else this.data[head] = value
        }
        if (callback) callback()
      },
    }
    page.onLoad({})
    return page
  }

  const record = loadPage('../pages/record/index.js')
  const history = loadPage('../pages/history/index.js')
  t.after(() => {
    record.onUnload()
    history.onUnload()
    delete global.wx
    delete global.Page
  })
  const store = getStore()
  const squat = store.createExercise('深蹲', 'TOTAL')
  const yesterday = store.selectExercise(squat.id, { date: '2026-11-23' })
  const previousDraft = store.getWorkout(yesterday.workoutId).items[0].draft
  store.addSet(previousDraft.id, { weightKg: 55, reps: 8 })

  record.onShow()
  assert.equal(record.data.statusTop, 47)
  assert.equal(record.data.capsuleRight, 98)
  assert.equal(record.data.item, null)
  assert.equal(record.data.resume.id, yesterday.workoutId)
  assert.equal(record.data.showRecordHint, false)
  assert.equal(record.tabBar.data.modalOpen, false)
  record.openPicker()
  assert.equal(record.tabBar.data.modalOpen, true)
  record.onHide()
  assert.equal(record.tabBar.data.modalOpen, false)
  record.onShow()
  assert.equal(record.tabBar.data.modalOpen, true)
  record.onSearchInput(input('深'))
  record.pickExercise(tap({ id: squat.id }))
  assert.equal(record.tabBar.data.modalOpen, false)
  assert.equal(record.data.draftWeight, 55)
  assert.equal(record.data.draftReps, 8)
  assert.equal(record.data.item.draftPrevious, '55 kg × 8 次')

  const firstWorkout = record.target.workoutId
  record.chooseStep(tap({ step: 5 }))
  record.nudgeWeight(tap({ delta: 1 }))
  assert.equal(record.data.draftWeight, 60)
  record.changeWeight(input(125, 'change'))
  record.changeReps(input(9, 'change'))
  const firstSet = record.data.item.draftId
  record.confirmSet(tap({ id: firstSet }))
  assert.equal(record.data.totalSets, 1)
  assert.equal(record.data.item.rows[0].current, '62.5 kg × 9 次')
  assert.equal(record.data.item.rows[0].previous, '55 kg × 8 次')
  assert.equal(record.data.draftWeight, 62.5)
  record.confirmSet(tap({ id: firstSet }))
  assert.equal(record.data.totalSets, 1)

  record.openEdit(tap({ id: firstSet }))
  assert.equal(record.tabBar.data.modalOpen, true)
  record.changeEditWeight(input('60'))
  record.changeEditReps(input('10'))
  record.saveEdit()
  assert.equal(record.tabBar.data.modalOpen, false)
  assert.equal(record.data.item.rows[0].current, '60 kg × 10 次')
  record.openEdit(tap({ id: firstSet }))
  record.deleteEdit()
  assert.equal(record.data.item.rows.length, 0)
  assert.equal(record.data.canUndo, true)
  record.undo()
  assert.equal(record.data.item.rows[0].id, firstSet)

  record.openPicker()
  record.onSearchInput(input('举重'))
  record.beginCreate()
  assert.equal(record.tabBar.data.modalOpen, true)
  record.closeDialog()
  assert.equal(record.data.sheet, 'picker')
  assert.equal(record.tabBar.data.modalOpen, true)
  record.beginCreate()
  record.chooseMode(input('PER_SIDE'))
  record.commitCreate()
  assert.equal(record.tabBar.data.modalOpen, false)
  assert.equal(record.data.item.name, '举重')
  assert.equal(record.data.itemCount, 2)
  assert.equal(record.data.stepWeight, 1)
  record.changeReps(input(12, 'change'))
  record.flushDraft()
  const freshDraft = store.getWorkout(firstWorkout).items[1].draft
  assert.equal(freshDraft.reps, 12)
  assert.equal(freshDraft.weightGrams, null)
  const settle = () => new Promise(resolve => setTimeout(resolve, 200))
  const start = { touches: [{ clientX: 90, clientY: 10 }], timeStamp: 100 }
  record.previousItem()
  assert.ok(record.data.pagerOffset > 0)
  await settle()
  assert.equal(record.data.stepWeight, 5)
  record.onCardTouchStart(start)
  record.onCardTouchMove({ touches: [{ clientX: 70, clientY: 100 }] })
  record.onCardTouchEnd({ changedTouches: [{ clientX: 70, clientY: 100 }], timeStamp: 400 })
  assert.equal(record.data.pagerActive, false)
  assert.equal(record.data.item.name, '深蹲')
  record.onCardTouchStart(start)
  record.cancelCardTouch()
  record.onCardTouchMove({ touches: [{ clientX: 24, clientY: 11 }] })
  record.onCardTouchEnd({ changedTouches: [{ clientX: 24, clientY: 11 }], timeStamp: 150 })
  assert.equal(record.data.pagerActive, false)
  assert.equal(record.data.item.name, '深蹲')
  record.onCardTouchStart(start)
  record.onCardTouchMove({ touches: [{ clientX: 24, clientY: 11 }] })
  assert.equal(record.data.pagerOffset, -66)
  assert.equal(record.data.pagerAfter.item.name, '举重')
  assert.equal(record.data.pagerAfter.draftReps, 12)
  assert.equal(record.data.item.name, '深蹲')
  record.onCardTouchEnd({ changedTouches: [{ clientX: 24, clientY: 11 }], timeStamp: 350 })
  assert.ok(record.data.pagerSettling)
  assert.equal(record.data.pagerOffset, 0)
  await settle()
  assert.equal(record.data.item.name, '深蹲')
  assert.equal(record.data.pagerAfter, null)
  record.onCardTouchStart(start)
  record.onCardTouchMove({ touches: [{ clientX: 24, clientY: 11 }] })
  record.onCardTouchEnd({ changedTouches: [{ clientX: 24, clientY: 11 }], timeStamp: 150 })
  assert.ok(record.data.pagerOffset < -66)
  await settle()
  assert.equal(record.data.item.name, '举重')
  assert.equal(record.data.draftReps, 12)
  assert.equal(record.data.pagerActive, false)
  record.removeExercise()
  assert.equal(record.data.itemCount, 1)
  record.undo()
  assert.equal(record.data.item.name, '举重')

  record.openPicker()
  const customId = record.data.item.exerciseId
  record.manageExercise(tap({ id: customId, name: '举重' }))
  events.action.success({ tapIndex: 0 })
  assert.equal(record.tabBar.data.modalOpen, true)
  record.changeName(input('单手哑铃举重'))
  record.commitRename()
  assert.equal(record.tabBar.data.modalOpen, true)
  assert.equal(record.data.item.name, '举重')
  record.manageExercise(tap({ id: customId, name: '单手哑铃举重' }))
  events.action.success({ tapIndex: 1 })
  assert.ok(!store.listExercises().some(item => item.id === customId))
  record.closeSheet()
  assert.equal(record.tabBar.data.modalOpen, false)
  record.openExerciseHistory()
  assert.equal(record.tabBar.data.modalOpen, true)
  assert.equal(record.data.history.name, '举重')
  record.closeSheet()
  assert.equal(record.tabBar.data.modalOpen, false)

  time += 30000
  record.openDate(tap({ kind: 'new' }))
  record.applyDate()
  assert.equal(record.target.newWorkout, true)
  assert.equal(record.data.item, null)
  record.openPicker()
  record.pickExercise(tap({ id: squat.id }))
  const secondWorkout = record.target.workoutId
  assert.notEqual(secondWorkout, firstWorkout)
  assert.equal(record.data.item.draftPrevious, '60 kg × 10 次')
  record.confirmSet(tap({ id: record.data.item.draftId }))
  assert.equal(store.listWorkouts('2026-11-24').length, 2)

  record.openDate(tap({ kind: 'change' }))
  assert.equal(record.tabBar.data.modalOpen, true)
  record.toggleDateInput()
  record.changeDateInput(input('2026-12-24'))
  record.applyDate()
  assert.match(record.data.dialogError, /有效日期/)
  assert.equal(record.tabBar.data.modalOpen, true)
  record.changeDateInput(input('2026-11-22'))
  record.applyDate()
  assert.equal(record.tabBar.data.modalOpen, false)
  assert.equal(store.getWorkout(secondWorkout).date, '2026-11-22')
  assert.equal(record.data.past, true)

  record.openHistory()
  assert.equal(events.navigate.url, '/pages/history/index')
  record.onHide()
  history.onShow()
  assert.equal(history.data.workouts.length, 3)
  history.openWorkout(tap({ id: firstWorkout }))
  assert.equal(events.switchTab.url, '/pages/record/index')
  assert.equal(values.get(REQUEST_KEY).workoutId, firstWorkout)
  record.onShow()
  assert.equal(record.target.workoutId, firstWorkout)
  assert.equal(values.has(REQUEST_KEY), false)

  history.deleteWorkout(tap({ id: secondWorkout }))
  assert.equal(history.data.workoutCount, 2)
  assert.equal(history.data.workouts.filter(workout => !workout.deleted).length, 2)
  history.undo()
  assert.equal(history.data.workoutCount, 3)
  history.openSettings()
  assert.equal(events.navigate.url, '/pages/settings/index')

  history.reuseWorkout(tap({ id: yesterday.workoutId }))
  const reused = values.get(REQUEST_KEY)
  assert.match(reused.notice, /已复用 1/)
  record.onShow()
  assert.equal(record.target.workoutId, reused.workoutId)
  assert.equal(store.getWorkout(reused.workoutId).totalSets, 0)
  assert.ok(store.getWorkout(reused.workoutId).items[0].draft)

  updateAppState(wx, app => { app.workouts.generation = (app.workouts.generation || 0) + 1 })
  record.onShow()
  assert.equal(record.data.notice, '')

  for (let index = 0; index < 23; index++) {
    time += 1000
    store.selectExercise(squat.id, { newWorkout: true })
  }
  history.onShow()
  assert.equal(history.data.workoutCount, 27)
  assert.equal(history.data.workouts.length, 20)
  assert.equal(history.data.showBackupHint, true)
  history.onReachBottom()
  assert.equal(history.data.workouts.length, 27)
  const older = history.data.workouts[25]
  history.deleteWorkout(tap({ id: older.id }))
  assert.equal(history.data.workouts.length, 27)
  assert.equal(history.data.workoutCount, 26)
  assert.equal(history.data.workouts[25].deleted, true)
  history.undo()
  assert.equal(history.data.workouts[25].id, older.id)
  assert.equal(history.data.workoutCount, 27)
})

test('calendar and slider windows stay within the Android date and metric ranges', () => {
  const november = monthView('2026-11', '2026-11-24')
  assert.equal(november.next, '')
  assert.equal(november.previous, '2026-10')
  assert.ok(november.cells.find(cell => cell.day === 25).disabled)
  assert.equal(monthView('2000-01', '2026-11-24').previous, '')
  assert.deepEqual(sliderWindow(62.5, 34), { weightMin: 40, weightMax: 80, repsMax: 40 })
  assert.deepEqual(sliderWindow(0, 10, 40), { weightMin: 0, weightMax: 40, repsMax: 40 })
})
