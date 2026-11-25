const { getStore } = require('../../lib/workouts')
const {
  heatColors,
  heatCalendar,
  longDate,
  monthComparison,
  exerciseView,
  formatAxis,
} = require('../../lib/stats-view')
Page({
  data: {
    error: '',
    empty: true,
    heatColors,
    openId: '',
    showTable: false,
    focus: null,
  },
  onReady() {
    require('../../lib/tab-selection').selectTab(this, 'stats')
  },
  onShow() {
    require('../../lib/tab-selection').selectTab(this, 'stats')
    this.setData({ statusTop: wx.getWindowInfo().statusBarHeight || 0 })
    try {
      const s = getStore().getStats()
      this.summary = s
      this.fullExercises = s.exercises
      const exercises = this.exerciseSummaries(
        0,
        Math.max(16, this.data.exercises ? this.data.exercises.length : 0),
      )
      const requested = this.initialized
        ? this.data.openId
        : exercises[0] && exercises[0].id
      const openId = exercises.some((e) => e.id === requested) ? requested : ''
      const chosen = this.data.date
      const date =
        chosen && chosen >= s.heatStart && chosen <= s.today
          ? chosen
          : s.lastTrainedDay || s.today
      const calendar = heatCalendar(s)
      this.setData({
        empty: s.isEmpty,
        error: '',
        today: s.today,
        monthDays: s.monthDays,
        comparison: monthComparison(s),
        monthSets: s.monthSets,
        monthExercises: s.monthExercises,
        weekly: Math.round(s.weeklyAverage * 10) / 10,
        rows: calendar.rows,
        labels: calendar.labels.map((text, week) => ({ week, text })),
        exercises,
        openId,
      })
      this.initialized = !s.isEmpty
      this.showDay(date)
      const current = exercises.find(e => e.id === openId)
      const retained = current && this.activeExerciseId === openId && current.sessions.length === this.activeLength
        ? this.data.active : undefined
      this.selectSession(openId, retained)
    } catch (e) {
      this.setData({ error: e.message || '统计读取失败' })
    }
  },
  exerciseSummaries(start, limit) {
    return this.fullExercises.slice(start, start + limit).map((exercise) => {
      const e = exerciseView(exercise, this.summary.today)
      const { id, name, mode, unit, count, lastValue, firstValue, change } = e
      return {
        id,
        name,
        mode,
        unit,
        count,
        lastValue,
        firstValue,
        change,
        rangeLabel: '最近 ' + e.sessions.length + ' 次：' + formatAxis(firstValue) + ' → ' + formatAxis(lastValue) + ' ' + unit,
        sessions: e.sessions.map((s) => ({ date: s.date, value: s.value })),
      }
    })
  },
  onReachBottom() {
    if (!this.fullExercises) return
    const start = this.data.exercises.length
    const update = {}
    this.exerciseSummaries(start, 16).forEach((item, i) => {
      update['exercises[' + (start + i) + ']'] = item
    })
    if (Object.keys(update).length) this.setData(update)
  },
  showDay(date) {
    this.setData({
      date,
      dateLabel: longDate(date, this.summary.today),
      day: this.summary.days[date] || null,
    })
  },
  chooseDay(e) {
    this.showDay(e.currentTarget.dataset.date)
  },
  openWorkout() {
    if (!this.data.day) return
    wx.setStorageSync('exerciseornot.record.request.v1', {
      workoutId: this.data.day.workoutId,
    })
    this.openRecord()
  },
  openRecord() {
    wx.switchTab({ url: '/pages/record/index' })
  },
  toggle(e) {
    const id = e.currentTarget.dataset.id
    const openId = this.data.openId === id ? '' : id
    this.setData({ openId, showTable: false })
    this.selectSession(openId)
  },
  selectSession(id, index) {
    const source = this.fullExercises.find((e) => e.exerciseId === id)
    const exercise = source && exerciseView(source, this.summary.today)
    if (!exercise) return
    const active = Number.isInteger(index)
      ? index
      : exercise.sessions.length - 1
    this.activeExerciseId = id
    this.activeLength = exercise.sessions.length
    this.setData({
      focus: exercise.sessions[active],
      active,
      table: exercise.table,
    })
  },
  focusPoint(e) {
    const index = e.detail.index
    if (index === this.data.active) return
    const sessions = this.data.table
    if (!sessions || index < 0 || index >= sessions.length) return
    this.setData({ active: index, focus: sessions[sessions.length - 1 - index] })
  },
  toggleTable() {
    this.setData({ showTable: !this.data.showTable })
  },
})
