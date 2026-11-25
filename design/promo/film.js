/* Two deterministic timelines. All layout is in a 540 × 960 portrait viewport. */
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', {alpha: false});
const W = 540, H = 960, TAU = 2 * Math.PI;
const sans = '"PingFang SC","Helvetica Neue",sans-serif';
const serif = '"Songti SC","Songti TC",serif';
const latin = '"Helvetica Neue",Arial,sans-serif';
const mono = 'Menlo,monospace';
const book = 'Baskerville,Georgia,serif';
const ink = '#18241e', pine = '#193c2f', lime = '#dbfa65', milk = '#f5f2e8';
const paper = '#eee7d8', coffee = '#302c25', rust = '#a6432c';
const lengths = {draw:16.5, journal:22, decision:48, bedroom:48, theory:49.5};
const imgs = {};
const clamp = x => Math.max(0, Math.min(1, x));
const ramp = (t,a,b) => clamp((t-a)/(b-a));
const ease = x => 1-(1-clamp(x))**3;
const smooth = x => (1-Math.cos(Math.PI*clamp(x)))/2;
function group(fn) {ctx.save(); fn(); ctx.restore();}
function box(x,y,w,h,color,r=0) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
}
function line(x1,y1,x2,y2,c,width=1) {
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle=c;ctx.lineWidth=width;ctx.stroke();
}
function circle(x,y,r,c) {ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=c;ctx.fill();}
function type(s,x,y,size,color,weight=500,family=sans,align='left') {
  ctx.font=weight+' '+size+'px '+family; ctx.textAlign=align;ctx.textBaseline='alphabetic';
  ctx.fillStyle=color;ctx.fillText(s,x,y);
}
function label(s,x,y,c,size=12,align='left') {type(s,x,y,size,c,500,mono,align);}
function reveal(s,x,y,size,c,t,delay=0,weight=800,family=sans) {
  const p=ease((t-delay)/.46);if(!p)return;
  group(()=>{ctx.beginPath();ctx.rect(x-4,y-size*1.15,535,size*1.34);ctx.clip();
    type(s,x,y+(1-p)*size*1.25,size,c,weight,family);});
}
function plate(im,x,y,w,h,scale=1,ax=.5,ay=.5) {
  const k=Math.max(w/im.width,h/im.height)*scale;
  group(()=>{ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    ctx.drawImage(im,x+(w-im.width*k)*ax,y+(h-im.height*k)*ay,im.width*k,im.height*k);});
}
function imageFit(im,x,y,w,h) {
  const k=Math.min(w/im.width,h/im.height);
  ctx.drawImage(im,x+(w-im.width*k)/2,y+(h-im.height*k)/2,im.width*k,im.height*k);
}
const pipLayout = {
  1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],
  4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],
  6:[[-1,-1],[-1,0],[-1,1],[1,-1],[1,0],[1,1]]
};
function tile(n,x,y,s,fg,bg) {
  box(x,y,s,s,bg,s*.18);
  for(const [a,b] of pipLayout[n])circle(x+s*(.5+a*.235),y+s*(.5+b*.235),s*.084,fg);
}
function mast(color,tag) {
  tile(5,35,47,23,color===ink?lime:ink,color);
  type('练不练',65,67,18,color,700);
  label(tag,505,65,color,12,'right');
}
function makeGrain() {
  const a=document.createElement('canvas');a.width=a.height=170;
  const g=a.getContext('2d'), pix=g.createImageData(170,170);let seed=173;
  for(let i=0;i<pix.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const v=(seed>>>16)&255;pix.data[i]=pix.data[i+1]=pix.data[i+2]=v;pix.data[i+3]=36;}
  g.putImageData(pix,0,0);return ctx.createPattern(a,'repeat');
}
const grain=makeGrain();
function texture(opacity) {group(()=>{ctx.globalAlpha=opacity;ctx.fillStyle=grain;ctx.fillRect(0,0,W,H);});}
function page(n,total,t,c,soft) {
  line(36,886,504,886,soft,1);
  label(n.toString().padStart(2,'0')+' / '+total.toString().padStart(2,'0'),36,910,c,11);
  for(let i=0;i<total;i++)box(435+i*14,902,10,i===n-1?5:2,i===n-1?c:soft);
}
// Project each rounded face and each pip in its own plane. The front face is five.
const faces=[
 {normal:[0,0,1],u:[1,0,0],v:[0,1,0],n:5},
 {normal:[0,0,-1],u:[-1,0,0],v:[0,1,0],n:2},
 {normal:[1,0,0],u:[0,0,-1],v:[0,1,0],n:3},
 {normal:[-1,0,0],u:[0,0,1],v:[0,1,0],n:4},
 {normal:[0,1,0],u:[1,0,0],v:[0,0,-1],n:6},
 {normal:[0,-1,0],u:[1,0,0],v:[0,0,1],n:1}
];
function die(x,y,size,ax,ay,az) {
  const rotate=([a,b,c])=>{
    const d=a*Math.cos(ay)+c*Math.sin(ay),e=-a*Math.sin(ay)+c*Math.cos(ay);
    const f=b*Math.cos(ax)-e*Math.sin(ax),z=b*Math.sin(ax)+e*Math.cos(ax);
    return [d*Math.cos(az)-f*Math.sin(az),d*Math.sin(az)+f*Math.cos(az),z];
  };
  const visible=faces.map(face=>({face,n:rotate(face.normal)})).filter(({n})=>n[2]>.002).sort((a,b)=>a.n[2]-b.n[2]);
  const shape=(coords,color,outline=0)=>{
    ctx.beginPath();coords.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();
    ctx.fillStyle=color;ctx.fill();
    if(outline){ctx.lineJoin='round';ctx.strokeStyle=color;ctx.lineWidth=outline;ctx.stroke();}
  };
  for(const {face,n} of visible){
    const p=(u,v)=>{const vec=face.normal.map((s,i)=>s+u*face.u[i]+v*face.v[i]);
      const [a,b]=rotate(vec);return [x+a*size,y+b*size];};
    const lum=.68+.27*n[2]-.14*n[1]-.12*n[0];
    const col='rgb('+[226,247,151].map(k=>Math.min(255,Math.round(k*lum))).join(',')+')';
    const corners=[p(-.91,-.91),p(.91,-.91),p(.91,.91),p(-.91,.91)];
    shape(corners,col,size*.18);
    for(const [a,b] of pipLayout[face.n]) {
      const ring=[];for(let i=0;i<24;i++){let th=TAU*i/24;ring.push(p(a*.47+.145*Math.cos(th),b*.47+.145*Math.sin(th)));}
      shape(ring,'#243e2e');
    }
  }
}
function orbit(t,x=276,y=601) {
  group(()=>{ctx.translate(x,y);ctx.rotate(-.22);
    for(const [rx,ry] of [[248,91],[212,75],[279,108]]){
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,TAU);ctx.strokeStyle='#536d50';ctx.lineWidth=.8;ctx.stroke();
    }
    for(let i=0;i<54;i++){
      const a=i*TAU/54;line(254*Math.cos(a),95*Math.sin(a),(i%3?260:268)*Math.cos(a),(i%3?99:103)*Math.sin(a),'#83936b',1);
    }
    for(let i=0;i<2;i++){const a=t*.68+Math.PI*i;circle(248*Math.cos(a),91*Math.sin(a),3.5,lime);}
  });
}
function opening(t) {
  box(0,0,W,H,ink);mast(milk,'DAILY DRAW');
  type('今天，',32,238+5*(1-ease(t/.4)),84,milk,800);
  type('练不练？',28,355+11*(1-ease(t/.45)),109,lime,800);
  orbit(t,269,658);
  const flight=Math.sin(t*2.18);
  die(274+12*Math.sin(t*1.12),590-flight*28,92,-.48+t*.78,.3+t*1.7,-.22+.12*Math.sin(t));
  type('把纠结交给一颗骰子。',36,837,26,milk,550);
  page(1,5,t,milk,'#607263');texture(.45);
}
function probability(t) {
  box(0,0,W,H,lime);mast(ink,'DICE / RULE');
  reveal('练的概率，自己定。',34,202,42,ink,t+.2,0,750);
  const slider=smooth((t-.55)/.45),trainFaces=slider<.5?2:3;
  type(trainFaces===2?'33':'50',21,466,242,ink,800,latin);
  type('%',308,461,93,ink,750,latin);
  line(36,519,504,519,'#9eb446',3);
  const knob=36+468*(2+slider)/6;
  line(36,519,knob,519,ink,4);
  for(let i=0;i<7;i++)circle(36+i*78,519,2.6,ink);
  circle(knob,519,11,ink);circle(knob,519,3,lime);
  for(let i=0;i<6;i++){
    const a=ease((t-i*.035+.12)/.30),active=i>=6-trainFaces;
    group(()=>{ctx.globalAlpha=a;const x=37+i*79, y=584+(1-a)*18;
      tile(i+1,x,y,68,active?lime:'#72823d',active?ink:'#c0d95c');});
  }
  type(trainFaces===2?'掷出 5、6，就练。':'掷出 4、5、6，就练。',36,742,36,ink,750);
  type('其余点数，今天歇一歇。',38,798,23,pine,500);
  page(2,5,t,ink,'#899c44');texture(.44);
}
function result(t) {
  box(0,0,W,H,pine);mast(milk,'DICE / RESULT');
  reveal('五点！',32,263,98,lime,t+.13);
  const p=ease(t/.64),pulse=1-p;
  group(()=>{ctx.translate(270,525);
    for(let i=0;i<40;i++){const a=i*TAU/40;const s=151+(i%3)*7+22*pulse;
      line(s*Math.cos(a),s*Math.sin(a),(s+9+24*pulse)*Math.cos(a),(s+9+24*pulse)*Math.sin(a),'#88986b',1.2);}
  });
  die(270,516+Math.sin(t*2)*3,106+20*pulse,-.24+.88*pulse,-.37+3.5*pulse,-.15-.35*pulse);
  type('走吧，练一点。',32,808,58,milk,800);
  page(3,5,t,milk,'#738570');texture(.4);
}
const games=[['wheel','转盘','转一圈'],['lots','签筒','抽一签'],['scratch','刮刮乐','刮开看看']];
function gameCard(i,x,y) {
 const [key,name,verb]=games[i];
 group(()=>{ctx.translate(x,y);ctx.beginPath();ctx.roundRect(0,0,430,385,17);ctx.clip();box(0,0,430,385,'#f6f5f0');
   imageFit(imgs[key],8,2,414,290);
   box(0,298,430,87,'#e4e7d7');line(0,298,430,298,'#64715a');
   type(name,22,357,35,ink,750);type(verb,408,353,20,pine,500,sans,'right');
 });
}
function carousel(t) {
  box(0,0,W,H,'#c8d3ba');mast(ink,'GAME SELECT');
  type('今天想',33,228,71,ink,800);type('怎么玩？',30,323,84,ink,800);
  const slide=smooth((t-1.12)/.43)+smooth((t-2.57)/.43);
  for(let i=0;i<3;i++)gameCard(i,55+(i-slide)*448,373);
  type('七种玩法，挑一个开始。',36,841,28,ink,600);
  page(4,5,t,ink,'#8d9b84');texture(.25);
}
function drawEnd(t) {
  box(0,0,W,H,lime);mast(ink,'DAILY DRAW');
  const p=ease(t/.65);
  group(()=>{ctx.translate(272,355+18*(1-p));ctx.rotate(-.17+.5*(1-p));tile(5,-82,-82,164,lime,ink);});
  reveal('练不练',29,622,149,ink,t+.15);
  type('打开玩法，掷一次。',36,729,33,ink,600);
  page(5,5,t,ink,'#899c44');texture(.4);
}
function drawFilm(t){
  if(t<3.5)opening(t);
  else if(t<6.5)probability(t-3.5);
  else if(t<9)result(t-6.5);
  else if(t<13.5)carousel(t-9);
  else drawEnd(t-13.5);
}
function filmPhoto(t,close=false) {
  plate(imgs.gym,0,0,W,H,close?1.19+t*.008:1.01+t*.009,close?.66:.38,.55);
  const veil=ctx.createLinearGradient(0,0,0,H);
  veil.addColorStop(0,'rgba(20,19,15,.32)');veil.addColorStop(.5,'rgba(20,19,15,.04)');veil.addColorStop(1,'rgba(16,17,11,.67)');
  ctx.fillStyle=veil;ctx.fillRect(0,0,W,H);
}
function journalHead(n,desc,light=false) {
 const col=light?milk:coffee;
 tile(5,36,49,18,light?coffee:paper,col);
 type('练不练',61,65,16,col,650);
 line(36,81,504,81,light?'#b4ab91':'#938b77',.8);
 label(desc,504,64,col,12,'right');
}
function folio(n,light=false) {
 const col=light?'#e1dcc9':'#5c584b';
 line(36,873,504,873,light?'#ada58c':'#a59b85',.8);
 type('训练手记',36,901,15,col,500,serif);
 type('0'+n,504,904,23,col,500,book,'right');
}
function journalCover(t) {
  filmPhoto(t);journalHead(1,'TRAINING NOTES',true);
  label('NOV. 24  /  TUE.',37,160,'#e2d3ad',13);
  type('上次卧推，',32,286+3*(1-ease(t/.75)),64,milk,600,serif);
  type('做了几次？',32,374+7*(1-ease(t/.9)),68,milk,600,serif);
  type('周二傍晚，站在卧推架前。',37,817,23,milk,500,serif);
  folio(1,true);
}
function paperBg(){
 box(0,0,W,H,paper);
 const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#f8f3e8');g.addColorStop(.46,'#f0e9da');g.addColorStop(1,'#e5dcc8');
 ctx.fillStyle=g;ctx.fillRect(0,0,W,H);texture(.46);
}
function inkCircle(x,y,rx,ry,p) {
 if(p<=0)return;
 group(()=>{ctx.translate(x,y);ctx.rotate(-.08);ctx.beginPath();
 for(let j=0;j<=90*clamp(p);j++){const a=j/90*TAU*1.06-.45;
 const rad=1+Math.sin(a*3)*.024;
 const u=rx*Math.cos(a)*rad,v=ry*Math.sin(a)*rad;if(j)ctx.lineTo(u,v);else ctx.moveTo(u,v);}
 ctx.strokeStyle=rust;ctx.lineWidth=2;ctx.lineCap='round';ctx.stroke();});
}
function photoStrip(y,h,t) {
  group(()=>{ctx.beginPath();ctx.rect(36,y,468,h);ctx.clip();
    // A second close framing of the same plate, like a print from the cover negative.
    const im=imgs.gym;ctx.drawImage(im,0,im.height*.52,im.width,im.width*(h+17)/468,36,y-5-t*1.2,468,h+17);
  });
}
function oldPage(t) {
  paperBg();journalHead(2,'WORKOUT LOG');
  label('NOVEMBER  /  17',37,145,rust,14);
  type('翻到上周二。',32,238,63,coffee,600,serif);
  photoStrip(273,126,t);
  type('杠铃卧推',36,461,32,coffee,700,serif);
  type('总重量 × 次数',505,458,16,'#66624f',500,serif,'right');
  line(36,479,504,479,'#5f604e',1.2);
  const rows=[['01','40','8'],['02','40','8'],['03','42.5','6']];
  rows.forEach(([n,kg,reps],i)=>{
    const yy=543+i*86,p=ease((t-.08-i*.22)/.5);
    line(36,yy+18,504,yy+18,'#b8b09b',.8);
    group(()=>{ctx.globalAlpha=p;ctx.translate(0,(1-p)*9);
      label(n,39,yy-3,'#7a7664',14);type(kg,151,yy,45,coffee,500,book,'right');
      type('kg',161,yy-1,22,coffee,500,book);type('×',249,yy-4,23,'#777262',400,book);
      type(reps,353,yy,46,coffee,500,book,'right');type('次',368,yy-3,19,coffee,500,serif);
    });
  });
  inkCircle(341,701,39,28,ease((t-1.55)/.75));
  type('最后一组，42.5 公斤，6 次。',36,819,25,rust,600,serif);
  folio(2);
}
function recordPage(t) {
  paperBg();journalHead(3,'SET ENTRY');
  label('NOVEMBER  /  24',36,145,rust,14);
  type('同样的重量，',32,230,56,coffee,600,serif);
  type('今天多做了一次。',32,303,55,coffee,600,serif);
  const y=356+12*(1-ease(t/.65));group(()=>{ctx.translate(0,y);
    // Promotional detail of the mini program's record card, with illustrative values.
    group(()=>{ctx.shadowColor='rgba(69,58,37,.17)';ctx.shadowBlur=20;ctx.shadowOffsetY=8;
      box(37,0,466,392,'#fffdf7',19);});
    box(56,21,39,39,'#e9f0e5',9);
    group(()=>{ctx.translate(75.5,40.5);ctx.rotate(-.62);box(-13,-1.8,26,3.6,'#37684e',1);
      for(const x of [-8,5])box(x,-7,3.5,14,'#37684e',1);});
    type('当前动作 · 总重',108,32,12,'#577168',500);
    type('杠铃卧推',107,58,24,'#173f36',650);
    type('切换  ›',482,49,16,'#437363',500,sans,'right');
    box(55,83,430,89,'#f0f4ec',12);type('上次表现',68,109,17,'#244f41',650);
    type('11 月 17 日',472,108,13,'#577168',500,sans,'right');
    [['40 kg × 8 次',68,107],['40 kg × 8 次',184,107],['42.5 kg × 6 次',300,134]].forEach(([s,x,w])=>{
      box(x,121,w,33,'#d3dfce',7);box(x+1,122,w-2,31,'#fbfdf7',6);
      type(s,x+w/2,143,15,'#2d5a4a',500,sans,'center');
    });
    type('第 3 组',56,206,18,'#244f41',650);
    [[55,'总重量','42.5','kg'],[276,'次数',t<1.45?'6':'7','次']].forEach(([x,head,value,unit])=>{
      box(x,222,209,77,'#dce5d9',11);box(x+1,223,207,75,'#f9faf3',10);
      type(head,x+13,248,14,'#45655a');type(value,x+12,282,32,'#173f36',650);
      type(unit,x+192,281,16,'#577168',500,sans,'right');
    });
    box(55,316,430,54,'#215240',11);
    type('＋ 记录本组',270,351,21,'#fffdf7',650,sans,'center');
    inkCircle(301,273,18,18,ease((t-1.52)/.65));
    const tap=ramp(t,2.52,2.95);
    if(tap>0 && tap<1)group(()=>{ctx.globalAlpha=1-tap;ctx.beginPath();
      ctx.arc(384,344,4+29*tap,0,TAU);ctx.strokeStyle=milk;ctx.lineWidth=2;ctx.stroke();});
    const saved=ease((t-2.90)/.48);
    if(saved>0)group(()=>{
      ctx.beginPath();ctx.roundRect(37,0,466,392,19);ctx.clip();
      ctx.translate(0,(1-saved)*395);
      box(37,0,466,392,'#f7f7f0',19);
      type('今日已记录',57,52,26,'#173f36',680);
      type('3 组',481,50,17,'#456a5c',550,sans,'right');
      box(55,80,430,277,'#fffdf7',14);
      type('杠铃卧推',72,121,24,'#173f36',650);
      type('总重',180,119,14,'#577168');
      type('继续记录 ↑',468,117,15,'#437363',500,sans,'right');
      for(let i=0;i<3;i++){
        const yy=140+i*66;
        line(70,yy,470,yy,'#dce5d9',1);
        type('第 '+(i+1)+' 组',73,yy+42,17,'#45655a');
        type(i===2?'42.5 kg × 7 次':'40 kg × 8 次',462,yy+42,21,'#173f36',i===2?700:500,sans,'right');
      }
      inkCircle(391,308,82,23,ease((t-3.55)/.52));
    });
  });
  type('记录页示意 · 示例训练数据',39,803,17,'#746e5e',500,serif);folio(3);
}
function trendPage(t) {
  paperBg();journalHead(4,'TRAINING TREND');
  label('NOVEMBER  /  03 — 24',36,147,rust,13);
  type('四个周二，',32,238,59,coffee,600,serif);
  type('摊开来看。',32,315,59,coffee,600,serif);
  type('杠铃卧推',36,411,31,coffee,650,serif);
  type('每场最佳一组 · 公斤',502,408,16,'#665e4c',500,serif,'right');
  const baseline=692,points=[[105,37.5,'03'],[225,40,'10'],[345,42.5,'17'],[465,42.5,'24']];
  [35,37.5,40,42.5,45].forEach(v=>{const y=baseline-(v-35)*23;
    line(77,y,498,y,'#b7ae9a',.8);label(''+v,61,y+4,'#766e5e',12,'right');});
  const p=ease((t-.1)/1.65);
  const xy=points.map(([x,v])=>[x,baseline-(v-35)*23]);
  group(()=>{ctx.beginPath();ctx.rect(76,437,425*p,266);ctx.clip();
    ctx.beginPath();xy.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.lineTo(465,baseline);ctx.lineTo(105,baseline);ctx.closePath();
    const fill=ctx.createLinearGradient(0,500,0,baseline);fill.addColorStop(0,'rgba(151,83,48,.15)');fill.addColorStop(1,'rgba(151,83,48,0)');
    ctx.fillStyle=fill;ctx.fill();
    for(let i=1;i<xy.length;i++)line(...xy[i-1],...xy[i],rust,2.5);
    xy.forEach(([x,y])=>{circle(x,y,5,rust);circle(x,y,2.5,paper);});
  });
  points.forEach(([x,,d])=>label('11.'+d,x,722,'#5a5345',14,'center'));
  group(()=>{ctx.globalAlpha=ease((t-.92)/.55);type('6 次',345,495,20,rust,650,serif,'center');
    type('7 次',465,495,20,rust,650,serif,'center');});
  type('重量持平的两天，也有进步。',36,820,25,coffee,550,serif);
  folio(4);
}
function journalEnd(t){
 filmPhoto(t,true);journalHead(5,'TRAINING NOTES',true);
 type('练不练',29,304,112,milk,650,serif);
 type('记下这一组。',35,438,39,milk,550,serif);
 type('下次接着练。',35,495,39,milk,550,serif);
 folio(5,true);
}
const jScenes=[[0,journalCover],[4.4,oldPage],[9,recordPage],[14.1,trendPage],[18.5,journalEnd]];
function journalFilm(t) {
 let i=jScenes.findLastIndex(([start])=>t>=start);const [start,scene]=jScenes[i];
 if(i && t-start<.38){
   const [prevStart,prev]=jScenes[i-1];prev(t-prevStart);
   const p=smooth((t-start)/.38);
   group(()=>{ctx.beginPath();ctx.rect(0,0,W,H*p);ctx.clip();scene(t-start);});
   if(p>0 && p<1)box(0,H*p,W,2,'#c1b59e');
 }else scene(t-start);
}
function drawFrame(id,t) {
 ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
 ctx.globalAlpha=1;ctx.lineCap='butt';
 if(id==='theory')theoryFilm(t);else if(id==='bedroom')bedroomFilm(t);else if(id==='decision')decisionFilm(t);else if(id==='draw')drawFilm(t);else journalFilm(t);
}
window.ready=Promise.all(['wheel','lots','scratch','gym'].map(async name=>{
 const im=new Image();im.src='assets/'+name+'.jpg';await im.decode();imgs[name]=im;
})).then(async ()=>{
 window.drawFrame=drawFrame;window.lengths=lengths;
 const qs=new URLSearchParams(location.search), id=Object.hasOwn(lengths,qs.get('film'))?qs.get('film'):'draw';
 if(id==='theory')await loadTheoryAssets();
 if(qs.has('render')){drawFrame(id,0);return true;}
 const start=performance.now();
 function loop(now){drawFrame(id,((now-start)/1000)%lengths[id]);requestAnimationFrame(loop);}
 requestAnimationFrame(loop);return true;
});
