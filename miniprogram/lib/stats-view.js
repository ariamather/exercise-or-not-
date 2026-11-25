const DAY = 86400000
const weekdays = '日一二三四五六'
const heatColors = ['#edf0e6', '#9bba8e', '#6f9a6b', '#4a7a56', '#2c573d']
function iso(at) {
  return new Date(at).toISOString().slice(0, 10)
}
function dateNumber(date) {
  return Date.parse(date + 'T00:00:00Z')
}
function shortDate(date, today) {
  const [year, month, day] = date.split('-').map(Number)
  return (
    (year !== Number(today.slice(0, 4)) ? year + '/' : '') + month + '/' + day
  )
}
function longDate(date, today) {
  const d = new Date(dateNumber(date))
  const year = date.slice(0, 4)
  return (
    (year === today.slice(0, 4) ? '' : year + ' 年 ') +
    (d.getUTCMonth() + 1) +
    ' 月 ' +
    d.getUTCDate() +
    ' 日 · 周' +
    weekdays[d.getUTCDay()]
  )
}
function heatBin(n) {
  return n === 0 ? 0 : n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4
}
function formatAxis(value) {
  return String(Math.round(value * 10) / 10)
}
function heatCalendar(stats) {
  const start = dateNumber(stats.heatStart)
  const mondays = Array.from(
    { length: 12 },
    (_, i) => new Date(start + i * 7 * DAY).getUTCMonth() + 1,
  )
  const firstChange = mondays.findIndex((m, i) => i > 0 && m !== mondays[i - 1])
  const labels = mondays.map((m, i) =>
    (i ? m !== mondays[i - 1] : firstChange < 0 || firstChange >= 3)
      ? m + '月'
      : '',
  )
  const rows = Array.from('一二三四五六日', (weekday, row) => ({
    weekday,
    label: row % 2 === 0 ? weekday : '',
    cells: mondays.map((_, col) => {
      const date = iso(start + (col * 7 + row) * DAY)
      const count = stats.days[date] ? stats.days[date].totalSets : 0
      return {
        date,
        count,
        color: heatColors[heatBin(count)],
        future: date > stats.today,
      }
    }),
  }))
  return { labels, rows }
}
function monthComparison(stats) {
  const diff = stats.monthDays - stats.lastMonthSameDays
  const change =
    diff === 0
      ? stats.monthDays
        ? '和这个月一样'
        : '这个月还没开始'
      : diff > 0
        ? '这个月多练了 ' + diff + ' 天'
        : '这个月少 ' + -diff + ' 天'
  return '上月同期 ' + stats.lastMonthSameDays + ' 天，' + change
}
function exerciseView(e, today) {
  const byReps = e.metric === 'REPS'
  const unit = byReps ? '次' : 'kg'
  const mode = { BODYWEIGHT: '自重', TOTAL: '总重', PER_SIDE: '单只' }[
    e.weightMode
  ]
  const sessions = e.sessions.map((s) => {
    const kg = (s.best.weightGrams || 0) / 1000
    const suffix = byReps
      ? '次 · 自重' + (kg ? ' +' + kg + ' kg' : '')
      : (e.weightMode === 'BODYWEIGHT' ? 'kg 附加' : 'kg') + ' × ' + s.best.reps
    const sets = s.sets
      .map((set) =>
        byReps
          ? set.reps +
            (set.weightGrams ? '(+' + set.weightGrams / 1000 + ')' : '')
          : (set.weightGrams || 0) / 1000 + '×' + set.reps,
      )
      .join(' · ')
    return {
      id: s.workoutId,
      date: s.date,
      short: shortDate(s.date, today),
      long: longDate(s.date, today),
      value: s.value,
      reps: s.best.reps,
      suffix,
      sets,
      count: s.sets.length,
    }
  })
  const last = sessions[sessions.length - 1]
  const previous = sessions[sessions.length - 2]
  let change = '第一次'
  if (previous) {
    const diff = last.value - previous.value
    const reps = last.reps - previous.reps
    const n = diff || reps
    change = n
      ? (n > 0 ? '↑ ' : '↓ ') +
        Number(Math.abs(n).toFixed(3)) +
        ' ' +
        (diff ? unit : '次')
      : '和上次持平'
  }
  return {
    id: e.exerciseId,
    name: e.name,
    mode,
    unit,
    count: e.sessionCount,
    sessions,
    lastValue: last.value,
    firstValue: sessions[0].value,
    change,
    table: sessions.slice().reverse(),
  }
}
function lineGeometry(sessions, unit, width, height, compact) {
  if (compact) {
    const values = sessions.slice(-8).map((session) => session.value)
    const low = Math.min(...values)
    const span = Math.max(...values) - low || 1
    return {
      points: values.map((value, i) => ({
        x: 4 + (width - 8) * i / Math.max(1, values.length - 1),
        y: height - 4 - (height - 8) * (value - low) / span,
      })),
    }
  }
  const left = 34
  const right = 18
  const top = 26
  const bottom = height - 22
  const values = sessions.map((s) => s.value)
  const min = Math.min(...values),
    max = Math.max(...values)
  const raw = Math.max(max - min, unit === '次' ? 3 : 5) / 3
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step =
    [1, 2, 2.5, 5, 10].find((x) => x * magnitude >= raw - 1e-9) * magnitude
  const lo = Math.max(0, Math.floor((min - step * 0.25) / step) * step)
  const hi = Math.ceil((max + step * 0.25) / step) * step
  const first = dateNumber(sessions[0].date)
  const last = dateNumber(sessions[sessions.length - 1].date)
  const xAt = (time) =>
    left +
    ((width - left - right) * (time - first)) / Math.max(DAY, last - first)
  const yAt = (v) => bottom - ((bottom - top) * (v - lo)) / (hi - lo)
  const points = sessions.map((s) => ({
    x: xAt(dateNumber(s.date)),
    y: yAt(s.value),
  }))
  const ticks = []
  for (let n = lo; n <= hi + 1e-8; n += step)
    ticks.push({ value: Number(n.toFixed(3)), y: yAt(n) })
  const dates = [
    { x: left, text: shortDate(sessions[0].date, sessions[0].date) },
  ]
  let dt = new Date(first)
  dt.setUTCDate(1)
  dt.setUTCMonth(dt.getUTCMonth() + 1)
  while (dt.getTime() <= last) {
    const x = xAt(dt.getTime())
    dates.push({ x, text: dt.getUTCMonth() + 1 + '月' })
    dt.setUTCMonth(dt.getUTCMonth() + 1)
  }
  return { points, ticks, dates, left, right: width - right, bottom, top }
}
module.exports = {
  formatAxis,
  heatColors,
  heatBin,
  heatCalendar,
  monthComparison,
  longDate,
  exerciseView,
  lineGeometry,
}
