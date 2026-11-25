const { getStore } = require('../../lib/workouts')
const { getBackupStatus } = require('../../lib/workout-backup')
const { isDismissed, dismiss } = require('../../lib/hints')
const { REQUEST_KEY, dateLabel, setLabel, defaultRecordTarget, errorMessage, chromeInsets } = require('../record/model')

const PAGE_SIZE = 20

function presentWorkout(workout, today) {
  return {
    id: workout.id,
    date: dateLabel(workout.date, today),
    totalSets: workout.totalSets,
    items: workout.items.filter(item => item.sets.length).map(item => ({
      id: item.id,
      name: item.name,
      performance: item.sets.map(set => setLabel(set, true)).join('、'),
    })),
  }
}

function showBackupHint() {
  if (isDismissed('backup')) return false
  const { workoutCount, lastExportAt } = getBackupStatus()
  return workoutCount >= 5 && lastExportAt == null
}

function reuseNotice(result) {
  const skipped = []
  if (result.skippedExisting) skipped.push(result.skippedExisting + ' 个已在今天的记录里')
  if (result.skippedArchived) skipped.push(result.skippedArchived + ' 个已归档')
  if (result.added) {
    return '已复用 ' + result.added + ' 个动作' + (skipped.length ? '（跳过：' + skipped.join('，') + '）' : '')
  }
  if (result.skippedExisting && !result.skippedArchived) return '这些动作都已在今天的记录里'
  if (skipped.length) return '没有可复用的动作（' + skipped.join('，') + '）'
  return '这次训练没有已记录的动作'
}

Page({
  data: {
    workouts: [], workoutCount: 0, error: '', date: '', menuId: '',
    showBackupHint: false, notice: '', canUndo: false,
    statusTop: 32, capsuleRight: 94,
  },

  onLoad(options) {
    this.filterDate = /^\d{4}-\d{2}-\d{2}$/.test(options.date || '') ? options.date : ''
    this.setData(chromeInsets())
  },

  onShow() {
    try {
      const store = getStore()
      const date = this.filterDate || ''
      const all = store.listWorkouts()
      const workouts = date ? all.filter(workout => workout.date === date) : all
      this.renderVersion = (this.renderVersion || 0) + 1
      this.today = store.today()
      this.queuedWorkouts = workouts.slice(PAGE_SIZE)
      this.setData({
        workouts: workouts.slice(0, PAGE_SIZE).map(workout => presentWorkout(workout, this.today)),
        workoutCount: workouts.length,
        date, error: '', showBackupHint: showBackupHint(),
      })
    } catch (error) {
      this.setData({ error: errorMessage(error, '无法读取历史记录') })
    }
  },

  onReachBottom() {
    if (!this.queuedWorkouts || !this.queuedWorkouts.length) return
    const offset = this.data.workouts.length
    const patch = {}
    this.queuedWorkouts.splice(0, PAGE_SIZE).forEach((workout, index) => {
      patch['workouts[' + (offset + index) + ']'] = presentWorkout(workout, this.today)
    })
    // Append individual rows so an old history does not become one large setData payload.
    this.setData(patch)
  },

  onUnload() { clearTimeout(this.noticeTimer) },

  backToRecord() { wx.switchTab({ url: '/pages/record/index' }) },
  openSettings() { wx.navigateTo({ url: '/pages/settings/index' }) },

  dismissBackupHint() {
    dismiss('backup')
    this.setData({ showBackupHint: false })
  },

  showAll() { this.filterDate = ''; this.onShow() },

  toggleMenu(event) {
    const { id } = event.currentTarget.dataset
    this.setData({ menuId: this.data.menuId === id ? '' : id })
  },

  closeMenu() { this.setData({ menuId: '' }) },

  sendRecordRequest(workoutId, notice) {
    wx.setStorageSync(REQUEST_KEY, { workoutId, notice: notice || '' })
    this.backToRecord()
  },

  openWorkout(event) {
    const { id } = event.currentTarget.dataset
    try {
      this.sendRecordRequest(id)
    } catch (error) {
      this.showNotice(errorMessage(error))
    }
  },

  reuseWorkout(event) {
    const { id } = event.currentTarget.dataset
    this.closeMenu()
    try {
      const store = getStore()
      const result = store.reuseWorkout(id, defaultRecordTarget(store))
      const notice = reuseNotice(result)
      if (result.added && result.workoutId) this.sendRecordRequest(result.workoutId, notice)
      else this.showNotice(notice)
    } catch (error) {
      this.showNotice(errorMessage(error))
    }
  },

  deleteWorkout(event) {
    const { id } = event.currentTarget.dataset
    const index = this.data.workouts.findIndex(workout => workout.id === id)
    if (index < 0) return
    this.closeMenu()
    try {
      const snapshot = getStore().deleteWorkout(id)
      if (!snapshot) return
      const row = this.data.workouts[index]
      this.setData({
        ['workouts[' + index + ']']: { id, deleted: true },
        workoutCount: this.data.workoutCount - 1,
        showBackupHint: showBackupHint(),
      })
      this.showNotice('已删除这次训练', { snapshot, row, index, renderVersion: this.renderVersion })
    } catch (error) {
      this.showNotice(errorMessage(error))
    }
  },

  showNotice(text, removal = null) {
    clearTimeout(this.noticeTimer)
    this.removal = removal
    this.setData({ notice: text, canUndo: Boolean(removal) })
    this.noticeTimer = setTimeout(() => this.clearNotice(), removal ? 9000 : 3500)
  },

  clearNotice() {
    clearTimeout(this.noticeTimer)
    this.removal = null
    this.setData({ notice: '', canUndo: false })
  },

  undo() {
    if (!this.removal) return
    const { snapshot, row, index, renderVersion } = this.removal
    try {
      getStore().undo(snapshot)
      this.clearNotice()
      if (renderVersion !== this.renderVersion) {
        this.onShow()
        return
      }
      this.setData({
        ['workouts[' + index + ']']: row,
        workoutCount: this.data.workoutCount + 1,
        showBackupHint: showBackupHint(),
      })
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
})
