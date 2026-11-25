const { LEGACY_WORKOUT_KEY, readAppState, updateAppState } = require('./workout-storage')
const MAX_INT = 2147483647
const HISTORY_LIMIT = 20
const HEAT_WEEKS = 12
const DAY_MS = 86400000

const WEIGHT_MODES = [
  { id: 'TOTAL', label: '总重' },
  { id: 'PER_SIDE', label: '单只' },
  { id: 'BODYWEIGHT', label: '自重' }
]

const EXERCISE_PRESETS = [
  { name: '杠铃卧推', weightMode: 'TOTAL' },
  { name: '深蹲', weightMode: 'TOTAL' },
  { name: '硬拉', weightMode: 'TOTAL' },
  { name: '哑铃肩推', weightMode: 'PER_SIDE' },
  { name: '俯卧撑', weightMode: 'BODYWEIGHT' },
  { name: '引体向上', weightMode: 'BODYWEIGHT' }
]

function blank(value) {
  return value == null || (typeof value === 'string' && !value.trim())
}

function parseWeight(value) {
  if (blank(value)) return null
  const parts = String(value).trim().replace(',', '.').match(/^\+?(\d*)(?:\.(\d*))?$/)
  if (!parts || (!parts[1] && !parts[2])) throw new Error('请输入有效的非负重量')
  const fraction = (parts[2] || '') + '0000'
  const grams = Number(parts[1]) * 1000 + Number(fraction.slice(0, 3)) + (Number(fraction[3]) >= 5 ? 1 : 0)
  if (!Number.isInteger(grams) || grams > MAX_INT) throw new Error('重量超出可记录范围')
  return grams
}

function parseValues(weightMode, values, draft) {
  let reps = null
  if (!blank(values.reps)) {
    const text = String(values.reps).trim()
    reps = Number(text)
    if (!/^\d+$/.test(text) || reps < 1 || reps > MAX_INT) throw new Error('次数需为正整数')
  }
  if (!draft && reps === null) throw new Error('请填写次数')
  const weightGrams = parseWeight(values.weightKg)
  if (!draft && weightMode !== 'BODYWEIGHT' && weightGrams === null) {
    throw new Error('这个动作按重量记录，请填写重量')
  }
  return { weightGrams, reps }
}

function formatWeight(grams) {
  return grams == null ? '' : String(grams / 1000)
}

function formatSet(set, weightMode) {
  if (!set) return ''
  const weight = formatWeight(set.weightGrams)
  let description = set.weightGrams == null ? '自重' : weight + ' kg'
  if (weightMode === 'BODYWEIGHT') {
    description = set.weightGrams > 0 ? '自重 + ' + weight + ' kg' : '自重'
  }
  return description + ' × ' + (set.reps == null ? '?' : set.reps) + ' 次'
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date, utc) {
  const year = utc ? date.getUTCFullYear() : date.getFullYear()
  const month = utc ? date.getUTCMonth() : date.getMonth()
  const day = utc ? date.getUTCDate() : date.getDate()
  return String(year).padStart(4, '0') + '-' + pad(month + 1) + '-' + pad(day)
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('训练日期格式不正确')
  const date = new Date(value + 'T00:00:00.000Z')
  if (isNaN(date.getTime()) || formatDate(date, true) !== value) throw new Error('训练日期格式不正确')
  return date
}

function localPerformedAt(date, time) {
  const utcDate = parseDate(date)
  const local = new Date(time)
  local.setDate(1)
  local.setFullYear(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate())
  return local.getTime()
}

function deviceZone(time) {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone) return zone
  } catch (_) {
    // Older runtimes can still supply a UTC offset through Date.
  }
  const offset = -new Date(time).getTimezoneOffset()
  const absolute = Math.abs(offset)
  return (offset < 0 ? '-' : '+') + pad(Math.floor(absolute / 60)) + ':' + pad(absolute % 60)
}

function workoutPerformedAt(date, workout) {
  if (!workout.zoneId) return localPerformedAt(date, workout.performedAt)
  const fixedOffset = workout.zoneId.match(/^(?:UTC|GMT|UT)?([+-])(\d{1,2})(?::?(\d{2})(?::?(\d{2}))?)?$/)
  let offsetAt
  if (fixedOffset) {
    const [, sign, hours, minutes, seconds] = fixedOffset
    const millis = (+hours * 3600 + +(minutes || 0) * 60 + +(seconds || 0)) * 1000
    offsetAt = () => sign === '+' ? millis : -millis
  } else if (['UTC', 'GMT', 'UT'].includes(workout.zoneId)) {
    offsetAt = () => 0
  } else if (workout.zoneId === deviceZone(workout.performedAt)) {
    return localPerformedAt(date, workout.performedAt)
  } else {
    if (typeof Intl !== 'object') throw new Error('当前微信版本无法转换这次训练的时区')
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: workout.zoneId, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    })
    offsetAt = time => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(part => [part.type, part.value]))
      const local = Date.parse(parts.year + '-' + parts.month + '-' + parts.day + 'T'
        + (parts.hour === '24' ? '00' : parts.hour) + ':' + parts.minute + ':' + parts.second + 'Z')
      return local - Math.floor(time / 1000) * 1000
    }
  }
  const wallTime = new Date(workout.performedAt + offsetAt(workout.performedAt))
  const moved = parseDate(date)
  moved.setUTCHours(wallTime.getUTCHours(), wallTime.getUTCMinutes(), wallTime.getUTCSeconds(), wallTime.getUTCMilliseconds())
  const target = moved.getTime()
  const earlier = target - offsetAt(target - DAY_MS)
  const later = target - offsetAt(target + DAY_MS)
  // Preserve the earlier occurrence when clocks repeat, and move through a clock gap.
  return earlier + offsetAt(earlier) === target ? earlier : later + offsetAt(later) === target ? later : earlier
}

function comparePerformed(a, b) {
  return a.date.localeCompare(b.date) || a.performedAt - b.performedAt
}

function compareWorkouts(a, b) {
  return comparePerformed(a, b) || a.createdAt - b.createdAt
}

function getPriorSession(workouts, target, exerciseId) {
  let latest = null
  let logged = null
  for (const workout of workouts) {
    if (comparePerformed(workout, target) >= 0 || (latest && comparePerformed(workout, latest) <= 0)) continue
    const sets = workout.items.filter(item => item.exerciseId === exerciseId).flatMap(item => item.sets)
    if (sets.length) {
      latest = workout
      logged = sets
    }
  }
  return latest ? { workoutId: latest.id, date: latest.date, sets: logged } : null
}

function workoutView(state, workout, loggedOnly, withPrevious = !loggedOnly) {
  const items = loggedOnly ? workout.items.filter(item => item.sets.length) : workout.items
  return {
    ...workout,
    totalSets: items.reduce((total, item) => total + item.sets.length, 0),
    items: items.map(item => ({
      ...item,
      draft: loggedOnly ? null : item.draft,
      previous: withPrevious ? getPriorSession(state.workouts, workout, item.exerciseId) : null
    }))
  }
}

function historyWorkouts(state) {
  return state.workouts
    .filter(workout => workout.items.some(item => item.sets.length))
    .sort((a, b) => compareWorkouts(b, a))
    .map(workout => workoutView(state, workout, true))
}

function makeStats(workouts, today) {
  const day = parseDate(today)
  const monthStart = today.slice(0, 7) + '-01'
  const lastMonthEnd = parseDate(monthStart)
  lastMonthEnd.setUTCDate(0)
  const lastMonthStart = formatDate(lastMonthEnd, true).slice(0, 7) + '-01'
  lastMonthEnd.setUTCDate(Math.min(day.getUTCDate(), lastMonthEnd.getUTCDate()))
  const lastMonthEndText = formatDate(lastMonthEnd, true)
  const first = new Date(day)
  first.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7 - (HEAT_WEEKS - 1) * 7)
  const heatStart = formatDate(first, true)
  const days = {}
  const byExercise = new Map()
  const monthExerciseIds = new Set()
  let monthSets = 0

  for (const workout of workouts.slice().reverse()) {
    const { date } = workout
    const thisMonth = date >= monthStart && date <= today
    const dayStats = days[date] || { date, totalSets: 0, workoutId: workout.id, items: [] }
    dayStats.totalSets += workout.totalSets
    dayStats.workoutId = workout.id
    if (thisMonth) monthSets += workout.totalSets

    for (const item of workout.items) {
      let dayItem = dayStats.items.find(entry => entry.exerciseId === item.exerciseId)
      if (!dayItem) {
        dayItem = { exerciseId: item.exerciseId, name: item.name, sets: 0 }
        dayStats.items.push(dayItem)
      }
      dayItem.name = item.name
      dayItem.sets += item.sets.length
      if (thisMonth) monthExerciseIds.add(item.exerciseId)
      const sets = item.sets.filter(set => set.reps != null)
      if (!sets.length) continue
      const entry = byExercise.get(item.exerciseId) || { exerciseId: item.exerciseId, sessions: [] }
      entry.name = item.name
      entry.weightMode = item.weightMode
      entry.sessions.push({ workoutId: workout.id, date, sets })
      byExercise.set(item.exerciseId, entry)
    }
    days[date] = dayStats
  }

  const exercises = Array.from(byExercise.values(), entry => {
    const { sessions, weightMode } = entry
    const metric = weightMode === 'BODYWEIGHT' && sessions.some(session => (
      session.sets.every(set => !set.weightGrams)
    )) ? 'REPS' : 'WEIGHT'
    const compareReps = (a, b) => a.reps - b.reps
    const compareWeight = (a, b) => (a.weightGrams || 0) - (b.weightGrams || 0)
    const compare = metric === 'REPS'
      ? (a, b) => compareReps(a, b) || compareWeight(a, b)
      : (a, b) => compareWeight(a, b) || compareReps(a, b)
    const recent = sessions.slice(-HISTORY_LIMIT).map(session => {
      const best = session.sets.reduce((leader, set) => compare(set, leader) > 0 ? set : leader)
      return { ...session, best, value: metric === 'REPS' ? best.reps : (best.weightGrams || 0) / 1000 }
    })
    return {
      ...entry,
      metric,
      sessionCount: sessions.length,
      sessions: recent,
      last: recent[recent.length - 1],
      previous: recent[recent.length - 2] || null
    }
  }).sort((a, b) => b.last.date.localeCompare(a.last.date))

  const dates = Object.keys(days)
  const countDays = (start, end) => dates.filter(date => date >= start && date <= end).length
  return {
    today,
    monthDays: countDays(monthStart, today),
    lastMonthSameDays: countDays(lastMonthStart, lastMonthEndText),
    monthSets,
    monthExercises: monthExerciseIds.size,
    weeklyAverage: countDays(heatStart, today) * 7 / ((day.getTime() - first.getTime()) / DAY_MS + 1),
    heatStart,
    days,
    exercises,
    lastTrainedDay: workouts.length ? workouts[0].date : null,
    isEmpty: !workouts.length
  }
}

function nextPosition(rows) {
  return rows.reduce((max, row, index) => Math.max(max, row.position == null ? index : row.position), -1) + 1
}

function restoreOrder(rows, row, index) {
  if (row.position == null || rows.some(entry => entry.position == null)) {
    rows.splice(index, 0, row)
    return
  }
  const after = rows.findIndex(entry => entry.position > row.position || (
    entry.position === row.position && entry.createdAt > row.createdAt
  ))
  rows.splice(after < 0 ? rows.length : after, 0, row)
}

function lastActivity(workout) {
  let latest = -Infinity
  for (const item of workout.items) {
    const rows = item.draft ? item.sets.concat(item.draft) : item.sets
    for (const set of rows) latest = Math.max(latest, set.createdAt)
  }
  return latest === -Infinity ? workout.createdAt : latest
}

function createWorkoutStore(storage, options = {}) {
  const clock = options.now || Date.now
  const read = () => readAppState(storage).workouts

  function mutate(update) {
    return updateAppState(storage, app => update(app.workouts, Number(clock())))
  }

  function today() {
    return formatDate(new Date(clock()), false)
  }

  function checkDate(date, time) {
    parseDate(date)
    if (date > formatDate(new Date(time), false)) throw new Error('训练日期不能晚于今天')
  }

  function findWorkout(state, id) {
    const workout = state.workouts.find(entry => entry.id === id)
    if (!workout) throw new Error('这次训练已被删除')
    return workout
  }

  function latest(state, date) {
    const workouts = state.workouts.filter(workout => workout.date === date)
    return workouts.sort((a, b) => compareWorkouts(b, a))[0] || null
  }

  function findExercise(state, id) {
    const exercise = state.exercises.find(entry => entry.id === id)
    if (!exercise) throw new Error('动作不存在')
    return exercise
  }

  function idFor(state, prefix) {
    const id = prefix + '-' + state.nextId
    state.nextId += 1
    return id
  }

  function addDraft(state, item, seed, time) {
    const draft = {
      id: idFor(state, 'set'),
      position: nextPosition(item.sets),
      reps: seed ? seed.reps : null,
      weightGrams: seed ? seed.weightGrams : null,
      status: 'DRAFT',
      loggedAt: null,
      createdAt: time,
      updatedAt: time
    }
    item.draft = draft
    return draft
  }

  function ensureExercise(state, name, weightMode, time) {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) throw new Error('请填写动作名称')
    if (!WEIGHT_MODES.some(mode => mode.id === weightMode)) throw new Error('请选择重量口径')
    const matches = state.exercises.filter(entry => entry.name.toLowerCase() === trimmed.toLowerCase())
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const active = matches.find(entry => !entry.archived)
    if (active) throw new Error('已有同名动作「' + active.name + '」')
    if (matches.length) {
      matches[0].archived = false
      matches[0].updatedAt = time
      return matches[0]
    }
    const exercise = {
      id: idFor(state, 'exercise'), name: trimmed, weightMode, archived: false, createdAt: time, updatedAt: time
    }
    state.exercises.push(exercise)
    return exercise
  }

  function targetWorkout(state, target, time) {
    if (target.workoutId) return findWorkout(state, target.workoutId)
    const current = new Date(time)
    const thisDay = formatDate(current, false)
    const date = target.date || thisDay
    checkDate(date, time)
    const existing = target.newWorkout ? null : latest(state, date)
    if (existing) return existing
    current.setHours(12, 0, 0, 0)
    const workout = {
      id: idFor(state, 'workout'),
      date,
      performedAt: date === thisDay ? time : localPerformedAt(date, current),
      createdAt: time,
      updatedAt: time,
      items: []
    }
    workout.zoneId = deviceZone(workout.performedAt)
    state.workouts.push(workout)
    return workout
  }

  function addItem(state, workout, exercise, time) {
    let item = workout.items.find(entry => entry.exerciseId === exercise.id)
    if (!item) {
      if (exercise.archived) throw new Error('这个动作已归档')
      item = {
        id: idFor(state, 'item'),
        exerciseId: exercise.id,
        name: exercise.name,
        weightMode: exercise.weightMode,
        position: nextPosition(workout.items),
        sets: [],
        draft: null,
        createdAt: time,
        updatedAt: time
      }
      workout.items.push(item)
    }
    if (!item.draft) {
      const previous = item.sets.length ? item : getPriorSession(state.workouts, workout, exercise.id)
      addDraft(state, item, previous && previous.sets[previous.sets.length - 1], time)
    }
    return { workoutId: workout.id, itemId: item.id }
  }

  function findSet(state, id) {
    for (const workout of state.workouts) {
      for (const item of workout.items) {
        const draft = item.draft && item.draft.id === id
        const set = draft ? item.draft : item.sets.find(entry => entry.id === id)
        if (set) return { workout, item, set, draft }
      }
    }
    return null
  }

  function updateSetTime(workout, item, time) {
    workout.updatedAt = time
    item.updatedAt = time
  }

  function deletionSnapshot(state, fields) {
    return { ...fields, generation: state.generation || 0 }
  }

  function restoreItem(state, workout, item, index) {
    if (workout.items.some(entry => entry.id === item.id)) return
    if (workout.items.some(entry => entry.exerciseId === item.exerciseId)) {
      throw new Error('无法撤销：这个动作已重新添加')
    }
    findExercise(state, item.exerciseId)
    restoreOrder(workout.items, item, index)
  }

  return {
    today,

    listExercises({ includeArchived = false } = {}) {
      const state = read()
      const lastUsed = new Map()
      for (const workout of state.workouts) {
        for (const item of workout.items) {
          for (const set of item.sets) {
            if (!lastUsed.has(item.exerciseId) || set.loggedAt > lastUsed.get(item.exerciseId)) {
              lastUsed.set(item.exerciseId, set.loggedAt)
            }
          }
        }
      }
      return state.exercises.filter(exercise => includeArchived || !exercise.archived)
        .map(exercise => ({ ...exercise, lastUsedAt: lastUsed.get(exercise.id) ?? null }))
        .sort((a, b) => (b.lastUsedAt ?? -Infinity) - (a.lastUsedAt ?? -Infinity) || a.name.localeCompare(b.name))
    },

    createExercise(name, weightMode) {
      return mutate((state, time) => ensureExercise(state, name, weightMode, time))
    },

    createAndSelectExercise(name, weightMode, target = {}) {
      return mutate((state, time) => {
        const exercise = ensureExercise(state, name, weightMode, time)
        const workout = targetWorkout(state, target, time)
        return addItem(state, workout, exercise, time)
      })
    },

    renameExercise(id, name) {
      return mutate((state, time) => {
        const exercise = findExercise(state, id)
        const trimmed = typeof name === 'string' ? name.trim() : ''
        if (!trimmed) throw new Error('请填写动作名称')
        const clash = state.exercises.find(entry => entry.id !== id && !entry.archived
          && entry.name.toLowerCase() === trimmed.toLowerCase())
        if (clash) throw new Error('已有同名动作「' + clash.name + '」')
        exercise.name = trimmed
        exercise.updatedAt = time
      })
    },

    archiveExercise(id) {
      return mutate((state, time) => {
        const exercise = findExercise(state, id)
        exercise.archived = true
        exercise.updatedAt = time
      })
    },

    unarchiveExercise(id) {
      return mutate((state, time) => {
        const exercise = findExercise(state, id)
        const clash = state.exercises.find(entry => entry.id !== id && !entry.archived
          && entry.name.toLowerCase() === exercise.name.toLowerCase())
        if (clash) throw new Error('已有同名动作「' + clash.name + '」')
        exercise.archived = false
        exercise.updatedAt = time
      })
    },

    setWeightMode(id, weightMode) {
      return mutate((state, time) => {
        const exercise = findExercise(state, id)
        if (!WEIGHT_MODES.some(mode => mode.id === weightMode)) throw new Error('请选择重量口径')
        if (exercise.weightMode === weightMode) return
        if (state.workouts.some(workout => workout.items.some(item => item.exerciseId === id))) {
          throw new Error('这个动作已有记录，不能修改重量口径，请新建一个动作变体')
        }
        exercise.weightMode = weightMode
        exercise.updatedAt = time
      })
    },

    getWorkout(id) {
      const state = read()
      const workout = state.workouts.find(entry => entry.id === id)
      return workout ? workoutView(state, workout, false) : null
    },

    latestWorkout(date = today()) {
      const state = read()
      const workout = latest(state, date)
      return workout ? workoutView(state, workout, false) : null
    },

    latestActivityWorkout() {
      const state = read()
      const recent = state.workouts.map(workout => ({ workout, activity: lastActivity(workout) }))
        .sort((a, b) => b.activity - a.activity || b.workout.performedAt - a.workout.performedAt)[0]
      return recent ? workoutView(state, recent.workout, false) : null
    },

    listWorkouts(date) {
      const state = read()
      return state.workouts.filter(workout => !date || workout.date === date)
        .sort((a, b) => compareWorkouts(b, a))
        .map(workout => workoutView(state, workout, false, false))
    },

    selectExercise(exerciseId, target = {}) {
      return mutate((state, time) => {
        const exercise = findExercise(state, exerciseId)
        const workout = targetWorkout(state, target, time)
        return addItem(state, workout, exercise, time)
      })
    },

    saveDraft(setId, values) {
      return mutate((state, time) => {
        const row = findSet(state, setId)
        if (!row || !row.draft) return
        const fields = parseValues(row.item.weightMode, values, true)
        Object.assign(row.set, fields, { updatedAt: time })
        updateSetTime(row.workout, row.item, time)
      })
    },

    addSet(setId, values) {
      return mutate((state, time) => {
        const row = findSet(state, setId)
        if (!row) throw new Error('这一组不存在')
        const { item, set } = row
        if (!row.draft) return (item.draft || addDraft(state, item, set, time)).id
        const fields = parseValues(item.weightMode, values, false)
        Object.assign(set, fields, { status: 'LOGGED', loggedAt: time, updatedAt: time })
        item.sets.push(set)
        updateSetTime(row.workout, item, time)
        return addDraft(state, item, set, time).id
      })
    },

    updateSet(setId, values) {
      return mutate((state, time) => {
        const row = findSet(state, setId)
        if (!row) throw new Error('这一组不存在')
        if (row.draft) throw new Error('只能修改已记录的组')
        const fields = parseValues(row.item.weightMode, values, false)
        Object.assign(row.set, fields, { updatedAt: time })
        updateSetTime(row.workout, row.item, time)
      })
    },

    deleteSet(setId) {
      return mutate((state, time) => {
        const row = findSet(state, setId)
        if (!row) return null
        const { workout, item, set, draft } = row
        const index = item.sets.findIndex(entry => entry.id === setId)
        const itemIndex = workout.items.findIndex(entry => entry.id === item.id)
        const snapshot = deletionSnapshot(state, {
          type: 'set', workoutId: workout.id, itemId: item.id, itemIndex, index, set, draft
        })
        if (row.draft) item.draft = null
        else item.sets = item.sets.filter(set => set.id !== setId)
        if (!item.draft && !item.sets.length) {
          snapshot.item = { ...item }
          workout.items = workout.items.filter(entry => entry.id !== item.id)
        }
        updateSetTime(workout, item, time)
        return snapshot
      })
    },

    removeExercise(itemId) {
      return mutate((state, time) => {
        const workout = state.workouts.find(entry => entry.items.some(item => item.id === itemId))
        if (!workout) return null
        const index = workout.items.findIndex(item => item.id === itemId)
        const [item] = workout.items.splice(index, 1)
        workout.updatedAt = time
        return deletionSnapshot(state, { type: 'item', workoutId: workout.id, index, item })
      })
    },

    deleteWorkout(id) {
      return mutate(state => {
        const index = state.workouts.findIndex(workout => workout.id === id)
        if (index < 0) return null
        const [workout] = state.workouts.splice(index, 1)
        return deletionSnapshot(state, { type: 'workout', index, workout })
      })
    },

    undo(snapshot) {
      if (!snapshot) return
      return mutate((state, time) => {
        if ((state.generation || 0) !== snapshot.generation) throw new Error('无法撤销：本地数据已替换')
        if (snapshot.type === 'workout') {
          if (!state.workouts.some(workout => workout.id === snapshot.workout.id)) {
            state.workouts.splice(snapshot.index, 0, snapshot.workout)
          }
          return
        }
        const workout = findWorkout(state, snapshot.workoutId)
        if (snapshot.type === 'item') {
          restoreItem(state, workout, snapshot.item, snapshot.index)
          workout.updatedAt = time
          return
        }
        if (snapshot.item) restoreItem(state, workout, { ...snapshot.item, sets: [] }, snapshot.itemIndex)
        const item = workout.items.find(entry => entry.id === snapshot.itemId)
        if (!item) throw new Error('无法撤销：所属动作已被删除')
        if (snapshot.draft) {
          if (item.draft && item.draft.id !== snapshot.set.id) throw new Error('无法撤销：已有新的待确认组')
          item.draft = snapshot.set
        } else if (!item.sets.some(set => set.id === snapshot.set.id)) {
          restoreOrder(item.sets, snapshot.set, snapshot.index)
        }
        updateSetTime(workout, item, time)
      })
    },

    changeWorkoutDate(id, date) {
      return mutate((state, time) => {
        checkDate(date, time)
        const workout = findWorkout(state, id)
        workout.date = date
        workout.performedAt = workoutPerformedAt(date, workout)
        workout.updatedAt = time
      })
    },

    getPrevious(itemId) {
      const state = read()
      const workout = state.workouts.find(entry => entry.items.some(item => item.id === itemId))
      if (!workout) return null
      const item = workout.items.find(entry => entry.id === itemId)
      return getPriorSession(state.workouts, workout, item.exerciseId)
    },

    listExerciseHistory(exerciseId) {
      return historyWorkouts(read()).flatMap(workout => {
        const sets = workout.items.filter(item => item.exerciseId === exerciseId).flatMap(item => item.sets)
        return sets.length ? [{ workoutId: workout.id, date: workout.date, sets }] : []
      }).slice(0, HISTORY_LIMIT)
    },

    listHistory() {
      return historyWorkouts(read())
    },

    listHistoryDays() {
      const days = new Map()
      for (const workout of historyWorkouts(read())) {
        const day = days.get(workout.date) || { date: workout.date, workouts: [], totalSets: 0 }
        day.workouts.push(workout)
        day.totalSets += workout.totalSets
        days.set(day.date, day)
      }
      return Array.from(days.values())
    },

    getStats(date = today()) {
      return makeStats(historyWorkouts(read()), date)
    },

    reuseWorkout(sourceId, target = {}) {
      return mutate((state, time) => {
        const source = findWorkout(state, sourceId)
        const items = source.items.filter(item => item.sets.length)
        const exercises = Array.from(new Set(items.map(item => item.exerciseId)))
          .map(exerciseId => findExercise(state, exerciseId))
        const selected = target.workoutId ? findWorkout(state, target.workoutId) : null
        const date = target.date || formatDate(new Date(time), false)
        const existing = selected || (target.newWorkout ? null : latest(state, date))
        const active = exercises.filter(exercise => !exercise.archived)
        const pending = active.filter(exercise => !existing || !existing.items.some(item => item.exerciseId === exercise.id))
        const workout = pending.length ? (existing || targetWorkout(state, target, time)) : existing
        for (const exercise of pending) addItem(state, workout, exercise, time)
        return {
          workoutId: workout ? workout.id : null,
          added: pending.length,
          skippedExisting: active.length - pending.length,
          skippedArchived: exercises.length - active.length
        }
      })
    }
  }
}

function getStore() {
  return createWorkoutStore(wx)
}

module.exports = {
  STORAGE_KEY: LEGACY_WORKOUT_KEY,
  WEIGHT_MODES,
  EXERCISE_PRESETS,
  createWorkoutStore,
  parseDate,
  deviceZone,
  formatWeight,
  formatSet,
  getStore
}
