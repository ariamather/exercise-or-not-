const { WEIGHT_MODES, deviceZone, parseDate } = require('./workouts')
const { DEFAULT_TARGET, findGame, resolveSetup } = require('./chance-model')
const { readAppState, updateAppState } = require('./workout-storage')

const FORMAT_VERSION = 1
const SCHEMA_VERSION = 1
const MAX_BACKUP_LENGTH = 20 * 1024 * 1024
const MAX_MEMORY_LENGTH = 16384
const MAX_INT = 2147483647
const DEFAULT_FACES = [4, 5, 6]
const MODES = new Set(WEIGHT_MODES.map(mode => mode.id))

function fail(reason) {
  throw new Error('备份文件有误：' + reason)
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + '格式不正确')
  return value
}

function validateFields(value, label, allowed) {
  record(value, label)
  const extension = Object.keys(value).find(key => !allowed.includes(key))
  if (extension) fail(label + '包含此版本不支持的字段「' + extension + '」')
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(label + '为空或格式不正确')
  return value
}

function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(label + '超出范围')
  return value
}

function timestamp(value, label) {
  return integer(value, label, -8640000000000000, 8640000000000000)
}

function mode(value) {
  if (!MODES.has(value)) fail('存在未知的重量口径')
  return value
}

function zone(value) {
  text(value, '时区')
  const offset = value.match(/^(?:(?:UTC|GMT|UT))?[+-](\d{1,2})(?::?(\d{2})(?::?(\d{2}))?)?$/)
  if (offset) {
    const hours = Number(offset[1])
    const minutes = Number(offset[2] || 0)
    const seconds = Number(offset[3] || 0)
    if (hours < 18 && minutes < 60 && seconds < 60) return value
    if (hours === 18 && !minutes && !seconds) return value
  } else if (value === 'UTC' || value === 'GMT' || value === 'UT') {
    return value
  } else if (/^[A-Za-z][A-Za-z0-9~/._+-]+$/.test(value)) {
    if (typeof Intl !== 'object') return value
    try {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return value
    } catch (_) {
      // Fall through to the user-facing validation error.
    }
  }
  fail('训练时区不正确「' + value + '」')
}

function collect(value, label, map) {
  if (!Array.isArray(value)) fail('缺少' + label + '列表')
  const byId = new Map()
  for (const row of value) {
    const id = text(record(row, label).id, label + ' ID')
    if (byId.has(id)) fail(label + ' ID 重复')
    byId.set(id, map(row))
  }
  return byId
}

function rowTimes(row) {
  return {
    createdAt: timestamp(row.createdAt, '创建时间'),
    updatedAt: timestamp(row.updatedAt, '更新时间')
  }
}

function positionOrder(a, b) {
  return a.position - b.position || a.createdAt - b.createdAt
}

function nextIdFor(groups) {
  let nextId = 1
  for (const group of groups) {
    for (const id of group.keys()) {
      const match = id.match(/^(?:exercise|workout|item|set)-([1-9]\d*)$/)
      if (!match) continue
      const value = Number(match[1])
      if (Number.isSafeInteger(value) && value <= MAX_INT) nextId = Math.max(nextId, value + 1)
    }
  }
  return nextId
}

function utf8Length(value) {
  let bytes = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    bytes += codePoint < 128 ? 1 : codePoint < 2048 ? 2 : codePoint < 65536 ? 3 : 4
    if (bytes > MAX_BACKUP_LENGTH) return bytes
  }
  return bytes
}

function exceedsBackupLimit(value) {
  return value.length > MAX_BACKUP_LENGTH || utf8Length(value) > MAX_BACKUP_LENGTH
}

function chanceResult(value) {
  if (value === null) return null
  validateFields(value, '玩法结果', ['gameId', 'modelId', 'outcomeId', 'train', 'date', 'stopKey'])
  for (const field of ['gameId', 'modelId', 'outcomeId']) text(value[field], '玩法结果')
  if (typeof value.train !== 'boolean') fail('玩法结果不完整')
  if (value.stopKey != null) text(value.stopKey, '玩法结果规则')
  parseDate(value.date)
  return value
}

function decodeChanceSettings(value, workoutsOnly) {
  const settings = record(value, '玩法设置')
  validateFields(settings, '玩法设置', [
    'diceTrainFaces', 'chanceGame', 'chanceTarget', 'chanceMemory', 'chanceRevolverStopKey', 'chanceResult'
  ])
  if (!Array.isArray(settings.diceTrainFaces) || settings.diceTrainFaces.some(face => (
    !Number.isInteger(face) || face < 1 || face > 6
  ))) fail('骰子点数超出 1–6')
  if (workoutsOnly === true && Object.keys(settings).length === 1
    && settings.diceTrainFaces.join(',') === DEFAULT_FACES.join(',')) return null
  const target = settings.chanceTarget == null ? new Set(settings.diceTrainFaces).size / 6 : settings.chanceTarget
  if (!Number.isFinite(target) || target < 0 || target > 1) fail('训练概率超出 0–100%')
  const gameId = settings.chanceGame == null ? 'dice' : text(settings.chanceGame, '玩法名称')
  const revolverStopKey = settings.chanceRevolverStopKey == null
    ? null : text(settings.chanceRevolverStopKey, '左轮规则')
  const memory = settings.chanceMemory == null ? {} : record(settings.chanceMemory, '玩法记忆')
  if (Object.entries(memory).some(([key, data]) => (
    !/^[a-z0-9_-]+$/.test(key) || typeof data !== 'string' || data.length > MAX_MEMORY_LENGTH
  ))) fail('玩法记忆格式不正确')
  const chance = { gameId, target, revolverStopKey, memory }
  if (Object.prototype.hasOwnProperty.call(settings, 'chanceResult')) chance.result = chanceResult(settings.chanceResult)
  return chance
}

function decodeWorkoutBackup(raw) {
  if (typeof raw !== 'string' || exceedsBackupLimit(raw)) {
    throw new Error('备份文件过大或格式不正确')
  }
  let file
  try {
    file = JSON.parse(raw.replace(/^\uFEFF/, ''))
  } catch (_) {
    throw new Error('不是有效的备份文件')
  }
  record(file, '备份')
  if (file.formatVersion !== FORMAT_VERSION || file.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('备份版本不受支持')
  }
  validateFields(file, '备份', [
    'formatVersion', 'schemaVersion', 'appVersion', 'exportedAt', 'exercises', 'workouts',
    'workoutExercises', 'sets', 'settings', 'workoutsOnly'
  ])
  const appVersion = text(file.appVersion, '应用版本')
  const exportedAt = timestamp(file.exportedAt, '导出时间')
  const chance = decodeChanceSettings(file.settings, file.workoutsOnly)
  const exercises = collect(file.exercises, '动作', row => {
    validateFields(row, '动作', ['id', 'name', 'weightMode', 'archived', 'createdAt', 'updatedAt'])
    if (typeof row.archived !== 'boolean') fail('动作归档状态格式不正确')
    return {
      id: row.id,
      name: text(row.name, '动作名称'),
      weightMode: mode(row.weightMode),
      archived: row.archived,
      ...rowTimes(row)
    }
  })
  const names = new Set()
  for (const exercise of exercises.values()) {
    if (exercise.archived) continue
    const name = exercise.name.toLowerCase()
    if (names.has(name)) fail('有重名的动作')
    names.add(name)
  }

  const validatedZones = new Set()
  const workouts = collect(file.workouts, '训练', row => {
    validateFields(row, '训练', ['id', 'performedAt', 'trainingDate', 'zoneId', 'createdAt', 'updatedAt'])
    parseDate(row.trainingDate)
    if (!validatedZones.has(row.zoneId)) validatedZones.add(zone(row.zoneId))
    return {
      id: row.id,
      date: row.trainingDate,
      performedAt: timestamp(row.performedAt, '训练时间'),
      zoneId: row.zoneId,
      ...rowTimes(row),
      items: []
    }
  })

  const items = collect(file.workoutExercises, '训练动作', row => {
    validateFields(row, '训练动作', [
      'id', 'workoutId', 'exerciseId', 'position', 'nameSnapshot', 'weightModeSnapshot', 'createdAt', 'updatedAt'
    ])
    if (!workouts.has(row.workoutId)) fail('训练动作引用了不存在的训练')
    if (!exercises.has(row.exerciseId)) fail('训练动作引用了不存在的动作')
    const item = {
      id: row.id,
      exerciseId: row.exerciseId,
      name: text(row.nameSnapshot, '训练动作名称'),
      weightMode: mode(row.weightModeSnapshot),
      position: integer(row.position, '训练动作顺序', -MAX_INT - 1, MAX_INT),
      ...rowTimes(row),
      sets: [],
      draft: null
    }
    const list = workouts.get(row.workoutId).items
    if (list.some(entry => entry.exerciseId === row.exerciseId)) fail('同一场训练包含重复的动作')
    list.push(item)
    return item
  })

  let draftCount = 0
  let loggedSetCount = 0
  const sets = collect(file.sets, '训练组', row => {
    validateFields(row, '训练组', [
      'id', 'workoutExerciseId', 'position', 'weightGrams', 'reps', 'status', 'loggedAt', 'createdAt', 'updatedAt'
    ])
    const item = items.get(row.workoutExerciseId)
    if (!item) fail('组引用了不存在的训练动作')
    const set = {
      id: row.id,
      position: integer(row.position, '训练组顺序', -MAX_INT - 1, MAX_INT),
      weightGrams: row.weightGrams == null ? null : integer(row.weightGrams, '重量', 0, MAX_INT),
      reps: row.reps == null ? null : integer(row.reps, '次数', 1, MAX_INT),
      status: row.status,
      loggedAt: row.loggedAt == null ? null : timestamp(row.loggedAt, '记录时间'),
      ...rowTimes(row)
    }

    if (row.status === 'DRAFT') {
      if (item.draft) fail('同一个训练动作包含多个待确认组，此版本无法还原')
      item.draft = set
      draftCount += 1
    } else if (row.status === 'LOGGED') {
      if (set.loggedAt === null) fail('已记录的组缺少记录时间')
      item.sets.push(set)
      loggedSetCount += 1
    } else {
      fail('未知的组状态')
    }
    return set
  })

  for (const item of items.values()) item.sets.sort(positionOrder)
  for (const workout of workouts.values()) workout.items.sort(positionOrder)
  const dates = Array.from(workouts.values(), workout => workout.date).sort()
  return {
    chance,
    state: {
      version: 1,
      nextId: nextIdFor([exercises, workouts, items, sets]),
      exercises: Array.from(exercises.values()),
      workouts: Array.from(workouts.values())
    },
    summary: {
      formatVersion: FORMAT_VERSION,
      appVersion,
      exportedAt,
      exerciseCount: exercises.size,
      workoutCount: workouts.size,
      loggedSetCount,
      draftCount,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
      restoresChance: !!chance,
      chanceGame: chance && (findGame(chance.gameId) || {}).name || null,
      unavailableChanceGame: chance && !findGame(chance.gameId) ? chance.gameId : null,
      chanceTarget: chance ? chance.target : null
    }
  }
}

function previewWorkoutBackup(text) {
  return decodeWorkoutBackup(text).summary
}

function importWorkoutBackup(text, options = {}) {
  const { state, chance, summary } = decodeWorkoutBackup(text)
  return updateAppState(options.storage || wx, app => {
    const now = options.now || Date.now
    app.backup.undo = { at: Number(now()), workouts: app.workouts, chance: app.chance }
    state.generation = (app.workouts.generation || 0) + 1
    app.workouts = state
    if (chance) app.chance = { result: app.chance.result || null, ...chance }
    return summary
  })
}

function exportWorkoutBackup(options = {}) {
  const { workouts: state, chance } = readAppState(options.storage || wx)
  const now = options.now || Date.now
  const target = Number.isFinite(chance.target) ? chance.target : DEFAULT_TARGET
  const diceStop = resolveSetup({ gameId: 'dice', target }).stop
  const diceTrainFaces = Array.from({ length: diceStop.numerator }, (_, index) => 7 - diceStop.numerator + index)
  const file = {
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: options.appVersion || 'wechat-1.0',
    exportedAt: Number(now()),
    exercises: state.exercises,
    workouts: [],
    workoutExercises: [],
    sets: [],
    settings: {
      diceTrainFaces,
      chanceGame: chance.gameId || 'dice',
      chanceTarget: target,
      chanceMemory: chance.memory || {},
      chanceRevolverStopKey: chance.revolverStopKey || null,
      chanceResult: chance.result || null
    }
  }

  for (const workout of state.workouts) {
    const { id, performedAt, createdAt, updatedAt, zoneId } = workout
    file.workouts.push({
      id, performedAt, createdAt, updatedAt,
      trainingDate: workout.date,
      zoneId: zoneId || deviceZone(performedAt)
    })
    workout.items.forEach((item, index) => {
      file.workoutExercises.push({
        id: item.id,
        workoutId: id,
        exerciseId: item.exerciseId,
        position: item.position == null ? index : item.position,
        nameSnapshot: item.name,
        weightModeSnapshot: item.weightMode,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })
      const rows = item.draft ? item.sets.concat(item.draft) : item.sets
      rows.forEach((set, index) => {
        file.sets.push({
          ...set,
          workoutExerciseId: item.id,
          position: set.position == null ? index : set.position
        })
      })
    })
  }

  const text = JSON.stringify(file)
  if (exceedsBackupLimit(text)) throw new Error('备份超过 20 MB，无法导出为可恢复的文件。')
  return text
}

function getBackupStatus(options = {}) {
  const { workouts, backup } = readAppState(options.storage || wx)
  let loggedSetCount = 0
  for (const workout of workouts.workouts) {
    for (const item of workout.items) loggedSetCount += item.sets.length
  }
  return {
    lastExportAt: backup.lastExportAt ?? null,
    undoAvailableAt: backup.undo ? backup.undo.at : null,
    workoutCount: workouts.workouts.length,
    loggedSetCount
  }
}

function markBackupExported(exportedAt, options = {}) {
  return updateAppState(options.storage || wx, app => { app.backup.lastExportAt = exportedAt })
}

function undoLastRestore(options = {}) {
  return updateAppState(options.storage || wx, app => {
    if (!app.backup.undo) throw new Error('没有可撤销的恢复')
    const { workouts, chance } = app.backup.undo
    workouts.generation = (app.workouts.generation || 0) + 1
    app.workouts = workouts
    app.chance = chance
    app.backup.undo = null
  })
}

module.exports = {
  MAX_BACKUP_LENGTH, previewWorkoutBackup, importWorkoutBackup, exportWorkoutBackup,
  getBackupStatus, markBackupExported, undoLastRestore
}
