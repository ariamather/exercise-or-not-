/* One 3D die. The physics plans a throw that lands on the face Android already chose. */
EonChance.register({
  api: 1,
  libs: ['dice-physics.js', 'gl.js'],
  labels: {
    action: '掷一下', again: '再掷一次', busy: '正在掷…',
    idle: '让骰子先开个头。',
    stageIdle: '点击立体骰子，掷一下', stageBusy: '正在掷骰子',
    stageResult: face => '骰子 ' + face + ' 点，点击再掷一次',
    loadError: '无法加载立体骰子，请重新打开掷骰子页面。',
  },
  create(stage, host) {
    const shadow = document.createElement('canvas');
    const die = document.createElement('canvas');
    shadow.setAttribute('aria-hidden', 'true');
    die.setAttribute('aria-hidden', 'true');
    stage.append(shadow, die);
    const scene = new EonDice.DiceScene(die, shadow);
    die.addEventListener('webglcontextlost', () => host.fail('立体骰子已暂停，请重新打开掷骰子页面。'));

    function rest(face) {
      scene.cancel();
      scene.q = EonDice.faceRotation(face, -.3);
      scene.position[1] = EonDicePhysics.HALF;
      scene.air = 0;
      scene.draw();
    }

    return {
      reveal: outcome => scene.roll(Number(outcome)).then(face => (face == null ? null : String(face))),
      show: outcome => rest(Number(outcome) || 1),
      revealing: () => scene.rolling,
    };
  },
});
