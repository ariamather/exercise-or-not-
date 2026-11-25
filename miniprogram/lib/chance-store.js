const { DEFAULT_TARGET, findGame, stopByKey, resolveSetup, draw } = require('./chance-model')
const { readAppState, updateAppState } = require('./workout-storage')

function dateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function restoreResult(result) {
  if (!result || typeof result.date !== 'string' || typeof result.train !== 'boolean') return null
  const game = findGame(result.gameId)
  if (!game || game.model.id !== result.modelId || !game.model.outcomes.includes(result.outcomeId)) return null
  return result.stopKey == null || stopByKey(game.model, result.stopKey) ? result : null
}

function normalizeChance(saved) {
  const target = typeof saved.target === 'number' && Number.isFinite(saved.target) ? saved.target : DEFAULT_TARGET
  return {
    gameId: findGame(saved.gameId) ? saved.gameId : 'dice',
    target: Math.min(1, Math.max(0, target)),
    revolverStopKey: saved.revolverStopKey || null,
    result: restoreResult(saved.result),
    memory: saved.memory || {},
  }
}

function readChance(storage) {
  return normalizeChance(readAppState(storage).chance)
}

function changeChance(storage, mutate) {
  return updateAppState(storage, (state) => {
    state.chance = mutate(normalizeChance(state.chance))
    return state.chance
  })
}

function todayResult(state, date = new Date()) {
  return state.result && state.result.date === dateKey(date) ? state.result : null
}

function updateGame(storage, gameId) {
  if (!findGame(gameId)) throw new RangeError('Unknown game')
  return changeChance(storage, (state) => ({ ...state, gameId }))
}

function updateStop(storage, key) {
  return changeChance(storage, (state) => {
    const { game } = resolveSetup(state)
    const stop = stopByKey(game.model, key)
    if (!stop) throw new RangeError('Unknown rule')
    return { ...state, target: stop.chance, revolverStopKey: game.id === 'revolver' ? stop.key : null }
  })
}

function roll(storage, { random = Math.random, date = new Date() } = {}) {
  return changeChance(storage, (state) => ({
    ...state,
    result: { ...draw(resolveSetup(state), random), date: dateKey(date) },
  }))
}

module.exports = { dateKey, readChance, todayResult, updateGame, updateStop, roll }
