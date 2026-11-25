const backup = require('../../lib/backup-page')
Page({
  ...backup,
  privacy() {
    wx.showModal({
      title: '隐私说明',
      content:
        '训练记录和玩法设置保存在本机。小程序没有广告、统计或训练数据上传接口。导出备份时，由你选择保存或分享的位置。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
