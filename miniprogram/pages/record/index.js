const {
  EXERCISE_PRESETS, WEIGHT_MODES, formatWeight, getStore,
} = require('../../lib/workouts')
const { isDismissed, dismiss } = require('../../lib/hints')
const { readAppState } = require('../../lib/workout-storage')
const { selectTab } = require('../../lib/tab-selection')
const {
  REQUEST_KEY, WEIGHT_STEPS, dateLabel, recordDateLabel, setLabel, sliderWindow,
  monthView, defaultRecordTarget, errorMessage, chromeInsets,
} = require('./model')

const modeDescriptions = {
  TOTAL: '总重（杠铃、器械）',
  PER_SIDE: '单只（哑铃，记一只的重量）',
  BODYWEIGHT: '自重（可填附加重量）',
}
const PAGER_SETTLE_MS = 180
const idlePager = { pagerActive: false, pagerSettling: false, pagerOffset: 0, pagerBefore: null, pagerAfter: null }
const weightLabels = { TOTAL: '重量', PER_SIDE: '单只重量', BODYWEIGHT: '附加重量' }
const modes = WEIGHT_MODES.map(mode => ({ ...mode, description: modeDescriptions[mode.id] }))

function modeLabel(id) {
  const mode = WEIGHT_MODES.find(item => item.id === id)
  return mode ? mode.label : ''
}

Page({
  data: {
    loading: true, statusTop: 32, capsuleRight: 94, today: '', date: '', dateLabel: '', past: false, resume: null,
    totalSets: 0, item: null, itemCount: 0, index: 0, showRecordHint: false, ...idlePager,
    menu: '', sheet: '', dialog: '', error: '', draftError: '', dialogError: '',
    draftWeight: 0, draftReps: 10, stepWeight: 2.5, weightMin: 0, weightMax: 40, repsMax: 30,
    weightStepperMax: 1000, repsStepperMax: 100, justSaved: false,
    weightSteps: WEIGHT_STEPS, modes, newMode: 'TOTAL', newName: '',
    showSearch: false, query: '', recent: [], others: [], presets: [], pickerError: '', pickerHeight: 0,
    queryName: '', canCreate: false,
    calendar: null, dateChoice: '', dateChoiceLabel: '', dateYearPicker: false, dateYears: [],
    dateInputMode: false, dateInput: '', dateYearTarget: '',
    history: null, edit: null, notice: '', canUndo: false,
  },

  onLoad() {
    this.steps = new Map()
    this.setData(chromeInsets())
  },

  onShow() {
    this.recordVisible = true
    selectTab(this, 'record')
    try {
      let index = this.data.index
      const generation = readAppState(wx).workouts.generation || 0
      if (this.generation != null && this.generation !== generation) {
        clearTimeout(this.draftTimer)
        this.pendingDraft = null
        this.target = null
        this.activeId = ''
        index = 0
        this.steps.clear()
        this.closeOverlays()
        this.clearNotice()
      }
      this.generation = generation
      const request = wx.getStorageSync(REQUEST_KEY)
      if (request && request.workoutId) {
        wx.removeStorageSync(REQUEST_KEY)
        if (!this.target || this.target.workoutId !== request.workoutId) {
          this.activeId = ''
          index = 0
        }
        this.target = { workoutId: request.workoutId }
        this.closeOverlays()
        this.hideMenu()
      }
      this.reload(index)
      if (request && request.notice) this.showNotice(request.notice)
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '无法读取训练记录') })
    } finally {
      this.syncOverlayTabBar()
    }
  },

  onReady() {
    selectTab(this, 'record')
    this.syncOverlayTabBar()
  },

  onHide() {
    this.recordVisible = false
    this.syncOverlayTabBar()
    this.flushDraft()
    this.resetPager()
  },

  onUnload() {
    this.recordVisible = false
    this.syncOverlayTabBar()
    this.flushDraft()
    clearTimeout(this.savedTimer)
    clearTimeout(this.noticeTimer)
    clearTimeout(this.pagerTimer)
  },

  reload(preferredIndex = this.data.index) {
    try {
      const store = getStore()
      const today = store.today()
      if (!this.target) this.target = defaultRecordTarget(store)
      let workout = this.target.workoutId ? store.getWorkout(this.target.workoutId) : null
      if (!workout && this.target.workoutId) {
        this.target = defaultRecordTarget(store)
        this.activeId = ''
        preferredIndex = 0
        workout = this.target.workoutId ? store.getWorkout(this.target.workoutId) : null
      }
      const latest = workout ? null : store.latestActivityWorkout()
      const date = workout ? workout.date : this.target.date
      const items = workout ? workout.items : []
      const retained = items.findIndex(item => item.id === this.activeId)
      this.items = items
      const index = retained >= 0 ? retained : Math.max(0, Math.min(preferredIndex, items.length - 1))
      this.setData({
        loading: false, today, date, error: '',
        dateLabel: recordDateLabel(date),
        past: Boolean(workout && date !== today),
        resume: latest ? { id: latest.id, label: latest.date.slice(5) } : null,
        itemCount: items.length,
        totalSets: workout ? workout.totalSets : 0,
        showRecordHint: !isDismissed('record') && !store.listHistory().length,
      })
      this.displayItem(index)
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '无法读取训练记录') })
    }
  },

  cardView(item, values, previousRepsMax = 0) {
    const prior = item && item.previous ? item.previous.sets : []
    const draftReference = item ? prior[item.sets.length] || prior[prior.length - 1] : null
    const weight = values.weightKg ?? 0
    const reps = values.reps ?? 10
    const defaultStep = item && item.weightMode === 'PER_SIDE' ? 1 : 2.5
    return {
      item: item ? {
        id: item.id, exerciseId: item.exerciseId, name: item.name,
        modeLabel: modeLabel(item.weightMode), weightLabel: weightLabels[item.weightMode],
        draftId: values.id, number: item.sets.length + 1,
        draftPrevious: draftReference ? setLabel(draftReference) : '',
        rows: item.sets.map((set, i) => ({
          id: set.id, number: i + 1, previous: setLabel(prior[i]), current: setLabel(set),
        })),
      } : null,
      draftWeight: weight, draftReps: reps,
      stepWeight: item && this.steps.has(item.id) ? this.steps.get(item.id) : defaultStep,
      ...sliderWindow(weight, reps, previousRepsMax),
      weightStepperMax: Math.max(1000, weight),
      repsStepperMax: Math.max(100, reps),
    }
  },

  draftFor(item) {
    const draft = item && item.draft
    return {
      id: draft ? draft.id : '',
      weightKg: draft && draft.weightGrams != null ? draft.weightGrams / 1000 : null,
      reps: draft ? draft.reps : null,
    }
  },

  displayItem(index) {
    clearTimeout(this.pagerTimer)
    this.cardTouch = null
    const item = this.items[index]
    const sameItem = Boolean(item && this.data.item && item.id === this.data.item.id)
    this.activeId = item ? item.id : ''
    const stored = this.draftFor(item)
    const dirty = this.pendingDraft && this.pendingDraft.id === stored.id
    this.draftValues = dirty ? this.pendingDraft : stored
    this.setData({
      index, ...idlePager,
      ...this.cardView(item, this.draftValues, sameItem ? this.data.repsMax : 0),
      draftError: dirty ? this.data.draftError : '',
      justSaved: sameItem && this.data.justSaved,
    })
  },

  pagerStride() {
    const width = (wx.getWindowInfo ? wx.getWindowInfo().windowWidth : 375) || 375
    // The 96 rpx horizontal body padding is outside the card. Adjacent cards have a 32 rpx gap.
    return width * (750 - 96 + 32) / 750
  },

  startPager(offset = 0, afterRender) {
    const before = this.items[this.data.index - 1]
    const after = this.items[this.data.index + 1]
    this.setData({
      pagerActive: true, pagerOffset: offset,
      pagerBefore: before ? this.cardView(before, this.draftFor(before)) : null,
      pagerAfter: after ? this.cardView(after, this.draftFor(after)) : null,
    }, afterRender)
  },

  resetPager() {
    clearTimeout(this.pagerTimer)
    this.cardTouch = null
    if (this.data.pagerActive) this.setData(idlePager)
  },

  settlePager(delta) {
    const next = this.data.index + delta
    if (delta && !this.flushDraft()) delta = 0
    this.setData({ pagerSettling: true, pagerOffset: delta ? -delta * this.pagerStride() : 0 })
    this.pagerTimer = setTimeout(() => {
      if (delta) this.displayItem(next)
      else this.resetPager()
    }, PAGER_SETTLE_MS)
  },

  changeItem(delta) {
    const next = this.data.index + delta
    if (this.data.pagerActive || next < 0 || next >= this.data.itemCount) return
    this.hideMenu()
    this.startPager(0, () => {
      if (this.data.pagerActive) this.settlePager(delta)
    })
  },

  previousItem() { this.changeItem(-1) },
  nextItem() { this.changeItem(1) },

  onCardTouchStart(event) {
    if (this.data.pagerSettling || this.data.menu) return
    if (event.touches.length !== 1) {
      this.cancelCardTouch()
      return
    }
    const { clientX, clientY } = event.touches[0]
    this.cardTouch = { x: clientX, y: clientY, time: event.timeStamp, axis: '' }
  },

  onCardTouchMove(event) {
    const start = this.cardTouch
    if (!start || start.axis === 'vertical') return
    if (event.touches.length !== 1) {
      this.cancelCardTouch()
      return
    }
    const { clientX, clientY } = event.touches[0]
    const dx = clientX - start.x
    const dy = clientY - start.y
    if (!start.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        start.axis = 'vertical'
        return
      }
      start.axis = 'horizontal'
    }
    const hasNeighbor = dx < 0 ? this.data.index + 1 < this.data.itemCount : this.data.index > 0
    const offset = Math.sign(dx) * Math.min(this.pagerStride(), Math.abs(dx) * (hasNeighbor ? 1 : .26))
    if (this.data.pagerActive) this.setData({ pagerOffset: offset })
    else this.startPager(offset)
  },

  onCardTouchEnd(event) {
    const start = this.cardTouch
    this.cardTouch = null
    if (!start || start.axis !== 'horizontal') return
    if (event.changedTouches.length !== 1) {
      this.settlePager(0)
      return
    }
    const dx = event.changedTouches[0].clientX - start.x
    const elapsed = Math.max(1, event.timeStamp - start.time)
    const delta = dx < 0 ? 1 : -1
    const next = this.data.index + delta
    const distance = Math.abs(dx)
    const canTurn = next >= 0 && next < this.data.itemCount
    const shouldTurn = distance >= this.pagerStride() / 2 || (distance >= 28 && distance / elapsed > .55)
    this.settlePager(canTurn && shouldTurn ? delta : 0)
  },

  cancelCardTouch() {
    this.cardTouch = null
    if (this.data.pagerActive && !this.data.pagerSettling) this.settlePager(0)
  },

  openHistory() {
    this.flushDraft()
    wx.navigateTo({ url: '/pages/history/index' })
  },

  openExisting(event) {
    if (!this.flushDraft()) return
    this.target = { workoutId: event.currentTarget.dataset.id }
    this.activeId = ''
    this.reload(0)
  },

  returnToToday() {
    if (!this.flushDraft()) return
    this.target = defaultRecordTarget(getStore())
    this.activeId = ''
    this.reload(0)
  },

  toggleMenu(event) {
    const menu = event.currentTarget.dataset.menu
    this.setData({ menu: this.data.menu === menu ? '' : menu })
  },

  hideMenu() { this.setData({ menu: '' }) },
  clearError() { this.setData({ error: '' }) },
  ignoreTouch() {},

  dismissRecordHint() {
    dismiss('record')
    this.setData({ showRecordHint: false })
  },

  openDate(event) {
    this.hideMenu()
    const kind = event.currentTarget.dataset.kind
    const date = kind === 'new' ? this.data.today : this.data.date
    const dateYears = Array.from({ length: Number(this.data.today.slice(0, 4)) - 1999 }, (_, index) => 2000 + index)
    this.setOverlay({
      dialog: kind === 'new' ? 'new-date' : 'change-date',
      dateChoice: date, dateChoiceLabel: recordDateLabel(date),
      calendar: monthView(date.slice(0, 7), this.data.today),
      dateInputMode: false, dateInput: date, dateYearPicker: false, dateYears, dialogError: '',
    })
  },

  changeMonth(event) {
    const month = event.currentTarget.dataset.month
    if (month) this.setData({ calendar: monthView(month, this.data.today), dateYearPicker: false })
  },

  toggleYearPicker() {
    this.setData({
      dateYearPicker: !this.data.dateYearPicker,
      dateYearTarget: 'calendar-year-' + this.data.calendar.month.slice(0, 4),
    })
  },

  chooseYear(event) {
    const month = String(event.currentTarget.dataset.year) + this.data.calendar.month.slice(4)
    const latestMonth = this.data.today.slice(0, 7)
    this.setData({ calendar: monthView(month > latestMonth ? latestMonth : month, this.data.today), dateYearPicker: false })
  },

  toggleDateInput() {
    this.setData({ dateInputMode: !this.data.dateInputMode, dateInput: this.data.dateChoice, dialogError: '' })
  },

  changeDateInput(event) { this.setData({ dateInput: event.detail.value, dialogError: '' }) },

  chooseDate(event) {
    const date = event.currentTarget.dataset.date
    if (date && date <= this.data.today) this.setData({ dateChoice: date, dateChoiceLabel: recordDateLabel(date) })
  },

  applyDate() {
    const date = this.data.dateInputMode ? this.data.dateInput.trim() : this.data.dateChoice
    try {
      const asDate = new Date(date + 'T00:00:00Z')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(asDate.getTime())
        || asDate.toISOString().slice(0, 10) !== date || date > this.data.today || date < '2000-01-01') {
        throw new Error('请选择 2000 年至今天之间的有效日期')
      }
      if (!this.flushDraft()) return
      if (this.data.dialog === 'new-date' || !this.target.workoutId) {
        this.target = { date, newWorkout: true }
        this.activeId = ''
      } else {
        getStore().changeWorkoutDate(this.target.workoutId, date)
      }
      this.closeDialog()
      this.reload()
    } catch (error) {
      this.setData({ dialogError: errorMessage(error) })
    }
  },

  openPicker() {
    if (!this.flushDraft()) return
    this.setOverlay({ sheet: 'picker', showSearch: false, query: '', pickerError: '' })
    this.listExercises('')
  },

  listExercises(query = this.data.query) {
    try {
      const available = getStore().listExercises()
      const addedIds = new Set(this.items.map(item => item.exerciseId))
      const name = query.trim()
      const normalized = name.toLowerCase()
      const exists = new Set(available.map(item => item.name.toLowerCase()))
      const matching = available.filter(item => item.name.toLowerCase().includes(normalized)).map(item => ({
        id: item.id, name: item.name,
        label: modeLabel(item.weightMode) + (addedIds.has(item.id) ? ' · 已添加' : ''),
        used: item.lastUsedAt != null,
      }))
      const recent = matching.filter(item => item.used)
      const others = matching.filter(item => !item.used)
      const presets = EXERCISE_PRESETS.filter(item => !exists.has(item.name.toLowerCase())
        && item.name.toLowerCase().includes(normalized))
        .map(item => ({ ...item, label: modeLabel(item.weightMode) }))
      const canCreate = Boolean(name && !exists.has(normalized))
      const countSections = Number(Boolean(recent.length)) + Number(Boolean(others.length))
        + Number(Boolean(presets.length && matching.length))
      this.setData({
        query, recent, others, presets, queryName: name, canCreate, pickerError: '',
        pickerHeight: countSections * 64 + matching.length * 112 + presets.length * 128
          + ((!this.data.showSearch || canCreate) ? 84 : 0),
      })
    } catch (error) {
      this.setData({ pickerError: errorMessage(error, '无法读取动作列表') })
    }
  },

  toggleSearch() {
    this.setData({ showSearch: !this.data.showSearch })
    this.listExercises('')
  },

  showCustomSearch() {
    this.setData({ showSearch: true })
    this.listExercises()
  },
  onSearchInput(event) { this.listExercises(event.detail.value) },

  activateItem(result) {
    this.target = { workoutId: result.workoutId }
    this.activeId = result.itemId
    this.closeOverlays()
    this.reload()
    wx.pageScrollTo({ scrollTop: 0, duration: 180 })
  },

  pickExercise(event) {
    try {
      this.activateItem(getStore().selectExercise(event.currentTarget.dataset.id, this.target))
    } catch (error) {
      this.setData({ pickerError: errorMessage(error) })
    }
  },

  pickPreset(event) {
    const { name, mode } = event.currentTarget.dataset
    this.createAndAdd(name, mode, 'pickerError')
  },

  beginCreate() {
    this.setOverlay({ dialog: 'create', newMode: 'TOTAL', newName: this.data.queryName, dialogError: '' })
  },

  chooseMode(event) {
    this.setData({ newMode: event.detail.value, dialogError: '' })
  },

  commitCreate() {
    this.createAndAdd(this.data.newName, this.data.newMode, 'dialogError')
  },

  createAndAdd(name, mode, errorField) {
    try {
      this.activateItem(getStore().createAndSelectExercise(name, mode, this.target))
    } catch (error) {
      this.setData({ [errorField]: errorMessage(error) })
    }
  },

  manageExercise(event) {
    const { id, name } = event.currentTarget.dataset
    wx.showActionSheet({
      itemList: ['改名', '归档'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.setOverlay({ dialog: 'rename', renamingId: id, newName: name, dialogError: '' })
        if (tapIndex === 1) {
          try {
            getStore().archiveExercise(id)
            this.listExercises()
          } catch (error) {
            this.setData({ pickerError: errorMessage(error) })
          }
        }
      },
    })
  },

  changeName(event) { this.setData({ newName: event.detail.value, dialogError: '' }) },

  commitRename() {
    try {
      getStore().renameExercise(this.data.renamingId, this.data.newName)
      this.closeDialog()
      this.listExercises()
    } catch (error) {
      this.setData({ dialogError: errorMessage(error) })
    }
  },

  setOverlay(fields) {
    this.setData(fields)
    this.syncOverlayTabBar()
  },

  syncOverlayTabBar() {
    const tab = typeof this.getTabBar === 'function' && this.getTabBar()
    if (tab && typeof tab.setData === 'function') {
      tab.setData({ modalOpen: Boolean(this.recordVisible && (this.data.sheet || this.data.dialog)) })
    }
  },

  closeSheet() { this.setOverlay({ sheet: '', pickerError: '' }) },
  closeDialog() { this.setOverlay({ dialog: '', dialogError: '', edit: null }) },
  closeOverlays() { this.setOverlay({ sheet: '', pickerError: '', dialog: '', dialogError: '', edit: null }) },

  openExerciseHistory() {
    this.hideMenu()
    const item = this.data.item
    if (!item) return
    try {
      const history = getStore().listExerciseHistory(item.exerciseId).map(session => ({
        id: session.workoutId,
        date: dateLabel(session.date, this.data.today),
        current: session.workoutId === this.target.workoutId,
        sets: session.sets.map((set, index) => ({ id: set.id, label: (index + 1) + '. ' + setLabel(set) })),
      }))
      const scrollHeight = history.reduce((height, session) => height + 76 + session.sets.length * 42, 0)
      this.setOverlay({ sheet: 'exercise-history', history: { name: item.name, sessions: history, scrollHeight } })
    } catch (error) {
      this.setData({ error: errorMessage(error, '无法读取动作历史') })
    }
  },

  chooseStep(event) {
    const stepWeight = Number(event.currentTarget.dataset.step)
    this.steps.set(this.activeId, stepWeight)
    this.setData({ stepWeight, menu: '' })
  },

  nudgeWeight(event) {
    const delta = Number(event.currentTarget.dataset.delta)
    const weight = Math.max(0, Math.min(this.data.weightStepperMax, this.data.draftWeight + this.data.stepWeight * delta))
    this.adjustDraft({ weightKg: Math.round(weight * 1000) / 1000 }, true)
  },

  nudgeReps(event) {
    const delta = Number(event.currentTarget.dataset.delta)
    const reps = Math.max(1, Math.min(this.data.repsStepperMax, this.data.draftReps + delta))
    this.adjustDraft({ reps }, true)
  },

  changeWeight(event) {
    this.adjustDraft({ weightKg: Number(event.detail.value) / 2 }, event.type === 'change')
  },

  changeReps(event) {
    this.adjustDraft({ reps: Number(event.detail.value) }, event.type === 'change')
  },

  adjustDraft(fields, recenter) {
    const item = this.data.item
    if (!item || !item.draftId || this.data.justSaved) return
    this.draftValues = { ...this.draftValues, ...fields }
    this.pendingDraft = this.draftValues
    const weight = this.draftValues.weightKg ?? 0
    const reps = this.draftValues.reps ?? 10
    const patch = { draftWeight: weight, draftReps: reps, draftError: '' }
    if (recenter) Object.assign(patch, sliderWindow(weight, reps, this.data.repsMax), {
      weightStepperMax: Math.max(1000, weight), repsStepperMax: Math.max(100, reps),
    })
    this.setData(patch)
    clearTimeout(this.draftTimer)
    this.draftTimer = setTimeout(() => this.flushDraft(), 500)
  },

  flushDraft() {
    clearTimeout(this.draftTimer)
    if (!this.pendingDraft) return true
    try {
      const { id, weightKg, reps } = this.pendingDraft
      getStore().saveDraft(id, this.pendingDraft)
      const draft = this.items.find(item => item.draft && item.draft.id === id)?.draft
      if (draft) {
        draft.weightGrams = weightKg == null ? null : Math.round(weightKg * 1000)
        draft.reps = reps
      }
      this.pendingDraft = null
      return true
    } catch (error) {
      this.setData({ draftError: '未能保存，修改或点 ✓ 重试' })
      return false
    }
  },

  prepareDraft() {
    const item = this.data.item
    if (!item || item.draftId) return
    try {
      this.activateItem(getStore().selectExercise(item.exerciseId, this.target))
    } catch (error) {
      this.setData({ draftError: errorMessage(error) })
    }
  },

  confirmSet(event) {
    const item = this.data.item
    const id = event.currentTarget.dataset.id
    if (this.data.justSaved || !item || !id || item.draftId !== id) return
    clearTimeout(this.draftTimer)
    try {
      getStore().addSet(id, { weightKg: this.data.draftWeight, reps: this.data.draftReps })
      this.pendingDraft = null
      this.reload()
      this.setData({ justSaved: true })
      clearTimeout(this.savedTimer)
      this.savedTimer = setTimeout(() => this.setData({ justSaved: false }), 500)
    } catch (error) {
      this.setData({ draftError: errorMessage(error) })
    }
  },

  openEdit(event) {
    const item = this.items[this.data.index]
    const set = item && item.sets.find(set => set.id === event.currentTarget.dataset.id)
    if (!set) return
    this.setOverlay({
      dialog: 'edit', dialogError: '',
      edit: {
        id: set.id, weight: formatWeight(set.weightGrams), reps: set.reps == null ? '' : String(set.reps),
        weightLabel: item.weightMode === 'BODYWEIGHT' ? '附加重量' : '重量',
      },
    })
  },

  changeEditWeight(event) { this.setData({ 'edit.weight': event.detail.value, dialogError: '' }) },
  changeEditReps(event) { this.setData({ 'edit.reps': event.detail.value, dialogError: '' }) },

  saveEdit() {
    const edit = this.data.edit
    try {
      getStore().updateSet(edit.id, { weightKg: edit.weight, reps: edit.reps })
      this.closeDialog()
      this.reload()
    } catch (error) {
      this.setData({ dialogError: errorMessage(error) })
    }
  },

  deleteEdit() {
    try {
      const snapshot = getStore().deleteSet(this.data.edit.id)
      this.closeDialog()
      this.reload()
      if (snapshot) this.showNotice('已删除', snapshot)
    } catch (error) {
      this.setData({ dialogError: errorMessage(error) })
    }
  },

  removeExercise() {
    this.hideMenu()
    if (!this.data.item || !this.flushDraft()) return
    try {
      const itemId = this.data.item.id
      const snapshot = getStore().removeExercise(itemId)
      this.reload()
      if (snapshot) this.showNotice('已删除', snapshot, itemId)
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },

  showNotice(text, snapshot = null, itemId = '') {
    clearTimeout(this.noticeTimer)
    this.undoSnapshot = snapshot
    this.undoItemId = itemId
    this.setData({ notice: text, canUndo: Boolean(snapshot) })
    this.noticeTimer = setTimeout(() => this.clearNotice(), snapshot ? 9000 : 3500)
  },

  clearNotice() {
    clearTimeout(this.noticeTimer)
    this.undoSnapshot = null
    this.undoItemId = ''
    this.setData({ notice: '', canUndo: false })
  },

  undo() {
    if (!this.undoSnapshot) return
    try {
      getStore().undo(this.undoSnapshot)
      if (this.undoItemId) this.activeId = this.undoItemId
      this.clearNotice()
      this.reload()
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
})
