class SceneElement {
  constructor(tag, changed) {
    this.tagName = tag
    this.changed = changed
    this.parentElement = null
    this.children = []
    this.listeners = new Map()
    this.captures = new Set()
    this.style = {}
    this.attributes = {}
    this._className = ''
    this._textContent = ''
    this._disabled = false
    this.hidden = false
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.classes(), ...names])].join(' ') },
      remove: (...names) => { this.className = this.classes().filter((name) => !names.includes(name)).join(' ') },
      contains: (name) => this.classes().includes(name),
    }
  }

  classes() { return this._className.split(' ').filter(Boolean) }
  get className() { return this._className }
  set className(value) { this.assign('_className', value) }
  get textContent() { return this._textContent }
  set textContent(value) { this.assign('_textContent', String(value)) }
  get disabled() { return this._disabled }
  set disabled(value) { this.assign('_disabled', Boolean(value)) }

  assign(key, value) {
    if (this[key] === value) return
    this[key] = value
    this.changed()
  }

  setAttribute(name, value) { this.attributes[name] = value }

  append(...elements) {
    for (const element of elements) {
      if (element.parentElement) {
        const previous = element.parentElement.children
        previous.splice(previous.indexOf(element), 1)
      }
      this.children.push(element)
      element.parentElement = this
    }
    this.changed()
  }

  before(element) {
    const parent = this.parentElement
    if (!parent) return
    parent.children.splice(parent.children.indexOf(this), 0, element)
    element.parentElement = parent
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(listener)
  }

  dispatch(type, event = {}) {
    const input = { type, preventDefault() {}, stopPropagation() {}, ...event }
    for (const listener of this.listeners.get(type) || []) listener(input)
  }

  hasPointerCapture(id) { return this.captures.has(id) }
  setPointerCapture(id) { this.captures.add(id) }
  releasePointerCapture(id) { this.captures.delete(id) }
}

function addRoundRect(context) {
  if (context.roundRect) return context
  context.roundRect = (left, top, width, height, radius) => {
    const right = left + width
    const bottom = top + height
    const r = Math.min(radius, width / 2, height / 2)
    context.moveTo(left + r, top)
    context.lineTo(right - r, top)
    context.quadraticCurveTo(right, top, right, top + r)
    context.lineTo(right, bottom - r)
    context.quadraticCurveTo(right, bottom, right - r, bottom)
    context.lineTo(left + r, bottom)
    context.quadraticCurveTo(left, bottom, left, bottom - r)
    context.lineTo(left, top + r)
    context.quadraticCurveTo(left, top, left + r, top)
    context.closePath()
  }
  return context
}

class SceneCanvas extends SceneElement {
  constructor(platform) {
    super('canvas', platform.changed)
    this.platform = platform
    this._width = 300
    this._height = 150
    this.node = null
    this.context = null
  }

  get width() { return this.node ? this.node.width : this._width }
  set width(value) { this._width = value; if (this.node) this.node.width = value }
  get height() { return this.node ? this.node.height : this._height }
  set height(value) { this._height = value; if (this.node) this.node.height = value }

  getContext(type, options) {
    if (this.context) return this.context
    this.node = this.platform.canvasNode(this, type)
    if (!this.node) throw new Error(`Missing ${type} canvas`)
    const raw = this.node.getContext(type, options)
    if (!raw) throw new Error(`Cannot create ${type} context`)
    this.context = type === '2d' ? addRoundRect(raw) : webglBridge(raw)
    return this.context
  }
}

function canvasPixels(canvas, flip) {
  const { width, height } = canvas
  const pixels = canvas.context.getImageData(0, 0, width, height).data
  const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  if (!flip) return bytes

  const flipped = new Uint8Array(bytes.byteLength)
  const stride = width * 4
  for (let y = 0; y < height; y += 1) {
    flipped.set(bytes.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride)
  }
  return flipped
}

function webglBridge(native) {
  let flip = false
  const methods = new Map()
  const textureBridge = {
    pixelStorei(key, value) {
      if (key === native.UNPACK_FLIP_Y_WEBGL) flip = Boolean(value)
      else native.pixelStorei(key, value)
    },
    texImage2D(...args) {
      const source = args[5]
      if (args.length === 6 && source instanceof SceneCanvas) {
        const [target, level, internal, format, type] = args
        const data = canvasPixels(source, flip)
        native.texImage2D(target, level, internal, source.width, source.height, 0, format, type, data)
      } else {
        native.pixelStorei(native.UNPACK_FLIP_Y_WEBGL, flip)
        native.texImage2D(...args)
        native.pixelStorei(native.UNPACK_FLIP_Y_WEBGL, false)
      }
    },
  }
  return new Proxy(native, {
    get(target, key) {
      if (Object.prototype.hasOwnProperty.call(textureBridge, key)) return textureBridge[key]
      const value = target[key]
      if (typeof value !== 'function') return value
      if (!methods.has(key)) methods.set(key, value.bind(target))
      return methods.get(key)
    },
  })
}

function makePlatform({ nodes, rect, viewport, createOffscreen, changed, failed, reducedMotion = false }) {
  let active = true
  let inline2D = 0
  const observers = new Set()
  const stage = new SceneElement('stage', changed)
  const body = new SceneElement('body', changed)
  const window = new SceneElement('window', changed)
  const frames = nodes.shadow
  const start = Date.now()
  const supportedRAF = typeof frames.requestAnimationFrame === 'function'
  const timers = new Set()
  const performance = { now: () => Date.now() - start }
  let dimensions = rect

  stage.getBoundingClientRect = () => dimensions
  body.append(stage)
  window.devicePixelRatio = viewport.pixelRatio || 1
  window.innerWidth = viewport.windowWidth
  window.innerHeight = viewport.windowHeight
  window.matchMedia = () => ({ matches: reducedMotion })

  const platform = {
    window,
    stage,
    body,
    changed,
    performance,
    matchMedia: window.matchMedia,
    location: { reload: () => failed('3D 场景已失去图形上下文，请重新进入玩法') },
    devicePixelRatio: window.devicePixelRatio,
    Image: function Image() { return nodes.shadow.createImage() },
    canvasNode(element, type) {
      if (type === 'webgl') return nodes.gl
      if (element.parentElement === stage) {
        inline2D += 1
        return inline2D === 1 ? nodes.shadow : nodes.effects
      }
      return createOffscreen({ type: '2d', width: element._width, height: element._height })
    },
    ResizeObserver: class ResizeObserver {
      constructor(callback) { this.callback = callback }
      observe() { observers.add(this.callback) }
      disconnect() { observers.delete(this.callback) }
    },
    setTimeout(action, delay) {
      if (!active) return null
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (active) action()
      }, delay)
      timers.add(timer)
      return timer
    },
    clearTimeout(timer) {
      timers.delete(timer)
      clearTimeout(timer)
    },
    requestAnimationFrame(action) {
      if (!active) return null
      if (!supportedRAF) return platform.setTimeout(() => action(performance.now()), 16)
      return frames.requestAnimationFrame(() => { if (active) action(performance.now()) })
    },
    cancelAnimationFrame(handle) {
      if (supportedRAF) frames.cancelAnimationFrame(handle)
      else platform.clearTimeout(handle)
    },
    resize(nextRect, nextViewport) {
      const resized = nextRect.width !== dimensions.width || nextRect.height !== dimensions.height ||
        nextViewport.windowWidth !== window.innerWidth || nextViewport.windowHeight !== window.innerHeight
      const moved = nextRect.left !== dimensions.left || nextRect.top !== dimensions.top
      dimensions = nextRect
      window.innerWidth = nextViewport.windowWidth
      window.innerHeight = nextViewport.windowHeight
      if (resized) for (const observer of observers) observer()
      else if (moved) window.dispatch('scroll')
    },
    dispose() {
      active = false
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      observers.clear()
    },
  }

  platform.document = {
    body,
    createElement: (tag) => tag === 'canvas' ? new SceneCanvas(platform) : new SceneElement(tag, changed),
  }
  return platform
}

module.exports = { makePlatform }
