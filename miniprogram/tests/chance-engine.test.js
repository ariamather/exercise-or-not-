const assert = require('node:assert/strict')
const { test } = require('node:test')
const { mountScene } = require('../lib/chance-engine/index')
const { findGame, stopByKey } = require('../lib/chance-model')

function graphics() {
  let draws = 0
  const textureUploads = []
  let lastProgram
  let modelMatrix
  const gl = new Proxy({
    getExtension: () => null,
    getProgramParameter: () => true,
    getShaderParameter: () => true,
    isContextLost: () => false,
    createProgram: () => { lastProgram = {}; return lastProgram },
    createTexture: () => ({}),
    createBuffer: () => ({}),
    createShader: () => ({}),
    getUniformLocation: (_program, name) => name,
    uniformMatrix4fv: (name, _transpose, matrix) => {
      if (name === 'uModel') modelMatrix = matrix
    },
    drawArrays: () => { draws += 1 },
    texImage2D: (...args) => {
      assert.equal(args.length, 9)
      assert.equal(args[8].length, args[3] * args[4] * 4)
      textureUploads.push([args[3], args[4]])
    },
  }, { get: (target, name) => target[name] || (/^[A-Z]/.test(name) ? name : () => {}) })
  function canvas({ width = 300, height = 150 } = {}) {
    const context = new Proxy({
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }, { get: (target, name) => target[name] || (name === 'roundRect' ? undefined : () => {}) })
    return { width, height, getContext: (type) => type === '2d' ? context : gl }
  }
  return { canvas, textureUploads, drawCount: () => draws, program: () => lastProgram, modelMatrix: () => modelMatrix }
}

function openScene(t, gameId, stopKey) {
  const model = findGame(gameId).model
  const stop = stopByKey(model, stopKey)
  const display = graphics()
  const state = { pace: 'timed', drawing: false, hasResult: false, train: false, stopKey }
  const presentations = []
  const errors = []
  let requests = 0
  const scene = mountScene({
    gameId,
    nodes: { shadow: display.canvas(), gl: display.canvas(), effects: display.canvas() },
    rect: { width: 370, height: 320, left: 0, top: 80 },
    viewport: { windowWidth: 370, windowHeight: 680, pixelRatio: 1 },
    createOffscreen: display.canvas,
    getState: () => state,
    onDraw: () => { requests += 1 },
    onPresentation: (value) => presentations.push(value),
    onFault: (error) => errors.push(error),
    haptic() {},
    reducedMotion: true,
  })
  t.after(() => scene.dispose())
  assert.equal(scene.ready(), true, errors.join(' '))
  assert.equal(scene.show(null), true)
  return {
    ...display, scene, state, presentations, requests: () => requests,
    reveal(outcomeId) {
      Object.assign(state, { outcomeId, train: model.trains(stop, outcomeId), drawing: true })
      return scene.reveal(outcomeId)
    },
  }
}

test('the original dice physics reveals all six saved faces through the scene adapter', async (t) => {
  let seed = 1729
  t.mock.method(Math, 'random', () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  })
  const { scene, state, reveal, drawCount, program, requests } = openScene(t, 'dice', '3/6')
  assert.ok(program())
  scene.tap()
  assert.equal(requests(), 1)
  for (let face = 1; face <= 6; face += 1) {
    assert.equal(await reveal(String(face)), String(face))
    state.drawing = false
  }
  assert.ok(drawCount() >= 7)
})

test('the dice scene can paint the saved face after its physical planner rejects', async (t) => {
  // The same sampled launch on every attempt cannot settle on the requested face.
  t.mock.method(Math, 'random', () => 0.5)
  const { scene, state, reveal, modelMatrix } = openScene(t, 'dice', '3/6')
  await assert.rejects(reveal('4'), /Could not prepare a settled throw/)
  assert.equal(scene.revealing(), false)
  assert.equal(scene.ready(), true)
  state.drawing = false
  assert.equal(scene.show('4'), true)
  // On the Android cube face 4 is local -X. Its dot product with world up is 1.
  assert.equal(-modelMatrix()[1], 1)
})

test('the original cup and bamboo scenes react to gestures without drawing a result', async (t) => {
  for (const [id, stop, outcome] of [['cup', '3/6', '5'], ['lots', '5/10', '8']]) {
    const { scene, presentations, reveal, requests } = openScene(t, id, stop)
    scene.pointer('pointerdown', { identifier: 1, clientX: 175, clientY: 230 })
    scene.pointer('pointermove', { identifier: 1, clientX: 255, clientY: 224 })
    scene.pointer('pointermove', { identifier: 1, clientX: 135, clientY: 240 })
    scene.pointer('pointerup', { identifier: 1, clientX: 135, clientY: 240 })
    await Promise.resolve()
    assert.match(presentations.at(-1).hint, /摇好了/)
    assert.equal(requests(), 0)
    assert.equal(await reveal(outcome), outcome)
  }
})

test('procedural Android textures upload for tickets, chambers, reel strips, and wheel dials', (t) => {
  for (const [id, stop, outcome] of [
    ['scratch', '5/10', '10'], ['revolver', '2-3-any', '14'],
    ['slot', '3-majority', '1,4,6'], ['wheel', '6/12', '30'],
  ]) {
    const { scene, state, textureUploads } = openScene(t, id, stop)
    state.train = true
    assert.equal(scene.show(outcome), true)
    assert.ok(textureUploads.length > 0, id)
  }
})

test('the Android wheel reads exactly the outcome and decision under its pointer', async (t) => {
  const { reveal } = openScene(t, 'wheel', '6/12')
  for (const outcome of ['1', '30', '31', '60']) assert.equal(await reveal(outcome), outcome)
})
