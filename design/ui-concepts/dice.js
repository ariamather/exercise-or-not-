// 各方案共用：渲染骰子点数，点击 [data-roll] 掷骰。
// 结果写入 [data-num] / [data-verdict]，休息时给 body 加 .rest 类，样式各自处理。
(function () {
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const WIN = [4, 5, 6];

  function render(die, n) {
    die.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('span');
      if (PIPS[n].includes(i)) s.className = 'pip';
      die.appendChild(s);
    }
  }

  function apply(n) {
    const go = WIN.includes(n);
    document.body.classList.toggle('rest', !go);
    document.querySelectorAll('[data-num]').forEach(e => (e.textContent = n));
    document.querySelectorAll('[data-verdict]').forEach(e => (e.textContent = go ? (e.dataset.go || '练') : (e.dataset.rest || '休息')));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const dies = document.querySelectorAll('[data-die]');
    dies.forEach(d => render(d, 5));
    apply(5);
    document.querySelectorAll('[data-roll]').forEach(btn =>
      btn.addEventListener('click', () => {
        const final = 1 + Math.floor(Math.random() * 6);
        dies.forEach(d => d.classList.add('rolling'));
        let t = 0;
        const iv = setInterval(() => {
          dies.forEach(d => render(d, 1 + Math.floor(Math.random() * 6)));
          if (++t > 8) {
            clearInterval(iv);
            dies.forEach(d => { render(d, final); d.classList.remove('rolling'); });
            apply(final);
          }
        }, 80);
      })
    );
  });
})();
