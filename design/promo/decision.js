// Original portrait film. Times are seconds, and the drawing units are half-resolution pixels.
const decisionColors = {night:'#10191b', white:'#f0e8d7', gold:'#eec481', grey:'#b2b6aa', rule:'#536362'};
const decisionFaces = new Map();
// Opposite faces total seven. The upper face settles on two for the exercise story.
const brassNumbers={1:2,2:1,3:3,4:4,5:6,6:5};
function decisionFace(n){
  if(decisionFaces.has(n))return decisionFaces.get(n);
  const s=320, tex=document.createElement('canvas');tex.width=tex.height=s;
  const g=tex.getContext('2d'),grad=g.createLinearGradient(0,0,s,s);
  grad.addColorStop(0,'#f3ddb1');grad.addColorStop(.52,'#c6a77b');grad.addColorStop(1,'#927858');
  g.fillStyle=grad;g.fillRect(0,0,s,s);
  let seed=n*99;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<2700;i++){g.fillStyle=i%2?'#66503536':'#fff4c634';
    const x=random()*s,y=random()*s;g.fillRect(x,y,random()*3+.5,.7);}
  for(const inset of [8,14]){g.strokeStyle=inset===8?'#795e43':'#ead0a4';g.lineWidth=1.8;
    g.beginPath();g.roundRect(inset,inset,s-inset*2,s-inset*2,14);g.stroke();}
  for(const [u,v] of pipLayout[n]){
    const x=s*(.5+u*.24),y=s*(.5+v*.24);
    g.beginPath();g.arc(x,y,22,0,Math.PI*2);g.fillStyle='#f8e0ad';g.fill();
    const pit=g.createRadialGradient(x+5,y+6,3,x,y,21);
    pit.addColorStop(0,'#43423a');pit.addColorStop(.68,'#242927');pit.addColorStop(1,'#0f1718');
    g.beginPath();g.arc(x,y-1,20,0,Math.PI*2);g.fillStyle=pit;g.fill();
  }
  decisionFaces.set(n,tex);return tex;
}
function brassDie(x,y,half,ax,ay,az){
 const spin=([a,b,c])=>{
   const d=a*Math.cos(ay)+c*Math.sin(ay),e=-a*Math.sin(ay)+c*Math.cos(ay);
   const f=b*Math.cos(ax)-e*Math.sin(ax),z=b*Math.sin(ax)+e*Math.cos(ax);
   return [d*Math.cos(az)-f*Math.sin(az),d*Math.sin(az)+f*Math.cos(az),z];
 };
 const visible=faces.map(f=>({f,n:spin(f.normal)})).filter(o=>o.n[2]>.001).sort((a,b)=>a.n[2]-b.n[2]);
 for(const {f,n} of visible)group(()=>{
   const u=spin(f.u),v=spin(f.v);
   ctx.transform(half*u[0],half*u[1],half*v[0],half*v[1],x+half*n[0],y+half*n[1]);
   ctx.drawImage(decisionFace(brassNumbers[f.n]),-1.004,-1.004,2.008,2.008);
   ctx.fillStyle='rgba(21,27,28,'+(.38*(1-n[2])+.1*(n[1]+1)/2)+')';ctx.fillRect(-1,-1,2,2);
 });
}
function etched(path,color,width=1.4,fill){
 const p=new Path2D(path);ctx.lineJoin='round';ctx.lineCap='round';
 if(fill){ctx.fillStyle=fill;ctx.fill(p);}
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(p);
}
function oval(x,y,rx,ry,color,width=1,dash=[]){
 group(()=>{ctx.setLineDash(dash);ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();});
}
function stageLight(t){
 const g=ctx.createRadialGradient(256,469,20,260,477,495);
 g.addColorStop(0,'#253233');g.addColorStop(.66,'#152023');g.addColorStop(1,'#0c1316');
 ctx.fillStyle=g;ctx.fillRect(0,0,W,H);texture(.25);
 for(let i=0;i<43;i++){
   const x=(i*191.3+3*t*(1+i%2))%540,y=108+((i*113.1+.8*t)%724);
   circle(x,y,i%5===0?.85:.54,'rgba(225,204,159,'+(.15+.1*Math.sin(i+t))+')');
 }
}
function filmHeading(chapter,heading,second){
 const {white,gold,grey,rule}=decisionColors;
 type('练不练',39,67,17,grey,650,serif);type('决策心理学',502,66,15,grey,500,serif,'right');
 line(39,84,501,84,rule,.6);
 type(chapter,41,141,16,gold,550,serif);
 type(heading,35,225,heading.length>8?44:56,white,650,serif);
 if(second)type(second,35,295,second.length>8?43:55,white,650,serif);
}
function caption(l1,l2,credit){
 const {white,grey,rule}=decisionColors;
 line(40,755,75,755,'#bfa376',1.4);
 type(l1,40,813,l1.length>17?23:27,white,550,serif);
 if(l2)type(l2,40,855,l2.length>17?23:27,white,550,serif);
 line(40,897,500,897,rule,.6);
 type(credit||'练不练  ·  骰子的另一种用法',40,920,13,grey,500,serif);
}
function dial(x,y,rx,ry,t){
 const color='#63726d';oval(x,y,rx,ry,color,.8);
 oval(x,y,rx+9,ry+4,'#4b5856',.65);
 for(let i=0;i<64;i++){
   const a=i/64*TAU,len=i%8===0?8:3;
   line(x+rx*Math.cos(a),y+ry*Math.sin(a),x+(rx+len)*Math.cos(a),y+(ry+len*.55)*Math.sin(a),'#899285',.72);
 }
 const a=t*.38;circle(x+rx*Math.cos(a),y+ry*Math.sin(a),2.8,'#ddbb81');
}
function shoeDrawing(x,y,k,progress){
 group(()=>{ctx.translate(x,y);ctx.scale(k,k);
   const hi='#e2cca6',dim='#958a75';
   etched('M-138 16 Q-143 -10 -127 -39 Q-116 -54 -106 -72 Q-102 -81 -96 -74 Q-78 -39 -51 -40 Q-34 -41 -17 -78 Q-11 -89 -3 -81 L35 -39 Q64 -14 114 1 Q136 7 137 23 Q138 39 116 43 L-114 47 Q-137 46 -138 32 Z',hi,2.1,'#283331');
   etched('M-140 25 Q-85 34 -37 29 Q13 21 61 24 Q106 28 137 18 M-136 37 Q-79 44 -33 38 Q8 30 64 32 Q107 36 134 28',hi,1.5);
   etched('M-122 -35 Q-89 -26 -81 19 M-109 -52 Q-70 -17 -38 -18 L-3 -51 M-69 20 L-18 -31 Q3 -53 21 -48 M-38 21 L8 -16 Q23 -29 51 -24 M72 -12 Q57 2 57 22',dim);
   for(let i=0;i<16;i++)line(-119+i*15,39-4*Math.sin(i/15*Math.PI),-116+i*15,44-4*Math.sin(i/15*Math.PI),'#8e8978',.8);
   for(let i=0;i<4;i++){
     const xx=-15+i*11,yy=-61+i*8;circle(xx,yy,3.3,hi);
     line(xx-15,yy+6,xx,yy,hi,2.4);
   }
   const loose=1-progress;
   etched('M-13 -60 Q-37 '+(-100-17*loose)+' -58 '+(-72-17*loose)+' Q-70 -60 -45 -57 Q-23 -56 -13 -60',hi,2);
   etched('M-13 -60 Q5 '+(-96-14*progress)+' 23 '+(-86-8*progress)+' Q38 -77 11 -65 Q-1 -60 -13 -60',hi,2);
   etched('M-13 -60 Q-32 -39 -42 -13 Q-49 7 -60 '+(8+16*loose),hi,1.9);
   for(let i=0;i<7;i++)line(-115+i*4,-14+i*2,-115+i*4,1+i*2,'#68746a',.7);
 });
}
function ruleFace(n,x,y,active){
 const c=active?'#d4ba8d':'#a7afa3';
 group(()=>{ctx.beginPath();ctx.roundRect(x-17,y-17,34,34,5);ctx.strokeStyle=c;ctx.lineWidth=1;ctx.stroke();
 for(const [a,b] of pipLayout[n])circle(x+a*8,y+b*8,2.4,c);});
}
function dish(x,y,t,kind){
 const hi='#c6bc9f',lo='#788780';
 oval(x,y,82,46,lo,1.4);oval(x,y,72,38,hi,1);oval(x,y,64,32,lo,.6);
 group(()=>{ctx.translate(x,y);
   if(kind==='A'){
     for(let i=0;i<6;i++)group(()=>{ctx.translate(-28+(i%3)*24,-10+Math.floor(i/3)*15);ctx.rotate(-.3+.25*(i%3));
       etched('M-10 0 Q-4 -11 8 -6 Q14 0 6 6 Q-2 9 -10 0Z',hi,1.2,'#32403a');});
   }else{
     for(let i=0;i<8;i++)etched('M-37 '+(-12+i*3.8)+' C-20 '+(-28+i*4)+' -12 '+(13+i*2)+' 1 '+(-6+i*3)+' S21 '+(-17+i*4)+' 35 '+(-4+i*3),hi,1.1);
   }
   for(let j=0;j<3;j++){const w=Math.sin(t+j)*3;etched('M'+(-18+j*17)+' -26 q'+(-7+w)+' -8 0 -15 q5 -7 0 -14','#889486',.8);}
 });
 type('菜品 '+kind,x,y+83,20,'#d9d4be',500,serif,'center');
}
function doorway(t){
 const hi='#e3c99e',grey='#829087';
 etched('M312 633 V335 L436 307 V634 M324 630 V345 L424 323 V630',grey,1.4);
 etched('M324 345 L381 369 V604 L324 630 Z',hi,1.5,'#25302e');
 circle(371,484,2.6,hi);
 line(55,635,466,635,grey,1);
 const step=t*6.5, progress=smooth(t/2.85);
 group(()=>{ctx.translate(150+167*progress,577-2*Math.abs(Math.sin(step)));
   const a=Math.sin(step),b=Math.cos(step);
   circle(9,-70,13,hi);circle(10,-71,10.6,'#243031');
   etched('M5 -56 Q-1 -42 -6 -19 L-4 0',hi,3.6);
   for(const sign of [-1,1]){
     const knee=sign*a*14+3,ankle=sign*a*26;
     const foot=53-Math.max(0,sign*b)*10;
     etched('M-4 0 L'+knee+' 25 L'+ankle+' '+foot+' l11 0',sign===1?hi:grey,3.2);
     etched('M3 -49 l'+(-sign*a*13)+' 18 l'+(10-sign*a*8)+' 9',sign===1?hi:grey,2.7);
   }
 });
}
function decisionFilm(t){
 const {gold,white,grey}=decisionColors;
 stageLight(t);
 if(t<5.6){
   filmHeading('关于犹豫的一次小实验','为什么还想','再掷一次？');
   dial(270,613,174,44,t);
   brassDie(270,487+5*Math.sin(t*.8),70,-.40+.09*Math.sin(t*.8),.63+t*.33,-.15+.04*Math.sin(t));
   caption('晚饭后，运动鞋已经摆在门口。','今天练，还是歇？');
 }else if(t<11.2){
   filmHeading('晚饭后  /  玄关','那就掷一次。');
   shoeDrawing(271,445+2*Math.sin(t),1.27,0);
   for(let i=0;i<6;i++)ruleFace(i+1,84+i*74,614,i>=3);
   type('今天歇',158,681,27,grey,500,serif,'center');type('今天练',380,681,27,gold,500,serif,'center');
   line(269,596,269,687,'#66746a',.8);
   caption('先说好。','一到三点休息，四到六点就练。');
 }else if(t<21.2){
   const flight=ramp(t,11.2,15.2),settle=ease((t-15.2)/.62);
   const alt=Math.sin(flight*Math.PI),bump=(1-settle)*Math.max(0,Math.sin((t-15.2)*15));
   const rotation=smooth(flight),x=232+38*rotation;
   filmHeading('第一次掷骰','',null);
   type(t<15.2?'骰子离开手心。':'两点。',35,237,t<15.2?51:70,white,650,serif);
   dial(270,626,158+22*alt,39+5*alt,t);
   brassDie(x,533-151*alt-17*bump,65+9*alt,-.85-TAU*(1-rotation),.42+TAU*(1-rotation),-.08-.72*(1-rotation));
   if(t>=15.2)type('今 天 休 息',270,697,26,gold,650,serif,'center');
   if(t<15.2)caption('在它落地以前，','两个答案都还算数。');
   else if(t<17.8)caption('好，今天可以歇了。','');
   else caption('可你盯着那两点，心里嘀咕。','“要不……再掷一次？”');
 }else if(t<29.6){
   const change=smooth((t-24.3)/1.1);
   filmHeading('心理学实验  /  2019','让骰子点一道菜。');
   type('87 位参与者  ·  模拟点餐',40,295,22,grey,500,serif);
   dish(150,535,t,'A');dish(389,535,t,'B');
   const dx=270+119*change,dy=402-29*change;
   brassDie(dx,dy,33,-.85,.42+(1-change)*1.2,-.08);
   if(change>.01)group(()=>{ctx.globalAlpha=change;line(389,419,389,451,gold,1.6);line(383,445,389,452,gold,1.6);line(389,452,395,445,gold,1.6);});
   if(t<24.8)caption('研究者请人从两道菜里选一道。','每次选择前，都掷骰子。');
   else caption('有时骰子指向其中一道，','有时不给建议。最后都由自己选。');
 }else if(t<37.6){
   filmHeading('实验结果  /  即时自评','我更想选哪个？');
   type('偏好感受的强度',40,305,28,white,600,serif);
   type('每轮选择后评分，1 分最弱，7 分最强。',40,351,19,grey,500,serif);
   const x0=65,x1=471;
   for(let i=1;i<=7;i++){const xx=x0+(i-1)/6*(x1-x0);
     line(xx,444,xx,635,'#43534f',.8);label(String(i),xx,659,grey,14,'center');}
   [[1.95,482,'无建议',grey],[2.65,594,'有建议',gold]].forEach(([v,y,name,c],i)=>{
     const p=ease((t-29.7-i*.48)/1.25),x=x0+(x1-x0)*(v-1)/6*p;
     type(name,63,y-20,19,c,550,serif);line(x0,y,x,y,c,3);circle(x,y,5,c);
     type(v.toFixed(2),x+12,y+8,27,c,550,book);
   });
   caption('骰子给出建议时，参与者平均更能','感觉到自己偏向哪一道菜。','Jaffé 等，PLOS ONE，2019  ·  研究 2');
 }else if(t<44.2){
   const p=smooth((t-38.6)/3.3);
   filmHeading('回到门口','“我还挺想练的。”');
   const leaving=smooth((t-40.7)/.55);
   group(()=>{ctx.globalAlpha=1-leaving;ctx.translate(p*15,-p*8);shoeDrawing(267,505,1.42,p);});
   group(()=>{ctx.globalAlpha=leaving;doorway(Math.max(0,t-40.8));});
   brassDie(108,673,19,-.85,.42,-.08);
   line(157,680,468,680,'#617068',.7);
   caption('你把两点留在桌上，','弯下腰，系好了鞋带。');
 }else{
   filmHeading('','练不练',null);
   dial(270,571,135,28,t);brassDie(270,474,48,-.33,.6+.09*Math.sin(t),-.13);
   type('轮到你了。',270,675,29,gold,600,serif,'center');
   caption('今天掷到“休息”，','你会松口气，还是想再掷一次？');
 }
 // Fade through the same ink on location changes; the landing itself stays continuous.
 for(const cut of [5.6,11.2,21.2,29.6,37.6,44.2]){
   const fade=1-Math.min(1,Math.abs(t-cut)/.28);
   if(fade>0)box(0,0,W,H,'rgba(13,20,21,'+(fade*.92)+')');
 }
}
