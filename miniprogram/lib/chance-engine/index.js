const { makePlatform } = require('./platform')
const original = require('./original/index')

const defaultLabels = {
  action: '开始', again: '再来一次', busy: '正在揭晓…', skip: '直接看结果',
  idle: '让运气先开个头。', waiting: '答案正在路上。', loadError: '无法加载动画，请重新打开这一页。',
}

function mountScene({ gameId, nodes, rect, viewport, createOffscreen, getState, onDraw,
  onPresentation, onFault, haptic, reducedMotion }) {
  let pendingControls = false
  let disposed = false
  let definition
  let scene
  let labels = defaultLabels
  let failure = ''
  const canReveal = () => !disposed && !failure
  const platform = makePlatform({ nodes, rect, viewport, createOffscreen, changed: queueControls,
    failed: fail, reducedMotion })
  const { stage, window, body } = platform

  function fail(message) {
    if (disposed || failure) return
    failure = message
    onFault(message)
    queueControls()
  }

  function queueControls() {
    if (pendingControls || disposed) return
    pendingControls = true
    Promise.resolve().then(() => {
      pendingControls = false
      if (!disposed) controls()
    })
  }

  function draw() {
    if (canReveal() && scene && !getState().drawing) onDraw()
  }

  function controls() {
    const state = getState()
    const { drawing, hasResult, pace, train, outcomeId } = state
    const step = drawing && scene && scene.primaryAction ? scene.primaryState() : null
    const skip = drawing && pace === 'user'
    const manual = drawing && Boolean(scene && scene.primaryAction)
    stage.disabled = Boolean(drawing && !skip && !manual || failure)

    const hintNode = stage.children.find((item) => /(?:hint|tip)$/.test(item.className))
    const track = stage.children.find((item) => item.classList.contains('revolver-track'))
    const cue = stage.children.find((item) => item.classList.contains('revolver-cue'))
    const spin = stage.parentElement.children.find((item) => item.classList.contains('revolver-spin'))
    const view = {
      action: manual ? (step && step.label || labels.busy) : skip ? labels.skip :
        drawing ? labels.busy : hasResult ? labels.again : labels.action,
      actionDisabled: Boolean(failure || manual && !(step && step.enabled) || drawing && !manual && !skip),
      skip: Boolean(manual && skip),
      skipText: labels.skip,
      status: drawing ? labels.waiting : hasResult ? (train ? '走吧，练一点。' : '今天，歇一歇。') : labels.idle,
      stageLabel: drawing ? labels.stageBusy : outcomeId && labels.stageResult ? labels.stageResult(outcomeId) : labels.stageIdle || '',
      hint: hintNode && (!stage.disabled || gameId === 'slot') ? hintNode.textContent : '',
      cue: cue ? cue.textContent : '',
      track: track ? track.children.map((cell, index) => ({ index, state: cell.className, text: cell.textContent })) : [],
      spinLabel: spin && !spin.disabled ? spin.textContent : '',
      error: failure,
    }
    onPresentation(view)
  }

  function show(outcome) {
    if (!canReveal()) return false
    try {
      scene.show(outcome)
      queueControls()
      return true
    } catch (error) {
      console.error(`Cannot show original ${gameId} scene`, String(error), error.stack)
      fail(labels.loadError)
      return false
    }
  }

  try {
    window.EonChance = { register(entry) { definition = entry } }
    for (const install of original[gameId]) install(platform)
    if (!definition || definition.api !== 1) throw new Error(`Missing Android scene for ${gameId}`)
    labels = { ...defaultLabels, ...definition.labels }
    scene = definition.create(stage, {
      draw, haptic, fail, refreshControls: queueControls,
      asset: (file) => `/assets/chance/${gameId}/${file}`,
      parts: (outcome) => String(outcome).split(','),
      stopKey: () => getState().stopKey,
      train: () => getState().train,
      pace: () => getState().pace,
    })
    if (!scene || !scene.show) throw new Error('Scene did not return controls')
    stage.addEventListener('click', () => { if (definition.tapToDraw !== false) draw() })
  } catch (error) {
    console.error(`Cannot mount original ${gameId} scene`, String(error), error.stack)
    fail(labels.loadError)
  }

  return {
    show,
    update: queueControls,
    ready: () => Boolean(scene && canReveal()),
    revealing: () => Boolean(scene && scene.revealing()),
    reveal(outcome) {
      if (!scene || !canReveal()) return Promise.resolve(null)
      queueControls()
      return Promise.resolve().then(() => canReveal() ? scene.reveal(outcome) : null)
    },
    userAction() {
      if (canReveal() && scene.primaryAction && scene.primaryState()?.enabled) scene.primaryAction()
    },
    spin() {
      const spin = stage.parentElement.children.find((item) => item.classList.contains('revolver-spin'))
      if (canReveal() && spin && !spin.disabled) spin.dispatch('click', { detail: 1 })
    },
    tap() {
      if (canReveal() && !stage.disabled) stage.dispatch('click', { detail: 1 })
    },
    pointer(type, touch) {
      if (!canReveal() || !touch) return
      stage.dispatch(type, {
        button: 0,
        pointerType: 'touch',
        pointerId: touch.identifier ?? 0,
        clientX: touch.clientX ?? touch.pageX,
        clientY: touch.clientY ?? touch.pageY,
        timeStamp: platform.performance.now(),
      })
    },
    contextLost() {
      const canvas = [...stage.children, ...body.children].find((item) => item.node === nodes.gl)
      if (canvas) canvas.dispatch('webglcontextlost')
      else fail(labels.loadError)
    },
    resize: platform.resize,
    dispose() {
      disposed = true
      try {
        if (scene && !failure) scene.show(null)
      } finally {
        platform.dispose()
      }
    },
  }
}

module.exports = { mountScene }
