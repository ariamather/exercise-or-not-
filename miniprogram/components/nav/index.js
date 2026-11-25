const tabs = [
  { page: 'chance', label: '玩法' },
  { page: 'record', label: '记录' },
  { page: 'stats', label: '统计' },
]
Component({
  properties: { active: String },
  data: { tabs, selected: 'record' },
  lifetimes: {
    attached() {
      this.sync()
    },
  },
  pageLifetimes: {
    show() {
      this.sync()
    },
  },
  methods: {
    sync() {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      const section = page && page.route.split('/')[1]
      this.setData({
        selected: tabs.some((t) => t.page === section) ? section : 'record',
      })
    },
    open(event) {
      const page = event.currentTarget.dataset.page
      wx.switchTab({ url: '/pages/' + page + '/index' })
    },
  },
})
