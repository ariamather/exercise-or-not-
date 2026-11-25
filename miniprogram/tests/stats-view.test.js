const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  heatCalendar,
  heatBin,
  lineGeometry,
  formatAxis,
  monthComparison,
  exerciseView,
} = require('../lib/stats-view')
test('rolling 12-week calendar uses local date labels across a year boundary', () => {
  const cal = heatCalendar({
    heatStart: '2025-12-29',
    today: '2026-03-19',
    days: { '2026-03-19': { totalSets: 12 } },
  })
  assert.equal(cal.labels[1], '1月')
  assert.equal(cal.rows[0].cells.length, 12)
  assert.equal(cal.rows[3].cells[11].date, '2026-03-19')
  assert.equal(cal.rows[3].cells[11].count, 12)
  assert.equal(cal.rows[4].cells[11].future, true)
  assert.deepEqual(
    [0, 1, 5, 6, 8, 9, 11, 12].map(heatBin),
    [0, 1, 1, 2, 2, 3, 3, 4],
  )
  assert.equal(
    monthComparison({ monthDays: 2, lastMonthSameDays: 3 }),
    '上月同期 3 天，这个月少 1 天',
  )
})
test('chart spaces by dates, preserves repeated dates, and has a scale for all zeros', () => {
  const sessions = ['2026-01-01', '2026-01-01', '2026-01-02', '2026-01-05'].map(
    (date) => ({ date, value: 0 }),
  )
  const { points, ticks } = lineGeometry(sessions, 'kg', 320, 176, false)
  assert.equal(points[0].x, points[1].x)
  assert.equal(points[2].x - points[0].x, (points[3].x - points[0].x) / 4)
  assert.ok(points.every((p) => Number.isFinite(p.y)))
  assert.ok(ticks.length >= 2)
})
test('bodyweight exercise detail retains added weight and compares reps', () => {
  const sessions = [8, 10].map((value, i) => ({
    date: '2026-01-0' + (i + 1),
    workoutId: 'w' + i,
    value,
    best: { reps: value, weightGrams: i * 1250 },
    sets: [{ reps: value, weightGrams: i * 1250 }],
  }))
  const ex = exerciseView(
    { metric: 'REPS', weightMode: 'BODYWEIGHT', sessions, sessionCount: 2 },
    '2026-11-24',
  )
  assert.equal(ex.change, '↑ 2 次')
  assert.equal(ex.table[0].sets, '10(+1.25)')
  assert.equal(ex.sessions[1].suffix, '次 · 自重 +1.25 kg')
  assert.equal(formatAxis(17.563), '17.6')
})
test('compact history matches the eight equally spaced sessions in the Android row', () => {
  const sessions = Array.from({length:12}, (_,value)=>({value,date:'2026-01-01'}))
  const {points} = lineGeometry(sessions,'kg',64,24,true)
  assert.equal(points.length,8)
  assert.deepEqual(points[0],{x:4,y:20})
  assert.deepEqual(points[7],{x:60,y:4})
})
