const KEY = 'exerciseornot.hints.dismissed'
function isDismissed(name, storage = wx) {
  const names = storage.getStorageSync(KEY)
  return Array.isArray(names) && names.includes(name)
}
function dismiss(name, storage = wx) {
  const names = storage.getStorageSync(KEY)
  storage.setStorageSync(
    KEY,
    Array.from(new Set([...(Array.isArray(names) ? names : []), name])),
  )
}
module.exports = { isDismissed, dismiss }
