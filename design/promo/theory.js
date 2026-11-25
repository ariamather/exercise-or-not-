const theoryCapture = {"frameCount": 92, "area": [34, 0, 501, 776], "screen": [544, 832], "framesPerSheet": 24, "cols": 6};
// A question-led essay. The product first appears at 34 seconds.
const essay = {ivory:'#f3e9d0', gold:'#e9b96d', pale:'#a5b9bc', line:'#526879'};
async function loadTheoryAssets(){
 const names=['theory-screen.jpg',...Array.from({length:Math.ceil(theoryCapture.frameCount/theoryCapture.framesPerSheet)},(_,i)=>'theory-roll-'+i+'.webp')];
 await Promise.all(names.map(async name=>{
   const image=new Image();image.src='assets/'+name;await image.decode();imgs[name]=image;
 }));
}
function essayGround(t){
 const bg=ctx.createRadialGradient(249,458,15,240,460,610);
 bg.addColorStop(0,'#2b3943');bg.addColorStop(.66,'#142330');bg.addColorStop(1,'#101b26');
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);texture(.3);
 for(let i=0;i<35;i++){
   const x=(73+i*113.1+t*(1+i%2))%W,y=157+(i*107.4+.7*t)%586;
   circle(x,y,i%4?.55:.9,'rgba(246,211,166,'+(.18+.11*Math.sin(i+t*.7))+')');
 }
}
function essayHeader(left,right){
 type(left,39,70,15,essay.pale,500,serif);type(right,502,70,13,essay.pale,500,serif,'right');
 line(39,84,501,84,essay.line,.8);
}
function essayTitle(first,second){
 const f=first.length>8?44:55;
 type(first,35,190,f,essay.ivory,640,serif);
 if(second)type(second,35,262,second.length>8?43:58,essay.ivory,640,serif);
}
function essaySub(a,b,source){
 line(39,758,72,758,essay.gold,1.5);
 const size=Math.min(27,Math.floor(460/Math.max(a.length,b.length,1)));
 type(a,39,811,size,essay.ivory,550,serif);
 if(b)type(b,39,853,size,essay.ivory,550,serif);
 if(source){line(39,889,501,889,essay.line,.7);type(source,39,914,13,essay.pale,450,sans);}
}
function printedTicket(t,x,y,scale,angle){
 group(()=>{ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
   group(()=>{ctx.shadowColor='#071322a6';ctx.shadowBlur=16;ctx.shadowOffsetY=11;
     box(-193,-91,386,182,'#dbba88',7);});
   box(-192,-90,384,180,shade(-190,-85,175,90,[[0,'#f1d5a6'],[.63,'#d2ae7e'],[1,'#b99469']]),6);
   for(let i=0;i<83;i++){
     const a=(i*97)%382-191,b=(i*71)%178-89;line(a,b,a+1.2,b+.3,'#75664240',.7);
   }
   ctx.strokeStyle='#775f44';ctx.lineWidth=1;ctx.strokeRect(-183,-81,367,162);
   type('周五的演出',-161,-46,20,'#3e4540',600,serif);
   type('19:30',-169,23,69,'#2c3939',500,book);
   line(-162,40,62,40,'#766e56',1);type('一层  ·  第七排',-161,67,15,'#414b43',500,serif);
   for(let k=0;k<22;k++){const a=TAU*k/22;
     line(132+22*Math.cos(a),-20+22*Math.sin(a),132+32*Math.cos(a),-20+32*Math.sin(a),'#6e6e52',1);}
   circle(132,-20,12,'#7e6440');circle(132,-20,9,'#d1b082');
   for(let j=0;j<27;j++){const px=99+j*2.4;line(px,39,px,63,'#475147',j%4===0?1.8:.7);}
   for(let yy=-82;yy<86;yy+=11)line(83,yy,83,yy+4,'#806d52',1);
   for(const yy of [-91,91])circle(83,yy,6,'#1e2e38');
 });
}
function velvetSeat(x,y,scale,accent=false){
 group(()=>{ctx.translate(x,y);ctx.scale(scale,scale);
   const edge=accent?'#eac588':'#788790',fill=accent?'#8b674a':'#344552';
   shape('M-23 0 L-25 -24 Q-23 -33 -15 -33 L14 -33 Q24 -33 24 -24 L21 0Z',fill,edge,1.2);
   shape('M-20 -1 Q0 4 21 -1 L24 4 Q23 8 17 8 H-18 Q-25 8 -23 3Z',fill,edge,1.2);
   line(-17,8,-18,17,edge,1.6);line(17,8,18,17,edge,1.6);
   line(-26,-10,-25,1,edge,2);line(26,-10,25,1,edge,2);
 });
}
function auditorium(t){
 group(()=>{ctx.beginPath();ctx.rect(29,290,482,421);ctx.clip();
   const beam=shade(270,309,228,618,[[0,'#e6c28b02'],[.7,'#e8c99027'],[1,'#e8c99005']]);
   shape('M294 292 L320 292 L220 611 L132 610Z',beam);
   for(let row=0;row<4;row++)for(let seat=0;seat<7;seat++){
     const k=.68+row*.152,x=270+(seat-3)*62*k+(row%2?17:-7),y=405+row*74;
     velvetSeat(x,y,k,row===2&&seat===2);
   }
   for(let i=0;i<19;i++)circle(180+(i*67)%130,320+(i*31+t*3)%236,i%3?.65:1,'#e9d6ac8a');
 });
}
function counterfactual(t){
 const left=t<17.6;
 type('明天',270,364,18,essay.pale,500,serif,'center');
 // Two imagined choices branch forward and both return to the present moment.
 const branches=[[130,'买了票','“早知道就省下了。”'],[410,'没买票','“早知道就去了。”']];
 for(const [i,[x,name,voice]] of branches.entries()){
   const hot=left?i===0:i===1,col=hot?essay.gold:'#8aa2ab';
   const path='M270 633 C270 533 '+x+' 537 '+x+' 448';
   shape(path,null,col,hot?2.3:1.2);
   oval(x,435,11,11,col,1.2);circle(x,435,3.9,col);
   type(name,x,411,24,col,600,serif,'center');
   type(voice,x,492,16,col,500,serif,'center');
   if(hot){
     const phase=(t-14.5)%2.5/2.5, u=1-Math.abs(1-2*phase),v=1-u;
     const px=v*v*v*270+3*v*v*u*270+3*v*u*u*x+u*u*u*x;
     const py=v*v*v*633+3*v*v*u*533+3*v*u*u*537+u*u*u*448;
     circle(px,py,4.5,essay.gold);
   }
 }
 circle(270,634,7,essay.ivory);type('现在，还没按下购买。',270,696,22,essay.ivory,550,serif,'center');
}
function mintedCoin(x,y,size,spin,t){
 group(()=>{ctx.translate(x,y);ctx.rotate(-.13);
   const face=Math.cos(spin),width=Math.max(.065,Math.abs(face));
   for(let i=0;i<7;i++)group(()=>{ctx.translate(5-i*.8,5-i*.5);ctx.scale(width,1);
     circle(0,0,size,i===6?'#e9c488':i%2?'#89724f':'#b19464');});
   group(()=>{ctx.scale(width,1);const metal=ctx.createLinearGradient(-size,-size,size,size);
     metal.addColorStop(0,'#f1dcb0');metal.addColorStop(.40,'#cdac75');metal.addColorStop(.6,'#e5c18a');metal.addColorStop(1,'#987b57');
     circle(0,0,size-3,metal);oval(0,0,size-10,size-10,'#776349',1.4);
     for(let i=0;i<64;i++){const a=i*TAU/64;line((size-7)*Math.cos(a),(size-7)*Math.sin(a),(size-4)*Math.cos(a),(size-4)*Math.sin(a),'#7f6849',1);}
     // An original engraved coin, used as a schematic of a random suggestion.
     for(let j=0;j<10;j++){const yy=(j-5)*5;shape('M-27 '+yy+' Q-12 '+(yy-16)+' 0 '+yy+' T27 '+yy,null,'#846d49',1.5);}
     type(face>0?'A':'B',0,-29,24,'#66563a',650,book,'center');circle(0,36,2,'#846d49');
   });
 });
}
function screenCapture(index,x,y,w,h){
 const base=imgs['theory-screen.jpg'];
 ctx.drawImage(base,x,y,w,h);
 const spec=theoryCapture,[x0,y0,x1,y1]=spec.area,cw=x1-x0,ch=y1-y0;
 const frame=Math.max(0,Math.min(spec.frameCount-1,index)),j=frame%spec.framesPerSheet;
 const sheet=imgs['theory-roll-'+Math.floor(frame/spec.framesPerSheet)+'.webp'];
 ctx.drawImage(sheet,j%spec.cols*cw,Math.floor(j/spec.cols)*ch,cw,ch,x+x0*w/spec.screen[0],y+y0*h/spec.screen[1],cw*w/spec.screen[0],ch*h/spec.screen[1]);
}
function appExtract(t){
 const p=timing(t,34,34.7);
 group(()=>{const x=95,y=236+16*(1-p),w=350,h=535;
   ctx.shadowColor='#07111ea6';ctx.shadowBlur=21;ctx.shadowOffsetY=8;
   box(x-4,y-4,w+8,h+8,'#9aab9d',16);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
   ctx.beginPath();ctx.roundRect(x,y,w,h,13);ctx.clip();
   const n=Math.max(0,Math.floor((t-36.8)*30));
   screenCapture(n,x,y,w,h);
   const tap=ramp(t,36.45,36.93);if(tap>0&&tap<1)group(()=>{ctx.globalAlpha=1-tap;oval(x+w*.80,y+h*.85,7+tap*19,7+tap*19,'#fae9a3',2.2);});
 });
}
function theoryFilm(t){
 essayGround(t);
 if(t<4.5){
   essayHeader('关于选择的心理学','周五的两种可能');
   essayTitle('为什么你总是','在纠结？');
   printedTicket(t,270,490+4*Math.sin(t*.8),1.12,-.10+.009*Math.sin(t));
   essaySub('一种可能是：还没做决定，','你已经开始担心选错以后会后悔。');
 }else if(t<14.5){
   essayHeader('一种可能的解释','预期后悔');
   const buy=t<9.4;
   essayTitle(buy?'预期后悔':'如果没买……');
   if(buy)type('比如，周五的演出票，要买吗？',39,256,24,essay.pale,550,serif);
   if(buy)printedTicket(t,267,482,1.06+.015*(t-4.5),-.12+.022*(t-4.5));
   else auditorium(t);
   essaySub(buy?'如果买了，你想到散场时的自己：':'你又想到明天，朋友聊起那首安可曲。',
     buy?'“就这两小时，花这钱干吗？”':'“当时明明还有一张票。”');
 }else if(t<20.8){
   essayHeader('一种可能的解释','决策心理学');
   essayTitle('人还在今天。');
   type('心里已经过了两遍明天。',39,249,24,essay.pale,550,serif);
   counterfactual(t);
   essaySub('当两边都能想出一句“早知道”，','做决定就变得有压力。','Steffel 与 Williams，2018 · 决策委托研究');
 }else if(t<28.7){
   essayHeader('一个实验','Douneva 等，2019');
   essayTitle('给选择加一点随机。');
   type('五项实验  ·  共 997 人',39,256,23,essay.pale,500,serif);
   const toss=timing(t,22.8,25.4),lift=105*Math.sin(Math.PI*toss);
   const xx=270+82*toss;
   oval(xx,565,64-lift*.22,10,'#60737a',.8);
   mintedCoin(xx,460-lift,80,.43+TAU*2.5*toss,t);
   for(const [x,s] of [[174,'A'],[357,'B']]){
     const chosen=s==='B'&&t>=25.4;
     oval(x,635,34,34,chosen?essay.gold:essay.line,chosen?2:1);type(s,x,648,36,chosen?essay.gold:essay.pale,500,book,'center');
   }
   if(t<23.8)essaySub('参与者先在两个选项中初步选一个。','随后，一部分人看到硬币给出的建议。');
   else essaySub('硬币给出一个具体选项。','最后怎么选，仍由参与者决定。');
 }else if(t<34){
   essayHeader('实验发现','信息需求');
   essayTitle('还要再查一点吗？');
   // A stack of information cards closes, illustrating the measured outcome.
   const close=timing(t,29.05,31.5);
   for(let i=0;i<5;i++)group(()=>{ctx.translate(260+(i-2)*34*(1-close),480-(4-i)*(12+14*(1-close)));
     ctx.rotate((i-2)*.10*(1-close)-.045);box(-112,-66,224,132,'#1f303c',7);
     ctx.beginPath();ctx.roundRect(-112,-66,224,132,7);ctx.strokeStyle=i===4?essay.gold:'#84949a';ctx.lineWidth=1.5;ctx.stroke();
     for(let j=0;j<4;j++)line(-81,-23+j*16,58+(j*17)%25,-23+j*16,'#a8ad996f',1.4);
   });
   type('更多信息',270,634,24,essay.pale,500,serif,'center');
   essaySub('和对照组相比，收到随机建议的人，','对更多信息的需求更低。','Douneva、Jaffé 与 Greifeneder，2019 · 抛硬币实验');
 }else if(t<44.4){
   essayHeader('把这个问题放回今晚','练不练');
   essayTitle('今天练，还是歇？');
   appExtract(t);
   if(t<36.8){
     type('打开「练不练」，点一次“掷一下”。',39,850,25,essay.ivory,550,serif);
   }else if(t<40){
     type('一到三点歇，四到六点练。',39,850,25,essay.ivory,550,serif);
   }else{
     type('两点。行，那今晚休息。',39,850,27,essay.ivory,550,serif);
   }
 }else{
   // Same room as the earlier story; a brief human resolution after the product demo.
   wideShot(43+Math.min(4.9,t-44.4));
   type('练不练',38,134,48,essay.ivory,650,serif);
   subtitle('今晚已经决定了。','把手机扣下，睡个好觉。');
 }
 for(const cut of [4.5,9.4,14.5,20.8,28.7,34,44.4]){
   const p=1-Math.min(1,Math.abs(t-cut)/.22);
   if(p>0)box(0,0,W,H,'rgba(13,22,33,'+p*.82+')');
 }
}
