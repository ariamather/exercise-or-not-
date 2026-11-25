const { formatAxis, lineGeometry } = require('../../lib/stats-view')
Component({
  properties: {
    sessions: Array,
    unit: String,
    active: Number,
    compact: Boolean,
    description: String,
  },
  observers: {
    'sessions, unit, active, compact'() {
      if (this.canvas) this.draw()
    },
  },
  lifetimes: {
    ready() {
      this.measure()
    },
    detached() {
      this.canvas = null
    },
  },
  pageLifetimes: {
    resize() {
      this.measure()
    },
  },
  methods: {
    measure() {
      this.createSelectorQuery()
        .select('#plot')
        .fields({ node: true, size: true, rect: true })
        .exec((results) => {
          const r = results[0]
          if (!r || !r.node || !r.width || !r.height) return
          const dpr = wx.getWindowInfo().pixelRatio || 1
          this.canvas = r.node
          this.box = r
          r.node.width = Math.round(r.width * dpr)
          r.node.height = Math.round(r.height * dpr)
          this.ctx = r.node.getContext('2d')
          this.ctx.scale(dpr, dpr)
          this.draw()
        })
    },
    draw() {
      const { sessions, unit, active, compact } = this.data
      if (!sessions || sessions.length < 2 || !this.ctx) return
      const c = this.ctx,
        { width, height } = this.box
      const g = lineGeometry(sessions, unit, width, height, compact)
      this.geometry = g
      const end = g.points[g.points.length - 1]
      c.clearRect(0, 0, width, height)
      function path() {
        c.beginPath()
        g.points.forEach((p, i) =>
          i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y),
        )
      }
      function line(x, y, toX, toY, color) {
        c.beginPath()
        c.moveTo(x, y)
        c.lineTo(toX, toY)
        c.strokeStyle = color
        c.lineWidth = 1
        c.stroke()
      }
      function dot(p, r, color) {
        c.beginPath()
        c.arc(p.x, p.y, r, 0, Math.PI * 2)
        c.fillStyle = color
        c.fill()
      }
      if (!compact) {
        c.font = '10px sans-serif'
        c.textAlign = 'right'
        c.fillStyle = '#737d71'
        for (const t of g.ticks) {
          line(g.left, t.y, g.right, t.y, '#eceee6')
          c.fillText(formatAxis(t.value), g.left - 8, t.y + 3)
        }
        line(g.left, g.bottom, g.right, g.bottom, '#e3e5dc')
        c.textAlign = 'left'
        let lastRight = -Infinity
        g.dates.forEach((tick, index) => {
          const textWidth = c.measureText(tick.text).width
          const left = Math.min(index === 0 ? tick.x : tick.x - textWidth / 2, width - textWidth)
          if (left < lastRight + 6) return
          if (index > 0) line(tick.x, g.bottom, tick.x, g.bottom + 4, '#e3e5dc')
          c.fillText(tick.text, left, height - 3)
          lastRight = left + textWidth
        })
        path()
        c.lineTo(end.x, g.bottom)
        c.lineTo(g.points[0].x, g.bottom)
        c.closePath()
        c.fillStyle = 'rgba(54,91,67,.1)'
        c.fill()
      }
      path()
      c.strokeStyle = compact ? '#b7bdb0' : '#365b43'
      c.lineWidth = 2
      c.lineJoin = 'round'
      c.lineCap = 'round'
      c.stroke()
      if (!compact && g.points[active] && active !== g.points.length - 1) {
        const p = g.points[active]
        line(p.x, g.top - 6, p.x, g.bottom, '#a5ab9e')
        dot(p, 5, '#365b43')
        dot(p, 3, '#fbfcf7')
      }
      dot(end, compact ? 4.5 : 6.5, '#fbfcf7')
      dot(end, compact ? 3 : 4.5, '#365b43')
      if (!compact) {
        c.font = 'bold 11px sans-serif'
        c.fillStyle = '#28392f'
        const label = formatAxis(sessions[sessions.length - 1].value) + ' ' + unit
        const labelX = Math.max(g.left, end.x - c.measureText(label).width)
        c.fillText(
          label,
          labelX,
          Math.max(12, Math.min(end.y, g.points[g.points.length - 2].y) - 10),
        )
      }
    },
    pointAt(event) {
      if (this.data.compact || !this.geometry) return
      const point = event.touches[0]
      if (!point) return
      const x =
        typeof point.x === 'number' ? point.x : point.clientX - this.box.left
      const points = this.geometry.points
      let nearest = 0
      points.forEach((p, i) => {
        if (Math.abs(p.x - x) < Math.abs(points[nearest].x - x)) nearest = i
      })
      this.triggerEvent('select', { index: nearest })
    },
  },
})
