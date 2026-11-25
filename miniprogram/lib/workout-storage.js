const LEGACY_WORKOUT_KEY = 'exerciseornot.workouts.v1'
const LEGACY_CHANCE_KEY = 'workout_chance_v1'
const APP_STATE_KEY = 'exerciseornot.state.v2'
const ACTIVE_FILE_KEY = 'exerciseornot.active-file.v2'
const VERSION = 2

function emptyWorkouts() {
  return { version: 1, nextId: 1, exercises: [], workouts: [] }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function decode(raw) {
  try {
    return JSON.parse(raw)
  } catch (_) {
    throw new Error('本地数据无法读取')
  }
}

function validateWorkouts(state) {
  if (!isObject(state) || state.version !== 1 || !Number.isSafeInteger(state.nextId) || state.nextId < 1
    || !Array.isArray(state.exercises) || !Array.isArray(state.workouts)) {
    throw new Error('本地训练记录格式不受支持')
  }
  return state
}

function validate(state) {
  if (!isObject(state) || state.version !== VERSION || !isObject(state.chance) || !isObject(state.backup)) {
    throw new Error('本地数据格式不受支持')
  }
  validateWorkouts(state.workouts)
  return state
}

function legacyState(storage) {
  const rawWorkouts = storage.getStorageSync(LEGACY_WORKOUT_KEY)
  const rawChance = storage.getStorageSync(LEGACY_CHANCE_KEY)
  const workouts = rawWorkouts ? validateWorkouts(decode(rawWorkouts)) : emptyWorkouts()
  if (rawChance && !isObject(rawChance)) throw new Error('本地玩法记录格式不受支持')
  return { version: VERSION, workouts, chance: rawChance ? { ...rawChance } : {}, backup: {} }
}

function filesFor(storage) {
  const base = storage.env && storage.env.USER_DATA_PATH
  if (!base || typeof storage.getFileSystemManager !== 'function') return null
  const fs = storage.getFileSystemManager()
  return {
    fs,
    path: slot => base + '/exerciseornot-state-' + slot + '.json'
  }
}

function currentSlot(storage) {
  const slot = storage.getStorageSync(ACTIVE_FILE_KEY)
  if (!slot || slot === 'a' || slot === 'b') return slot
  throw new Error('本地存储索引无法读取')
}

function load(storage, files, slot) {
  if (slot) {
    if (!files) throw new Error('暂时无法访问本地训练文件')
    return validate(decode(files.fs.readFileSync(files.path(slot), 'utf8')))
  }
  const raw = storage.getStorageSync(APP_STATE_KEY)
  return raw ? validate(decode(raw)) : legacyState(storage)
}

function readAppState(storage) {
  return load(storage, filesFor(storage), currentSlot(storage))
}

function clearLegacy(storage) {
  if (typeof storage.removeStorageSync !== 'function') return
  try {
    storage.removeStorageSync(LEGACY_WORKOUT_KEY)
    storage.removeStorageSync(LEGACY_CHANCE_KEY)
    storage.removeStorageSync(APP_STATE_KEY)
  } catch (_) {
    // The active slot takes precedence even if old cache cleanup fails.
  }
}

function updateAppState(storage, mutate) {
  const files = filesFor(storage)
  const slot = currentSlot(storage)
  const state = load(storage, files, slot)
  const before = JSON.stringify(state)
  const result = mutate(state)
  const after = JSON.stringify(state)
  if (after === before && (slot || !files)) return result

  if (files) {
    // Only the small slot pointer is stored in wx storage. A failed write leaves
    // the active file reachable, even if the inactive file was partly written.
    const next = slot === 'a' ? 'b' : 'a'
    files.fs.writeFileSync(files.path(next), after, 'utf8')
    storage.setStorageSync(ACTIVE_FILE_KEY, next)
    if (!slot) clearLegacy(storage)
  } else {
    storage.setStorageSync(APP_STATE_KEY, after)
  }
  return result
}

module.exports = {
  ACTIVE_FILE_KEY,
  APP_STATE_KEY,
  LEGACY_WORKOUT_KEY,
  LEGACY_CHANCE_KEY,
  readAppState,
  updateAppState
}
