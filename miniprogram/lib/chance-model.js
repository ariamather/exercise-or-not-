const DEFAULT_TARGET = 0.5

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function makeStop(key, numerator, denominator, rule) {
  return {
    key,
    numerator,
    denominator,
    rule,
    chance: numerator / denominator,
    percent: Math.round(100 * numerator / denominator),
  }
}

function upperNumberModel(id, count, describeRule) {
  return {
    id,
    outcomes: range(1, count).map(String),
    stops: range(0, count).map((k) => makeStop(`${k}/${count}`, k, count, describeRule(k))),
    trains(stop, outcome) {
      const value = Number(outcome)
      return Number.isInteger(value) && value <= count && value > count - stop.numerator
    },
  }
}

const die = upperNumberModel('d6', 6, (k) => {
  if (k === 0) return '怎么掷都休息'
  if (k === 6) return '怎么掷都练'
  return `掷出 ${range(7 - k, 6).join('、')} 就练`
})

const lots = upperNumberModel('lots', 10, (k) => {
  if (k === 0) return '怎么抽都休息'
  if (k === 10) return '怎么抽都练'
  return `10 支签里放 ${k} 支「练」签`
})

const scratch = upperNumberModel('scratch', 10, (k) => {
  if (k === 0) return '刮开必得「歇」'
  if (k === 10) return '刮开必得「练」'
  return `每 10 种等可能的票中，${k} 种刮出「练」`
})

function countBits(value) {
  let count = 0
  while (value) {
    value &= value - 1
    count += 1
  }
  return count
}

const layouts = range(0, 6).map((count) => range(0, 63).filter((mask) => countBits(mask) === count))

function revolverConfiguration(loaded, shots, all = false) {
  const key = `${loaded}-${shots}-${all ? 'all' : 'any'}`
  const roundMask = (1 << shots) - 1
  const trains = (mask) => all ? (mask & roundMask) === roundMask : (mask & roundMask) !== 0
  let rule = `6 格中有 ${loaded} 格能翻牌，${shots} 回合至少翻牌一次就练`
  if (all) rule = `6 格中有 ${loaded} 格能翻牌，两回合都翻牌才练`
  if (shots === 1) rule = `6 格中有 ${loaded} 格能翻牌，翻到就练`
  if (loaded === 6) rule = '6 格都能翻牌，必定训练'
  if (loaded === 0) rule = '6 格都空，必定休息'
  const masks = layouts[loaded]
  return {
    loaded,
    shots,
    all,
    trains,
    stop: makeStop(key, masks.filter(trains).length, masks.length, rule),
  }
}

const revolverPresets = [
  [0, 1], [2, 2, true], [1, 1], [3, 2, true], [2, 1], [4, 2, true], [3, 1],
  [2, 2], [4, 1], [3, 2], [5, 1], [4, 2], [6, 1],
]
const revolverConfigs = Object.fromEntries([
  ...revolverPresets,
  ...range(0, 6).flatMap((loaded) => range(1, 6).map((shots) => [loaded, shots])),
].map((preset) => {
  const configuration = revolverConfiguration(...preset)
  return [configuration.stop.key, configuration]
}))

function sameChance(left, right) {
  return left.numerator * right.denominator === right.numerator * left.denominator
}

const revolver = {
  id: 'revolver',
  outcomes: range(1, 60).map(String),
  stops: Object.values(revolverConfigs).map((config) => config.stop)
    .filter((stop, index, stops) => stops.findIndex((other) => sameChance(stop, other)) === index)
    .sort((a, b) => a.chance - b.chance),
  stopByKey(key) {
    return revolverConfigs[key] && revolverConfigs[key].stop
  },
  trains(stop, outcome) {
    const mask = revolverMask(stop.key, outcome)
    return mask !== null && revolverConfigs[stop.key].trains(mask)
  },
}

function revolverConfigForStop(key) {
  const config = revolverConfigs[key]
  if (!config) return null
  const { loaded, shots, all } = config
  return { loaded, shots, all }
}

function revolverMask(key, outcome) {
  const config = revolverConfigs[key]
  const number = Number(outcome)
  if (!config || !Number.isInteger(number) || number < 1 || number > 60) return null
  const masks = layouts[config.loaded]
  return masks[(number - 1) % masks.length]
}

const trainCells = [[], [1], [1, 4], [1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5], range(1, 6)]
const reelRules = {
  any: { minimum: 1, description: '任一轮出「练」就练' },
  majority: { minimum: 2, description: '至少两轮出「练」就练' },
  all: { minimum: 3, description: '三轮全出「练」才练' },
}
const reel = range(1, 6)
const reelOutcomes = reel.flatMap((a) => reel.flatMap((b) => reel.map((c) => `${a},${b},${c}`)))
const slotPresets = [
  '0-majority', '1-majority', '3-all', '2-majority', '4-all', '1-any', '3-majority',
  '5-all', '2-any', '4-majority', '3-any', '5-majority', '6-majority',
]

function isTrainCell(key, value) {
  const [k] = key.split('-')
  return trainCells[Number(k)].includes(value)
}

function slotTrains(key, outcome) {
  const [, rule] = key.split('-')
  const cells = outcome.split(',').map(Number)
  return cells.length === 3 && cells.every((cell) => reel.includes(cell)) &&
    cells.filter((cell) => isTrainCell(key, cell)).length >= reelRules[rule].minimum
}

const slot = {
  id: 'slot',
  outcomes: reelOutcomes,
  stops: slotPresets.map((key) => {
    const [k, rule] = key.split('-')
    const description = k === '0' ? '每轮 0 格「练」，怎么拉都歇' :
      k === '6' ? '每轮 6 格「练」，怎么拉都练' : `每轮 ${k} 格「练」，${reelRules[rule].description}`
    return makeStop(key, reelOutcomes.filter((outcome) => slotTrains(key, outcome)).length,
      reelOutcomes.length, description)
  }),
  trains: (stop, outcome) => slotTrains(stop.key, outcome),
}

const wheel = {
  id: 'wheel',
  outcomes: range(1, 60).map(String),
  stops: [[0, 12], [1, 10], [2, 10], [3, 12], [4, 12], [6, 12],
    [8, 12], [9, 12], [8, 10], [9, 10], [12, 12]].map(([n, d]) => {
    const rule = n === 0 ? '整圈都是「歇」' :
      n === d ? '整圈都是「练」' : `「练」占盘面 ${n}/${d}（${360 * n / d}°）`
    return makeStop(`${n}/${d}`, n, d, rule)
  }),
  trains(stop, outcome) {
    const value = Number(outcome)
    return Number.isInteger(value) && value > 0 && value <= 60 * stop.chance
  },
}

const games = [
  { id: 'dice', name: '骰子', model: die },
  { id: 'cup', name: '骰盅', model: die },
  { id: 'lots', name: '签筒', model: lots },
  { id: 'scratch', name: '刮刮乐', model: scratch, manual: true },
  { id: 'revolver', name: '左轮', model: revolver, manual: true },
  { id: 'slot', name: '老虎机', model: slot },
  { id: 'wheel', name: '转盘', model: wheel, manual: true },
]

function findGame(id) {
  return games.find((game) => game.id === id)
}

function stopByKey(model, key) {
  return model.stopByKey ? model.stopByKey(key) : model.stops.find((stop) => stop.key === key)
}

function nearestStop(stops, value) {
  return stops.reduce((nearest, stop) =>
    Math.abs(stop.chance - value) + Number.EPSILON < Math.abs(nearest.chance - value) ? stop : nearest)
}

function resolveSetup({ gameId, target = DEFAULT_TARGET, revolverStopKey }) {
  const game = findGame(gameId) || games[0]
  const { model } = game
  const chance = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : DEFAULT_TARGET
  const stops = chance > 0 && chance < 1 ? model.stops.filter((stop) => stop.chance > 0 && stop.chance < 1) : model.stops
  const exactStop = model === revolver && stopByKey(model, revolverStopKey)
  const stop = exactStop && exactStop.chance === chance ? exactStop : nearestStop(stops, chance)
  return { game, stop }
}

function draw(setup, random = Math.random) {
  const { game, stop } = setup
  const { model } = game
  const index = Math.floor(random() * model.outcomes.length)
  const outcomeId = model.outcomes[index]
  if (!outcomeId) throw new RangeError('Random value must be in [0, 1)')
  return {
    gameId: game.id,
    modelId: model.id,
    stopKey: stop.key,
    outcomeId,
    train: model.trains(stop, outcomeId),
  }
}

module.exports = {
  DEFAULT_TARGET, games, findGame, stopByKey, nearestStop, sameChance, resolveSetup, draw,
  isTrainCell, revolverConfigForStop, revolverMask,
}
