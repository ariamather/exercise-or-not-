const { readFileSync, writeFileSync } = require('node:fs')
const { importWorkoutBackup, exportWorkoutBackup } = require('../../miniprogram/lib/workout-backup')

const paths = process.argv.slice(2)
if (paths.length !== 2) {
  throw new Error('Usage: node tools/backup/roundtrip.js <android-input.json> <new-wechat-output.json>')
}

const [input, output] = paths
const state = new Map()
const storage = {
  getStorageSync: key => state.get(key),
  setStorageSync: (key, data) => { state.set(key, data) }
}
const { exportedAt } = importWorkoutBackup(readFileSync(input, 'utf8'), { storage })
const exported = exportWorkoutBackup({ storage, now: () => exportedAt })
writeFileSync(output, exported, { encoding: 'utf8', flag: 'wx' })
