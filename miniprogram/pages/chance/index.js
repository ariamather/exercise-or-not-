const { games, resolveSetup, nearestStop, revolverConfigForStop } = require('../../lib/chance-model')
const { readChance, todayResult, updateGame, updateStop, roll } = require('../../lib/chance-store')
const { mountScene } = require('../../lib/chance-engine/index')
const { selectTab } = require('../../lib/tab-selection')

const gameOptions = games.map(({ id, name }) => ({ id, name }))
const pageViewport = () => typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
const overlayGames = ['dice', 'cup', 'lots']

function probabilityView(game, stop, sliderValue = Math.round(stop.chance * 1000)) {
  return {
    probability: stop.percent,
    rule: stop.rule,
    sliderValue,
    stops: game.model.stops.map((candidate) => ({ key: candidate.key, position: 100 * candidate.chance })),
    revolver: game.id === 'revolver' ? revolverConfigForStop(stop.key) : null,
  }
}

Page({
  data: {
    gameOptions,
    gameId: 'dice',
    gameName: '骰子',
    probability: 50,
    rule: '掷出 4、5、6 就练',
    panel: '',
    sheetBodyHeight: 86,
    sheetOffset: 0,
    sheetDragging: false,
    drawing: false,
    result: null,
    surfaces: [],
    sceneReady: false,
    presentation: { action: '掷一下', status: '' },
    headerInset: 54,
    error: '',
  },

  onShow() {
    selectTab(this, 'chance')
    this.setTabBarModal(false)
    this.updateHeaderInset()
    this.visible = true
    this.restore()
    this.scheduleDateCheck()
  },

  onReady() {
    selectTab(this, 'chance')
    this.setTabBarModal(Boolean(this.data.panel))
  },

  onHide() {
    this.closeScene()
    this.sheetGesture = null
    this.setData({ panel: '', surfaces: [], sceneReady: false, sheetOffset: 0, sheetDragging: false })
  },

  onUnload() { this.closeScene() },

  onPageScroll() { this.resizeScene() },
  onResize() {
    this.updateHeaderInset()
    this.resizeScene()
    if (this.data.panel) this.measureSheet(this.data.panel)
  },

  updateHeaderInset() {
    if (typeof wx.getMenuButtonBoundingClientRect !== 'function') return
    const button = wx.getMenuButtonBoundingClientRect()
    const headerInset = button?.bottom ? button.bottom + 3 : 54
    if (headerInset !== this.data.headerInset) this.setData({ headerInset })
  },

  closeScene() {
    this.visible = false
    this.setTabBarModal(false)
    this.clearDraw()
    clearTimeout(this.dateTimer)
    this.disposeRenderer()
  },

  scheduleDateCheck() {
    clearTimeout(this.dateTimer)
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    this.dateTimer = setTimeout(() => {
      if (!this.visible) return
      this.restore()
      this.scheduleDateCheck()
    }, Math.max(1, midnight.getTime() - now.getTime()))
  },

  restore() {
    this.clearDraw()
    try {
      this.renderChance(readChance(wx))
      this.loadScene()
    } catch (error) {
      console.error('Cannot restore chance state', String(error), error.stack)
      this.setData({ drawing: false, error: '读取玩法失败，请重试' })
    }
  },

  renderChance(state) {
    this.chanceState = state
    const { game, stop } = resolveSetup(state)
    this.setup = { game, stop }
    this.setData({
      ...probabilityView(game, stop),
      gameId: game.id,
      gameName: game.name,
      drawing: Boolean(this.pending),
      result: this.pending ? null : todayResult(state),
      error: '',
    })
  },

  currentSceneState() {
    const { game, stop } = this.setup
    const answer = this.pending || todayResult(this.chanceState)
    const result = answer && answer.modelId === game.model.id ? answer : null
    return {
      outcomeId: result ? result.outcomeId : null,
      stopKey: result && result.stopKey || stop.key,
      drawing: Boolean(this.pending),
      hasResult: Boolean(answer),
      train: Boolean(answer && answer.train),
      pace: game.manual ? 'user' : 'timed',
    }
  },

  disposeRenderer() {
    clearTimeout(this.mountTimer)
    const previous = this.sceneRenderer
    this.sceneRenderer = null
    this.sceneRequest = null
    if (previous) previous.dispose()
  },

  loadScene() {
    this.disposeRenderer()
    const gameId = this.setup.game.id
    const generation = (this.generation || 0) + 1
    this.generation = generation
    const request = { gameId, generation }
    this.sceneRequest = request
    this.setData({
      surfaces: [{ gameId, generation, overlay: overlayGames.includes(gameId) }],
      sceneReady: false,
      presentation: { action: '准备场景…', status: '' },
    }, () => this.bindScene(request))
  },

  measureScene(callback) {
    const query = this.createSelectorQuery()
    query.select('.chance-stage').boundingClientRect()
    query.select('#chance-shadow').fields({ node: true })
    query.select('#chance-gl').fields({ node: true })
    query.select('#chance-effects').fields({ node: true })
    query.exec((values) => {
      if (!values) return callback(null)
      const [rect, shadow, gl, effects] = values
      if (!rect?.width || !shadow?.node || !gl?.node) return callback(null)
      callback({ rect, nodes: { shadow: shadow.node, gl: gl.node, effects: effects?.node } })
    })
  },

  bindScene(request, attempt = 0) {
    if (!this.visible || request !== this.sceneRequest) return
    this.measureScene((measured) => {
      if (!this.visible || request !== this.sceneRequest) return
      if (!measured) {
        if (attempt < 3) this.mountTimer = setTimeout(() => this.bindScene(request, attempt + 1), 60)
        else this.setData({ error: '无法初始化 3D 场景，请重试' })
        return
      }

      const { gameId } = request
      const renderer = mountScene({
        gameId,
        ...measured,
        viewport: pageViewport(),
        createOffscreen: (options) => wx.createOffscreenCanvas(options),
        getState: () => this.currentSceneState(),
        onDraw: () => this.startDraw(),
        onFault: (error) => this.onRenderFault(request, error),
        onPresentation: (presentation) => {
          if (request !== this.sceneRequest) return
          const encoded = JSON.stringify(presentation)
          if (request.presentation !== encoded) {
            request.presentation = encoded
            this.setData({ presentation })
          }
        },
        haptic: (kind) => {
          if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: kind === 'thud' ? 'medium' : 'light', fail() {} })
        },
      })
      this.sceneRenderer = renderer
      if (renderer.ready() && renderer.show(this.currentSceneState().outcomeId)) this.setData({ sceneReady: true })
    })
  },

  resizeScene() {
    const renderer = this.sceneRenderer
    if (!renderer || this.resizePending) return
    this.resizePending = true
    this.createSelectorQuery().select('.chance-stage').boundingClientRect((rect) => {
      this.resizePending = false
      if (renderer === this.sceneRenderer && rect?.width) renderer.resize(rect, pageViewport())
    }).exec()
  },

  onContextLost() { this.sceneRenderer?.contextLost() },

  onRenderFault(request, error) {
    if (request !== this.sceneRequest) return
    const pending = this.pending
    if (pending) this.finishDraw(pending, false)
    this.setData({ sceneReady: false, error })
  },

  retryScene() {
    if (this.setup) {
      this.setData({ error: '' })
      this.loadScene()
    } else this.restore()
  },

  onPrimary() {
    if (!this.pending) this.startDraw()
    else if (this.setup.game.id === 'revolver') this.sceneRenderer?.userAction()
    else if (this.setup.game.manual) this.finishDraw(this.pending, true)
  },

  startDraw() {
    const renderer = this.sceneRenderer
    if (this.pending || this.data.panel || !renderer?.ready()) return
    let state
    try {
      state = roll(wx)
    } catch (_) {
      this.setData({ error: '保存结果失败，请重试' })
      return
    }

    const pending = state.result
    this.pending = pending
    this.renderChance(state)
    renderer.reveal(pending.outcomeId).then((outcome) => {
      if (this.pending !== pending || this.sceneRenderer !== renderer) return
      this.finishDraw(pending, outcome !== pending.outcomeId)
      if (outcome !== pending.outcomeId) this.setData({ error: '动画未能完成，已显示抽取结果' })
    }).catch((error) => {
      if (this.pending !== pending || this.sceneRenderer !== renderer) return
      console.error('Original chance scene failed to finish', error)
      this.finishDraw(pending, true)
      this.setData({ error: '动画未能完成，已显示抽取结果' })
    })

    if (!this.setup.game.manual) this.drawTimer = setTimeout(() => {
      if (this.pending !== pending) return
      this.finishDraw(pending, true)
      this.setData({ error: '动画未能完成，已显示抽取结果' })
    }, 30000)
  },

  clearDraw() {
    clearTimeout(this.drawTimer)
    this.pending = null
  },

  finishDraw(pending, repaint) {
    if (!pending || this.pending !== pending) return
    this.clearDraw()
    this.renderChance(this.chanceState)
    if (repaint) this.sceneRenderer?.show(pending.outcomeId)
    else this.sceneRenderer?.update()
  },

  skipDraw() { this.finishDraw(this.pending, true) },
  spinChamber() { this.sceneRenderer?.spin() },
  onStageTap() { if (!this.data.panel) this.sceneRenderer?.tap() },
  onTouchStart(event) { this.stagePointer('pointerdown', event) },
  onTouchMove(event) { this.stagePointer('pointermove', event) },
  onTouchEnd(event) { this.stagePointer('pointerup', event) },
  onTouchCancel(event) { this.stagePointer('pointercancel', event) },

  stagePointer(type, event) {
    if (!this.data.panel) this.sceneRenderer?.pointer(type, event.changedTouches[0] || event.touches[0])
  },

  openPanel(event) {
    if (this.pending || this.data.panel) return
    const panel = event.currentTarget.dataset.panel
    this.panelScrollTop = 0
    this.sheetGesture = null
    this.sheetOverflows = false
    this.setTabBarModal(true)
    const initialHeight = panel === 'games' ? 85 : this.data.revolver ? 258 : 130
    this.setData({
      panel,
      sheetBodyHeight: Math.min(initialHeight, this.sheetHeightLimit()),
      sheetOffset: 0,
      sheetDragging: false,
    }, () => this.measureSheet(panel))
  },

  setTabBarModal(modalOpen) {
    if (typeof this.getTabBar === 'function') this.getTabBar()?.setData({ modalOpen })
  },

  sheetHeightLimit() {
    const { safeArea, screenHeight, windowHeight } = pageViewport()
    const bottomInset = Math.max(0, (screenHeight || windowHeight) - (safeArea?.bottom || screenHeight || windowHeight))
    return Math.max(1, Math.floor(windowHeight - this.data.headerInset - bottomInset - 54))
  },

  measureSheet(panel) {
    if (panel !== this.data.panel) return
    this.createSelectorQuery().select('.chance-sheet-content').boundingClientRect((rect) => {
      if (!rect || panel !== this.data.panel) return
      const height = Math.ceil(rect.height)
      const sheetBodyHeight = Math.min(height, this.sheetHeightLimit())
      this.sheetOverflows = height > sheetBodyHeight
      if (sheetBodyHeight !== this.data.sheetBodyHeight) this.setData({ sheetBodyHeight })
    }).exec()
  },

  onSheetScroll(event) {
    this.panelScrollTop = Math.max(0, event.detail.scrollTop)
  },

  onSheetHandleStart(event) { this.startSheetGesture(event, true) },
  onSheetTouchStart(event) { this.startSheetGesture(event, false) },

  startSheetGesture(event, handle) {
    const point = event.touches[0]
    this.sheetGesture = point && event.touches.length === 1
      ? { x: point.clientX, y: point.clientY, atTop: this.panelScrollTop <= 1, handle }
      : null
  },

  onSheetTouchMove(event) {
    const gesture = this.sheetGesture
    const point = event.touches[0]
    if (!gesture || !point || event.touches.length !== 1) return
    const x = point.clientX - gesture.x
    const y = point.clientY - gesture.y
    if (!this.data.sheetDragging && (Math.abs(y) < 10 || Math.abs(y) < Math.abs(x) * 1.25)) return

    let sheetOffset = 0
    if (y > 0 && (gesture.handle || gesture.atTop)) sheetOffset = y
    if (y < 0 && (gesture.handle || !this.sheetOverflows)) sheetOffset = Math.max(-12, y * 0.16)
    if (sheetOffset !== this.data.sheetOffset) this.setData({ sheetOffset, sheetDragging: true })
  },

  onSheetTouchEnd() {
    if (this.data.sheetOffset >= 56) this.closePanel()
    else this.resetSheetGesture()
  },

  resetSheetGesture() {
    this.sheetGesture = null
    if (this.data.sheetDragging) this.setData({ sheetOffset: 0, sheetDragging: false })
  },

  closePanel() {
    this.sheetGesture = null
    const probability = this.setup ? probabilityView(this.setup.game, this.setup.stop) : {}
    this.setData({ panel: '', sheetOffset: 0, sheetDragging: false, ...probability })
    this.setTabBarModal(false)
  },

  holdBackdrop() {},

  chooseGame(event) {
    const id = event.currentTarget.dataset.game
    if (id === this.data.gameId) return this.closePanel()
    try {
      this.renderChance(updateGame(wx, id))
      this.closePanel()
      this.loadScene()
    } catch (_) {
      this.setData({ error: '保存玩法失败，请重试' })
    }
  },

  sliderStop(value) {
    const { game, stop } = this.setup
    return value === Math.round(stop.chance * 1000) ? stop : nearestStop(game.model.stops, value / 1000)
  },

  previewProbability(event) {
    if (!this.setup) return
    const value = Number(event.detail.value)
    this.setData(probabilityView(this.setup.game, this.sliderStop(value), value))
  },

  chooseProbability(event) {
    if (!this.setup) return
    this.saveStop(this.sliderStop(Number(event.detail.value)).key)
  },

  adjustRevolver(event) {
    const { field, delta } = event.currentTarget.dataset
    const { loaded, shots } = this.data.revolver
    const nextLoaded = field === 'loaded' ? loaded + Number(delta) : loaded
    const nextShots = field === 'shots' ? shots + Number(delta) : shots
    if (nextLoaded >= 0 && nextLoaded <= 6 && nextShots >= 1 && nextShots <= 6) {
      this.saveStop(`${nextLoaded}-${nextShots}-any`)
    }
  },

  saveStop(key) {
    if (!this.setup) return
    try {
      this.renderChance(updateStop(wx, key))
      this.sceneRenderer?.show(this.currentSceneState().outcomeId)
      if (this.data.panel) wx.nextTick(() => this.measureSheet(this.data.panel))
    } catch (_) {
      this.setData({ ...probabilityView(this.setup.game, this.setup.stop), error: '保存概率失败，请重试' })
    }
  },

  goToRecord() {
    wx.switchTab({ url: '/pages/record/index', fail: () => this.setData({ error: '无法打开记录页，请重试' }) })
  },
})
