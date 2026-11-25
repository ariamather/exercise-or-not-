const {
  MAX_BACKUP_LENGTH, previewWorkoutBackup, importWorkoutBackup, exportWorkoutBackup,
  getBackupStatus, markBackupExported, undoLastRestore
} = require('./workout-backup')

function cancelled(error) {
  return /cancel/i.test(error && (error.errMsg || error.message) || '')
}

function timeText(value) {
  const time = new Date(value)
  const pad = part => String(part).padStart(2, '0')
  const date = [time.getFullYear(), pad(time.getMonth() + 1), pad(time.getDate())].join('-')
  return date + ' ' + pad(time.getHours()) + ':' + pad(time.getMinutes())
}

function previewText(info) {
  const lines = [
    '导出于 ' + timeText(info.exportedAt),
    info.exerciseCount + ' 个动作，' + info.workoutCount + ' 场训练，'
      + info.loggedSetCount + ' 组已记录，' + info.draftCount + ' 组待确认'
  ]
  if (info.firstDate && info.lastDate) lines.push('训练日期 ' + info.firstDate + ' 至 ' + info.lastDate)
  if (info.unavailableChanceGame) lines.push('原玩法将在支持后可用，目前使用骰子。')
  if (info.chanceGame) lines.push('玩法 ' + info.chanceGame)
  return lines.join('\n')
}

module.exports = {
  data: { busy: false, backupNote: '', lastExportText: '', restoreText: '' },

  onShow() {
    this.refreshBackupStatus()
  },

  refreshBackupStatus() {
    try {
      const status = getBackupStatus()
      this.setData({
        lastExportText: status.lastExportAt === null ? '从未导出' : timeText(status.lastExportAt),
        restoreText: status.undoAvailableAt === null ? '' : timeText(status.undoAvailableAt)
      })
    } catch (error) {
      this.setData({ backupNote: error.message || '无法读取备份状态。' })
    }
  },

  finishBackup(note = '') {
    this.setData({ busy: false, backupNote: note })
    this.refreshBackupStatus()
  },

  failBackup(error) {
    const detail = error && (error.message || error.errMsg)
    this.finishBackup(cancelled(error) ? '' : (detail || '操作失败，请重试。'))
  },

  chooseBackup() {
    if (this.data.busy) return
    this.setData({ busy: true, backupNote: '' })
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: ({ tempFiles }) => {
        const selected = tempFiles[0]
        if (!selected) return this.finishBackup()
        if (selected.size > MAX_BACKUP_LENGTH) return this.finishBackup('备份文件超过 20 MB。')
        wx.getFileSystemManager().readFile({
          filePath: selected.path,
          encoding: 'utf8',
          success: file => this.confirmImport(file.data),
          fail: error => this.failBackup(error)
        })
      },
      fail: error => this.failBackup(error)
    })
  },

  confirmImport(content) {
    try {
      const info = previewWorkoutBackup(content)
      const replacement = info.restoresChance ? '将替换当前的训练与玩法数据。' : '将替换当前的训练数据。'
      wx.showModal({
        title: '恢复这份备份？',
        content: previewText(info) + '\n\n' + replacement + '恢复完成后可撤销。',
        confirmText: '恢复备份',
        cancelText: '取消',
        success: answer => {
          if (!answer.confirm) return this.finishBackup()
          try {
            importWorkoutBackup(content)
            this.finishBackup('已恢复备份。')
          } catch (error) {
            this.failBackup(error)
          }
        },
        fail: error => this.failBackup(error)
      })
    } catch (error) {
      this.failBackup(error)
    }
  },

  exportBackup() {
    if (this.data.busy) return
    this.setData({ busy: true, backupNote: '' })
    try {
      const exportedAt = Date.now()
      const content = exportWorkoutBackup({ now: () => exportedAt })
      const fileName = '练不练备份-' + timeText(exportedAt).slice(0, 10) + '.json'
      const filePath = wx.env.USER_DATA_PATH + '/workout-backup.json'
      const success = () => {
        try {
          markBackupExported(exportedAt)
          this.finishBackup('已导出备份。')
        } catch (_) {
          this.finishBackup('备份已导出。导出时间未能保存。')
        }
      }
      wx.getFileSystemManager().writeFile({
        filePath,
        data: content,
        encoding: 'utf8',
        success: () => this.shareBackupFile(filePath, fileName, success),
        fail: error => this.failBackup(error)
      })
    } catch (error) {
      this.failBackup(error)
    }
  },

  shareBackupFile(filePath, fileName, success) {
    const save = error => {
      if (cancelled(error)) return this.finishBackup()
      if (typeof wx.saveFileToDisk === 'function') {
        wx.saveFileToDisk({ filePath, success, fail: failure => this.failBackup(failure) })
      } else if (error) {
        this.failBackup(error)
      } else {
        this.finishBackup('当前微信版本不支持导出文件。')
      }
    }
    if (typeof wx.shareFileMessage === 'function') {
      wx.shareFileMessage({ filePath, fileName, success, fail: save })
    } else {
      save()
    }
  },

  confirmUndoRestore() {
    if (this.data.busy) return
    this.setData({ busy: true, backupNote: '' })
    wx.showModal({
      title: '撤销上次恢复？',
      content: '数据将回到上次恢复前的状态。恢复后新增的记录和玩法变更会被覆盖。',
      confirmText: '撤销恢复',
      cancelText: '取消',
      success: answer => {
        if (!answer.confirm) return this.finishBackup()
        try {
          undoLastRestore()
          this.finishBackup('已撤销上次恢复。')
        } catch (error) {
          this.failBackup(error)
        }
      },
      fail: error => this.failBackup(error)
    })
  }
}
