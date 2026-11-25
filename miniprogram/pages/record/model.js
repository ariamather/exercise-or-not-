const { formatWeight } = require('../../lib/workouts')

const REQUEST_KEY = 'exerciseornot.record.request.v1'
const WEIGHT_STEPS = [0.5, 1, 2.5, 5]
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const DAY_IN_MS = 86400000

function dateLabel(date, today) {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay()
  return (date.slice(0, 4) === today.slice(0, 4) ? date.slice(5) : date) + ' 周' + WEEKDAYS[weekday]
}

function recordDateLabel(date) {
  const [, month, day] = date.split('-').map(Number)
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay()
  return month + ' 月 ' + day + ' 日 · 周' + WEEKDAYS[weekday]
}

function setLabel(set, compact = false) {
  if (!set) return '—'
  const weight = set.weightGrams == null ? '自重' : formatWeight(set.weightGrams) + (compact ? '' : ' kg')
  return weight + (compact ? '×' : ' × ') + (set.reps == null ? '?' : set.reps) + (compact ? '' : ' 次')
}

function sliderWindow(weight, reps, oldRepsMax = 0) {
  const end = Math.max(1000, Math.ceil(weight / 5) * 5)
  const weightMin = Math.min(end - 40, Math.max(0, Math.floor(weight / 5) * 5 - 20))
  const repsMax = Math.max(oldRepsMax, 30, Math.ceil(reps / 10) * 10)
  return { weightMin, weightMax: weightMin + 40, repsMax }
}

function monthView(month, today) {
  const [year, number] = month.split('-').map(Number)
  const start = Date.UTC(year, number - 1, 1)
  const next = Date.UTC(year, number, 1)
  const daysInMonth = (next - start) / DAY_IN_MS
  const firstColumn = new Date(start).getUTCDay()
  const cells = Array.from({ length: Math.ceil((firstColumn + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstColumn + 1
    if (day < 1 || day > daysInMonth) return { key: 'blank' + index, day: 0 }
    const date = new Date(start + (day - 1) * DAY_IN_MS).toISOString().slice(0, 10)
    return { key: date, day, date, disabled: date > today }
  })
  return {
    month,
    label: year + '年' + number + '月',
    previous: month > '2000-01' ? new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7) : '',
    next: month < today.slice(0, 7) ? new Date(next).toISOString().slice(0, 7) : '',
    cells,
  }
}

function defaultRecordTarget(store) {
  const today = store.today()
  const latest = store.latestActivityWorkout()
  return latest && latest.date === today ? { workoutId: latest.id } : { date: today, newWorkout: true }
}

function errorMessage(error, fallback = '保存失败，请重试') {
  return error instanceof Error && error.message ? error.message : fallback
}

function chromeInsets() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : null
  const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
  return {
    statusTop: info ? info.statusBarHeight || 0 : 32,
    capsuleRight: info && menu && menu.left > 0 ? Math.max(0, info.windowWidth - menu.left) : 94,
  }
}

module.exports = {
  REQUEST_KEY,
  WEIGHT_STEPS,
  dateLabel,
  recordDateLabel,
  setLabel,
  sliderWindow,
  monthView,
  defaultRecordTarget,
  errorMessage,
  chromeInsets,
}
