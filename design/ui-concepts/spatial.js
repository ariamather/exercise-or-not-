(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const pages={dice:$('dice-page'),record:$('record-page'),stats:$('stats-page')};
  let activePage='dice',busy=false,result=null,scene=null;
  let faces=[4,5,6];
  try{const saved=JSON.parse(localStorage.getItem('eon-spatial-faces'));if(Array.isArray(saved)&&saved.every(n=>Number.isInteger(n)&&n>=1&&n<=6))faces=[...new Set(saved)].sort();}catch{}
  const selected=new Set(faces),dialog=$('probability-dialog');
  function navigate(page){
    activePage=page;
    Object.entries(pages).forEach(([key,el])=>{el.hidden=key!==page;});
    $('settings-open').hidden=page!=='dice';
    if(page!=='dice'&&dialog.open)dialog.close();
    Object.keys(pages).forEach(key=>{
      const button=$('nav-'+key),active=key===page;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    scene?.setVisible(page==='dice');
  }
  Object.keys(pages).forEach(page=>{$('nav-'+page).onclick=()=>navigate(page);});
  $('record-shortcut').onclick=()=>navigate('record');
  document.querySelector('.brand').onclick=e=>{e.preventDefault();navigate('dice');};
  $('today-label').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  function refreshProbability(){const percentage=Math.round(selected.size/6*100)+'%';$('settings-percent').textContent=percentage;document.querySelectorAll('.face-option').forEach(el=>el.setAttribute('aria-pressed',String(selected.has(Number(el.dataset.face)))));}
  for(let n=1;n<=6;n++){const button=document.createElement('button');button.className='face-option';button.textContent=n;button.dataset.face=n;button.setAttribute('aria-label',n+' 点代表训练');button.onclick=()=>{if(selected.has(n))selected.delete(n);else selected.add(n);refreshProbability();try{localStorage.setItem('eon-spatial-faces',JSON.stringify([...selected]));}catch{}};$('face-options').append(button);}
  refreshProbability();
  function openSettings(){if(!busy&&activePage==='dice')dialog.showModal();}
  $('settings-open').onclick=openSettings;$('settings-close').onclick=() =>dialog.close();$('settings-done').onclick=()=>dialog.close();
  for(const modal of document.querySelectorAll('dialog'))modal.addEventListener('click',event=>{if(event.target!==modal)return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();});
  // Rejection sampling keeps the six outcomes equally likely; animation randomness is separate.
  function randomFace(){const a=new Uint32Array(1);do{crypto.getRandomValues(a);}while(a[0]>=4294967292);return a[0]%6+1;}
  async function roll(){
    if(busy||!scene)return;busy=true;const requestedFace=randomFace();
    $('dice-stage').classList.add('rolling');$('roll-button').disabled=true;$('dice-stage').disabled=true;$('settings-open').disabled=true;$('roll-label').textContent='让它转一会儿';$('result').className='result';$('result-title').textContent='答案正在路上。';
    let face=null;
    try{face=await scene.roll(requestedFace);}catch(error){console.error(error);}
    finally{busy=false;$('dice-stage').classList.remove('rolling');$('roll-button').disabled=false;$('dice-stage').disabled=false;$('settings-open').disabled=false;}
    if(!face){$('result-title').textContent='再试一次吧。';$('roll-label').textContent='重新掷一下';return;}
    const train=selected.has(face);
    result={face,train};$('result').className='result is-result'+(train?'':' is-rest');$('result-title').textContent=train?'走吧，练一点。':'今天，歇一歇。';$('dice-stage').setAttribute('aria-label',`骰子朝上 ${face} 点，点击再掷一次`);$('roll-label').textContent='再掷一次';$('record-shortcut').textContent=train?'去记录今天的训练 ↗':'想练也可以，直接记录 ↗';
  }
  try{scene=new EonDice.DiceScene($('dice-canvas'),$('dice-shadow'));$('dice-stage').disabled=false;$('roll-button').disabled=false;}catch(error){$('result-title').textContent='立体骰子暂时没能加载';console.error(error);}
  $('roll-button').onclick=roll;$('dice-stage').onclick=roll;
  const workoutCards=new Map();
  const exerciseList=$('exercise-list');
  let activeExerciseIndex=0,exerciseSwipe=null,exercisePageAnimation=null;
  function showExercise(index,{animate=false}={}){
    const cards=[...exerciseList.children];if(!cards.length)return;
    const previous=activeExerciseIndex;
    activeExerciseIndex=Math.max(0,Math.min(cards.length-1,index));
    exercisePageAnimation?.cancel();
    cards.forEach((card,i)=>{
      card.hidden=i!==activeExerciseIndex;card.style.transform='';
      card.setAttribute('aria-label',`${card.querySelector('[data-name]').textContent}，第 ${i+1} 个动作，共 ${cards.length} 个`);
    });
    const active=cards[activeExerciseIndex];
    $('exercise-position').textContent=`${activeExerciseIndex+1} / ${cards.length}`;
    $('exercise-prev').disabled=activeExerciseIndex===0;
    $('exercise-next').disabled=activeExerciseIndex===cards.length-1;
    if(previous!==activeExerciseIndex){
      $('record-status').textContent=`已切换到${active.querySelector('[data-name]').textContent}`;
      if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        const direction=activeExerciseIndex>previous?1:-1;
        exercisePageAnimation=active.animate([{transform:`translateX(${direction*100}%)`},{transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.7,.3,1)'});
      }
    }
  }
  $('exercise-prev').onclick=()=>showExercise(activeExerciseIndex-1,{animate:true});
  $('exercise-next').onclick=()=>showExercise(activeExerciseIndex+1,{animate:true});
  function resetExerciseSwipe(){
    if(!exerciseSwipe)return;
    const swipe=exerciseSwipe;exerciseSwipe=null;
    exerciseList.classList.remove('is-dragging');swipe.card.style.transform='';
    if(exerciseList.hasPointerCapture(swipe.id))exerciseList.releasePointerCapture(swipe.id);
  }
  exerciseList.addEventListener('pointerdown',event=>{
    // Number sliders own their horizontal gestures; buttons keep normal taps.
    if(!event.isPrimary||event.button!==0||exerciseList.children.length<2)return;
    if(event.target.closest('button,input,select,textarea,a,label,[contenteditable]'))return;
    exercisePageAnimation?.cancel();
    exerciseSwipe={id:event.pointerId,x:event.clientX,y:event.clientY,started:performance.now(),dx:0,horizontal:false,card:exerciseList.children[activeExerciseIndex]};
  });
  exerciseList.addEventListener('pointermove',event=>{
    const swipe=exerciseSwipe;if(!swipe||swipe.id!==event.pointerId)return;
    const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
    if(!swipe.horizontal){
      if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;
      if(Math.abs(dy)>Math.abs(dx)){resetExerciseSwipe();return;}
      swipe.horizontal=true;exerciseList.setPointerCapture(event.pointerId);exerciseList.classList.add('is-dragging');
    }
    event.preventDefault();swipe.dx=dx;
    const atEdge=(dx>0&&activeExerciseIndex===0)||(dx<0&&activeExerciseIndex===exerciseList.children.length-1);
    const offset=Math.max(-exerciseList.clientWidth,Math.min(exerciseList.clientWidth,dx*(atEdge ? .15 : 1)));
    swipe.card.style.transform=`translateX(${offset}px)`;
  });
  exerciseList.addEventListener('pointerup',event=>{
    const swipe=exerciseSwipe;if(!swipe||swipe.id!==event.pointerId)return;
    const distance=Math.abs(swipe.dx),elapsed=Math.max(1,performance.now()-swipe.started);
    const complete=swipe.horizontal&&(distance>Math.min(70,exerciseList.clientWidth*.2)||(distance>24&&distance/elapsed>.5));
    const index=activeExerciseIndex+(swipe.dx<0?1:-1);
    resetExerciseSwipe();if(complete)showExercise(index,{animate:true});
  });
  exerciseList.addEventListener('pointercancel',resetExerciseSwipe);
  exerciseList.addEventListener('lostpointercapture',resetExerciseSwipe);
  window.addEventListener('blur',resetExerciseSwipe);
  const exerciseOptions={
    '杠铃卧推':{mode:'总重',weight:40,reps:10,step:2.5,previous:[[37.5,10],[37.5,8],[37.5,8]],logged:[[40,10],[40,10]]},
    '深蹲':{mode:'总重',weight:60,reps:8,step:2.5,previous:[[60,8],[60,8],[60,8]],logged:[]},
    '哑铃肩推':{mode:'单只',weight:12,reps:10,step:1,previous:[[12,10],[12,8]],logged:[]},
  };
  const setText=set=>set ? `${set[0]} × ${set[1]}` : '—';
  function updateSetCount(){let total=0;workoutCards.forEach(state=>{total+=state.logged.length;});$('set-count').textContent=total;}
  function addWorkoutCard(name){
    if(workoutCards.has(name))return;
    const preset=exerciseOptions[name];
    const state={...preset,logged:preset.logged.map(set=>set.slice())};
    workoutCards.set(name,state);
    const card=$('exercise-card-template').content.firstElementChild.cloneNode(true);
    card.hidden=true;card.setAttribute('role','group');card.setAttribute('aria-roledescription','动作卡片');
    const find=selector=>card.querySelector(selector);
    const weightSlider=find('[data-weight-slider]'),repsSlider=find('[data-reps-slider]');
    const prefix='exercise-'+workoutCards.size;
    weightSlider.id=prefix+'-weight';repsSlider.id=prefix+'-reps';
    find('[data-weight-label]').htmlFor=weightSlider.id;find('[data-reps-label]').htmlFor=repsSlider.id;
    weightSlider.setAttribute('aria-label',name+'，本组重量');repsSlider.setAttribute('aria-label',name+'，本组次数');
    find('[data-name]').textContent=name;find('[data-mode]').textContent=state.mode;
    find('[data-weight-step]').value=String(state.step);
    find('[data-weight-step]').setAttribute('aria-label',name+'，重量加减幅度');
    function sliderFill(slider){const fraction=(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min));slider.style.setProperty('--range-fill',`${fraction*100}%`);}
    function centerWeightRange(){
      const min=Math.min(960,Math.max(0,Math.floor(state.weight/5)*5-20));
      weightSlider.min=min;weightSlider.max=min+40;
      find('[data-weight-min]').textContent=min;find('[data-weight-max]').textContent=min+40;
    }
    function refreshValues(){
      find('[data-weight-value]').textContent=state.weight;find('[data-reps-value]').textContent=state.reps;
      weightSlider.value=state.weight;weightSlider.setAttribute('aria-valuetext',state.weight+' 千克');
      repsSlider.max=Math.min(100,Math.max(Number(repsSlider.max),30,Math.ceil(state.reps/10)*10));repsSlider.value=state.reps;
      repsSlider.setAttribute('aria-valuetext',state.reps+' 次');find('[data-reps-max]').textContent=repsSlider.max;
      for(const metric of ['weight','reps']){
        const value=state[metric],min=metric==='weight'?0:1,max=metric==='weight'?1000:100;
        card.querySelectorAll(`[data-${metric}-delta]`).forEach(button=>{
          const direction=Number(button.dataset[metric+'Delta']);
          button.disabled=direction<0 ? value<=min : value>=max;
          button.setAttribute('aria-label',`${name}，${direction<0?'减少':'增加'}${metric==='weight'?state.step+' 千克':'1 次'}`);
        });
      }
      sliderFill(weightSlider);sliderFill(repsSlider);
    }
    function renderSets(){
      const logged=find('[data-logged]');logged.replaceChildren();
      state.logged.forEach((set,index)=>{
        const row=document.createElement('div');row.className='set-row';
        [String(index+1).padStart(2,'0'),setText(state.previous[index]),setText(set),'✓'].forEach((text,column)=>{
          const cell=document.createElement(column===2?'strong':'span');cell.textContent=text;
          if(column===3){cell.className='check';cell.setAttribute('aria-label','已完成');}
          row.append(cell);
        });
        logged.append(row);
      });
      find('.set-table').hidden=state.logged.length===0;
      find('[data-draft-label]').textContent=`第 ${state.logged.length+1} 组`;
      const previous=state.previous[state.logged.length];
      find('[data-previous]').textContent=previous?`上次 ${previous[0]} kg × ${previous[1]}`:'';
    }
    card.querySelectorAll('[data-weight-delta]').forEach(button=>button.onclick=()=>{
      state.weight=Math.max(0,Math.min(1000,Math.round((state.weight+Number(button.dataset.weightDelta)*state.step)*2)/2));
      centerWeightRange();refreshValues();
    });
    card.querySelectorAll('[data-reps-delta]').forEach(button=>button.onclick=()=>{
      state.reps=Math.max(1,Math.min(100,state.reps+Number(button.dataset.repsDelta)));refreshValues();
    });
    find('[data-weight-step]').onchange=event=>{state.step=Number(event.target.value);refreshValues();};
    weightSlider.oninput=()=>{state.weight=Number(weightSlider.value);refreshValues();};
    // Recenter after the drag ends, so the thumb never jumps under the finger.
    weightSlider.onchange=()=>{centerWeightRange();refreshValues();};
    repsSlider.oninput=()=>{state.reps=Number(repsSlider.value);refreshValues();};
    const confirm=find('[data-confirm]');confirm.setAttribute('aria-label',name+'，完成这一组');
    confirm.onclick=()=>{
      if(confirm.disabled)return;
      state.logged.push([state.weight,state.reps]);renderSets();updateSetCount();
      $('record-status').textContent=`${name}第 ${state.logged.length} 组已完成，${state.weight} 千克，${state.reps} 次`;
      confirm.disabled=true;confirm.textContent='✓ 已记录';
      setTimeout(()=>{confirm.disabled=false;confirm.textContent='✓ 完成这一组';},500);
    };
    centerWeightRange();refreshValues();renderSets();
    exerciseList.append(card);updateSetCount();showExercise(exerciseList.children.length-1,{animate:true});
  }
  addWorkoutCard('杠铃卧推');
  const exerciseDialog=$('exercise-dialog');$('add-exercise').onclick=()=>exerciseDialog.showModal();$('exercise-close').onclick=()=>exerciseDialog.close();
  document.querySelectorAll('[data-exercise]').forEach(button=>button.onclick=()=>{addWorkoutCard(button.dataset.exercise);button.disabled=true;exerciseDialog.close();});
})();
