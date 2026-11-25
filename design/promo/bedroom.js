// 再想五分钟 — a side-on bedroom, one light switch, and two states of a decision.
const BR = {ivory:'#f3e3bc', gold:'#f7bc76', cool:'#a1bab4', teal:'#263c40', night:'#111d23'};
const blend = (a,b,p)=>a+(b-a)*p;
const between = (a,b,p)=>[blend(a[0],b[0],p),blend(a[1],b[1],p)];
const timing = (t,a,b)=>smooth(ramp(t,a,b));
const glowCache = new Map();

function lampGlow(x,y,r,color){
 if(!glowCache.has(color)){
   const tex=document.createElement('canvas');tex.width=tex.height=420;
   const g=tex.getContext('2d'),fill=g.createRadialGradient(210,210,1,210,210,210);
   fill.addColorStop(0,color+'bd');fill.addColorStop(.28,color+'52');fill.addColorStop(.65,color+'15');fill.addColorStop(1,color+'00');
   g.fillStyle=fill;g.fillRect(0,0,420,420);glowCache.set(color,tex);
 }
 ctx.drawImage(glowCache.get(color),x-r,y-r,2*r,2*r);
}
function shape(d,fill,stroke,w=1){
 const p=new Path2D(d);ctx.lineJoin='round';ctx.lineCap='round';
 if(fill){ctx.fillStyle=fill;ctx.fill(p);}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.stroke(p);}
}
function shade(x,y,x2,y2,stops){
 const g=ctx.createLinearGradient(x,y,x2,y2);stops.forEach(([p,c])=>g.addColorStop(p,c));return g;
}
function roomWindow(){
 // Mountains of apartment blocks, seen through the blue dusk behind the curtains.
 box(255,119,257,269,'#111f24',2);
 box(261,125,246,256,shade(0,122,0,380,[[0,'#24414b'],[.58,'#527375'],[1,'#b99e82']]));
 group(()=>{ctx.beginPath();ctx.rect(262,126,245,249);ctx.clip();
   for(let i=0;i<29;i++)circle(260+(i*73)%251,139+(i*41)%87,i%4?.55:.9,'#cce4cc');
   circle(435,172,16,'#e5d9ad');circle(430,166,15,'#304d56');
   for(let layer=0;layer<2;layer++){
     let x=253-layer*8;
     for(let j=0;j<11;j++){
       const w=10+(j*19+layer*17)%33,top=230+((j*37+layer*69)%76)+layer*17;
       box(x,top,w,390-top,layer?'#243e49':'#46616a');line(x,top,x+w,top,layer?'#657a77':'#78918b',.9);
       if(j%4===0){line(x+3,top,x+3,top-17,'#455e64',.8);box(x+4,top-5,w*.37,5,'#455e64');}
       for(let c=0;c<Math.floor(w/7);c++)for(let h=0;h<8;h++)
         if((j*19+c*3+h*5)%8<3)box(x+3+7*c,top+5+h*10,2.5,4,(j+c+h)%3?'#a8a889':'#ebc28e');
       x+=w+2;
     }
   }
   for(const xx of [349,432]){box(xx,125,5,253,'#263c41');line(xx+5,125,xx+5,378,'#9aab98',.7);}
   box(262,280,245,5,'#2d4246');line(262,280,505,280,'#a2ac94',.8);
   for(let j=0;j<6;j++)line(266+34*j,131,224+34*j,249,'#adc5ba1a',1);
 });
 shape('M247 113 Q264 122 298 115 Q295 205 285 264 Q281 294 276 313 L269 377 Q258 382 242 376 Q251 313 250 269Z','#334848','#73847a',1);
 for(let j=0;j<4;j++)shape('M'+(251+10*j)+' 122 Q'+(258+8*j)+' 202 '+(249+7*j)+' 284 Q'+(255+3*j)+' 321 '+(247+6*j)+' 373',null,'#88938a65',1);
 box(247,379,270,7,'#74847b');box(251,386,261,5,'#2c383a');
}
function wallPoster(){
 group(()=>{ctx.translate(46,202);ctx.rotate(-.035);
   box(3,2,103,132,'#20292b');box(0,0,103,132,'#a29876');box(5,5,93,122,'#354445');
   ctx.beginPath();ctx.rect(8,8,87,116);ctx.clip();
   circle(67,36,15,'#bf9d74');
   for(let i=0;i<10;i++){
     const y=55+i*4.7;
     shape('M-6 '+(y+25)+' Q12 '+(y+20)+' 26 '+(y-4)+' Q37 '+(y-18)+' 55 '+(y+4)+' Q65 '+(y+11)+' 79 '+(y-3)+' L110 '+(y-21),null,i<4?'#a4aca0':'#788e85',.8);
   }
   line(16,112,44,112,'#c1b89b',1.2);line(16,116,33,116,'#949e8d',1);
 });
}
function roomBase(t){
 box(0,0,W,H,shade(0,0,460,820,[[0,'#263436'],[.49,'#304145'],[1,'#15272c']]));
 lampGlow(74,457,277,'#ae774b');
 group(()=>{ctx.translate(33,13);ctx.scale(.86,.94);roomWindow();});
 // The open doorway is just visible beyond the pair of trainers.
 shape('M494 644 V171 L545 155 V646Z','#1f3035','#596c6c',1.5);
 shape('M502 644 V179 L539 169 V647Z','#2c3b3b','#75817a',1);
 line(508,184,508,638,'#85908455',1);circle(516,421,3,'#b7ab88');wallPoster();
 line(0,644,540,644,'#78837a',1);box(0,646,540,16,'#253436');line(0,661,540,661,'#63716a',1);
 box(0,662,W,310,shade(0,650,0,960,[[0,'#364344'],[.5,'#263438'],[1,'#111d23']]));
 for(let i=-3;i<8;i++)line(72+i*91,663,-240+i*169,960,'#91a29528',1);
 for(const y of [697,757,856])line(0,y,W,y,'#9ca99b24',.9);
 // A patch of window light across the floor.
 shape('M405 660 L508 660 L387 779 L234 779Z','#b4c6af0d');
 for(let j=0;j<4;j++)line(414+j*27,666,261+j*38,760,'#b2c3ab13',.9);
 // Bedside table, drawer, book and lamp.
 box(16,519,82,11,'#9b8c70',3);box(20,530,74,49,'#4b5047',3);
 box(24,534,66,36,'#626358',2);line(29,571,86,571,'#242f32',1.2);box(50,547,13,3,'#c6b48d',1);
 box(24,578,5,78,'#5b6053');box(85,578,5,78,'#5b6053');
 box(27,513,43,5,'#c2a785',2);box(30,509,38,4,'#535b50',1);
 box(53,463,4,43,'#c4ad83',2);box(43,506,25,4,'#ab9473',2);
 shape('M33 440 Q54 436 74 440 L84 468 Q57 473 24 467Z','#d2b48b','#edd1a0',1);
 for(let i=0;i<7;i++)line(34+i*6,442,28+i*8.8,465,'#98856c',.55);
 line(78,470,78,486,'#b29773',1);circle(78,487,1.9,'#dec59c');
 // Bed frame and the indented pillow are separate from the character.
 box(102,472,9,156,'#897e68',4);box(106,477,4,150,'#b2a489',2);
 box(109,562,330,47,'#4b605e',9);box(109,558,332,22,'#92a39a',8);
 box(105,602,339,12,'#aaa187',3);box(112,614,7,40,'#877f68');box(423,614,7,40,'#877f68');
 shape('M114 556 Q118 538 133 524 Q155 499 188 507 Q198 518 202 551 Q176 564 116 562Z','#b8b3a0','#d2c8ab',1.4);
 shape('M124 551 Q153 515 180 515 M135 553 Q154 539 167 538',null,'#8f9385',1);
 shape('M259 551 Q301 542 329 550 Q377 545 425 550 Q440 552 441 565 L440 599 Q423 609 396 599 Q361 606 332 599 Q296 606 272 601 L258 583Z','#547877','#9aab96',1.3);
 for(let i=0;i<8;i++)shape('M'+(276+i*22)+' 555 q-4 18 0 43',null,'#8fa99b66',.85);
 line(265,589,438,588,'#b4bca16b',1);
}
let bedroomWall;
function getRoom(){
 if(!bedroomWall){
   // Render once at export resolution; later camera push-ins sample this clean plate.
   group(()=>{ctx.setTransform(2,0,0,2,0,0);roomBase(0);texture(.37);});
   bedroomWall=document.createElement('canvas');bedroomWall.width=canvas.width;bedroomWall.height=canvas.height;
   bedroomWall.getContext('2d').drawImage(canvas,0,0);
 }
 return bedroomWall;
}
function runnerShoe(x,y,rotation,other=false){
 group(()=>{ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(.235,.235);
   if(other)ctx.globalAlpha*=.9;
   shape('M-136 31 Q-54 38 1 28 T137 21 L136 38 Q121 45 95 45 L-113 50 Q-134 48 -136 39Z','#b8b69e','#c5bd9f',4);
   shoeDrawing(0,0,1,.6);
   shape('M-134 33 Q-63 41 8 30 Q76 22 135 27 M-48 -24 L-6 -54 M-5 -28 L24 -42',null,'#e4d3a8',4.8);
 });
}
function handset(x,y,rotation,lit,flat=0){
 group(()=>{ctx.translate(x,y);ctx.scale(1,1-.77*flat);ctx.rotate(rotation);
   box(-10,-17,20,34,'#121c20',3);box(-8,-15,16,30,lit?'#94afab':'#263638',2);
   if(lit){box(-6,-11,12,13,'#556c70',1);shape('M-5 1 L-1 -5 L5 1Z','#dec18e');line(-5,8,4,8,'#e7d5b1',1.1);}
   line(-3,-13,3,-13,'#445858',.9);
 });
}
const bodyPoses = {
 // head, shoulder, hip, knees, heel centers, elbows, hands, phone center.
 lounge:[[161,507],[180,527],[258,547],[298,512],[348,541],[300,537],[357,552],[175,541],[206,486],[199,534],[214,495],[210,477]],
 sit:[[252,433],[253,461],[273,545],[331,558],[354,645],[297,566],[297,632],[277,488],[293,468],[264,505],[294,485],[295,461]],
 slump:[[181,506],[197,528],[269,546],[330,570],[354,645],[318,537],[369,551],[186,547],[216,493],[215,547],[224,498],[221,482]],
 rest:[[154,514],[175,535],[255,550],[300,540],[360,548],[296,550],[353,553],[166,553],[193,545],[205,548],[232,548],[74,514]]
};
function limb(points,col,width){
 const d=points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ');
 shape(d,null,'#233033',width+2.4);shape(d,null,col,width);
}
function mixPose(a,b,p){return a.map((v,i)=>between(v,b[i],p));}
function drawFigure(t){
 const situp=timing(t,8.1,10.1),slouch=timing(t,13.6,15.4),unshoe=timing(t,38.3,39.65),lie=timing(t,39.6,41.1);
 let pose=mixPose(bodyPoses.lounge,bodyPoses.sit,situp);
 pose=mixPose(pose,bodyPoses.slump,slouch);
 if(t>37){pose=mixPose(pose,bodyPoses.sit,timing(t,37.3,38.5));}
 pose=mixPose(pose,bodyPoses.rest,lie);
 const lightOff=timing(t,44.45,44.82),returnHand=timing(t,44.5,45.45);
 const [head,shoulder,hip,knee,heel,knee2,heel2,elbow,hand,elbow2,hand2,mobile]=pose;
 const glance=(t<8)?Math.sin(Math.PI*ramp(t%4.6,1.6,3.65))**2:0;
 if(t<18){
   mobile[1]+=10*glance;hand[1]+=9*glance;hand2[1]+=9*glance;
   const swipe=.5+.5*Math.sin(t*4.5);
   hand2[0]-=4*swipe;hand2[1]-=6*swipe;
   head[1]+=1.1*Math.sin(t*2);head[0]+=1.6*Math.sin(t*1.8);
 }
 // The thumb lingers on the phone until the hand sets it on the nightstand.
 if(t>=39.55){
   const put=timing(t,39.55,42.05);
   const start=[295,461];
   const phone=between(start,[76,515],put);phone[1]-=39*Math.sin(Math.PI*put);
   mobile.splice(0,2,...phone);
   const reach=timing(t,42.9,44.43);
   const target=between([77,515],[78,485],reach);
   hand.splice(0,2,...between(put<1?phone:target,[182,547],returnHand));
   elbow.splice(0,2,...between([blend(256,128,put),blend(478,531,put)],[156,550],returnHand));
 }
 if(t>=38 && t<41){
   const push=timing(t,38.3,39.5)*(1-timing(t,39.5,40.55));
   heel[0]+=45*push;heel[1]-=4*Math.sin(Math.PI*timing(t,39.48,40.2));
   knee[0]+=21*push;
 }
 const activeShoe=between([368,648],[354,647],timing(t,8.5,10.2));
 // As the heel comes free, the shoe settles next to its mate.
 activeShoe[0]=blend(activeShoe[0],402,unshoe);activeShoe[1]=blend(activeShoe[1],655,unshoe);
 runnerShoe(416,643,-.07,true);
 limb([hip,knee2,heel2],'#8da497',5.9);limb([heel2,[heel2[0]+13,heel2[1]+1]],'#b9c0a6',5);
 limb([hip,knee,heel],'#d4c9aa',6.7);limb([heel,[heel[0]+15,heel[1]+1]],'#ddd6b9',5.8);
 runnerShoe(activeShoe[0],activeShoe[1],-.06+.19*situp*(1-unshoe));
 limb([shoulder,hip],'#c6be9e',9);
 limb([shoulder,elbow2,hand2],'#a8b09e',5.3);
 limb([shoulder,elbow,hand],'#e5d8b5',5.8);
 const resting=t>=42.1; if(!resting)lampGlow(mobile[0],mobile[1],33,'#b8cfae');
 handset(mobile[0],mobile[1],resting?1.55:blend(.22,1.55,timing(t,40.7,42.05)),!resting,timing(t,41.4,42.05));
 circle(hand[0],hand[1],3.6,'#e5d8b5');
 group(()=>{ctx.translate(head[0],head[1]);ctx.rotate(blend(.27,-.06,situp)+.19*slouch+.48*glance);
   limb([[3,16],[shoulder[0]-head[0],shoulder[1]-head[1]]],'#d4c8a7',5);
   ctx.beginPath();ctx.ellipse(0,0,21,22.5,-.12,0,TAU);
   ctx.fillStyle='#354340';ctx.fill();ctx.strokeStyle=BR.ivory;ctx.lineWidth=2.6;ctx.stroke();
   shape('M-16 -12 Q-22 -20 -20 -24 Q-15 -21 -12 -19 Q-14 -25 -9 -29 Q-8 -25 -6 -23',null,'#dacda9',2);
   const eyes=lightOff>.5 || (t%4.6>4.43);
   if(eyes)shape('M5 -2 q3 3 6 0',null,BR.ivory,1.4);else {circle(10,-2,1.8,BR.ivory);shape('M5 -8 q3 -2 7 0',null,BR.ivory,1.25);}
   shape('M11 9 q3 1 5 -1',null,'#d8caa7',1.2);
 });
}
function wideShot(t){
 const wall=getRoom();
 const shoeClose=timing(t,37.1,38.25)*(1-timing(t,39.9,41.8));
 const push=timing(t,8,11)*.27*(1-timing(t,15.5,18))+.85*shoeClose;
 group(()=>{ctx.translate(-blend(255,352,shoeClose)*push,-blend(520,637,shoeClose)*push);ctx.scale(1+push,1+push);
   ctx.drawImage(wall,0,0,W,H);drawFigure(t);
   const off=timing(t,44.45,44.82);
   if(off>0){box(0,0,W,H,'rgba(10,24,36,'+(.57*off)+')');
     group(()=>{ctx.globalAlpha=.19*off;lampGlow(405,272,198,'#aac7c7');});}
 });
}
function phonePortrait(t){
 const open=timing(t,27.72,28.48),dim=1-timing(t,18,19.9);
 const throwTime=ramp(t,31,34.05),move=smooth(throwTime);
 const wall=getRoom();
 ctx.drawImage(wall,0,0,W,H);box(0,0,W,H,'rgba(11,22,26,.82)');
 lampGlow(258,451,268,open>.5?'#66785f':'#4e6c74');
 group(()=>{ctx.translate(265+4*Math.sin(t*.43),465+4*Math.sin(t*.65));
   ctx.rotate(blend(-.10,-.035,timing(t,18,22))+.009*Math.sin(t*.7));
   // Sleeve and the thumb support the phone even after the video falls silent.
   shape('M-40 339 L-77 267 Q-139 230 -157 175 L-166 90 Q-170 59 -155 56 Q-144 56 -139 78 L-122 135 L-111 -70 Q-111 -89 -96 -85 L72 165 Q82 208 45 246 L37 341Z','#47564e','#c2ad89',1.8);
   shape('M-125 329 L-77 259 Q-18 282 43 257 L70 353Z','#34494b','#7e8d80',1.4);
   for(let i=0;i<7;i++)line(-81+i*17,278,-89+i*18,292,'#899889',.8);
   box(-120,-216,245,444,'#161d20',27);box(-118,-214,241,439,'#93a39b',25);
   box(-116,-212,237,435,'#1a262a',23);box(-108,-203,221,414,'#27353a',18);
   group(()=>{ctx.beginPath();ctx.roundRect(-107,-202,219,412,17);ctx.clip();
     box(-108,-203,221,414,shade(-105,-204,120,219,[[0,'#142027'],[.55,'#304145'],[1,'#19292e']]));
     group(()=>{ctx.globalAlpha=.78*(1-open);
       // Reflection is visibly the same cowlick, profile and eyes as in the wide shot.
       ctx.translate(6,4);ctx.rotate(-.10);
       shape('M-63 110 Q-51 61 -22 56 L-18 35 M24 34 L26 54 Q63 74 72 116',null,'#99a798',2.7);
       ctx.beginPath();ctx.ellipse(0,-4,44,49,-.10,0,TAU);ctx.fillStyle='#465758';ctx.fill();
       ctx.strokeStyle='#bcc6b4';ctx.lineWidth=2.9;ctx.stroke();
       shape('M-31 -37 Q-44 -50 -40 -58 Q-30 -52 -26 -51 Q-31 -63 -21 -68 Q-21 -60 -14 -56',null,'#b8c4b2',2.4);
       const watch=timing(t,21,24);circle(-8+watch*4,-6,2.2,'#d6d5b8');circle(16+watch*3,-7,2.4,'#d6d5b8');
       shape('M-16 -15 l12 2 M10 -16 l12 -2 M1 18 q9 -3 15 0',null,'#c5c8ac',1.8);
     });
     if(dim>0)group(()=>{ctx.globalAlpha=dim;
       box(-108,-203,221,414,'#64807f');circle(21,-63,46,'#d1c9a4');
       shape('M-113 85 L-71 13 L-45 40 L8 -15 L68 49 L116 21 L116 210 L-113 210Z','#3c5962');
       shape('M-110 120 L-36 66 L12 92 L80 43 L118 74 L118 216 L-110 216Z','#25464c');
       line(-83,148,74,148,'#c2d4bc',2);box(-83,160,92,3,'#dbe0c4',1);
     });
     if(open>0)group(()=>{ctx.globalAlpha=open;box(-108,-203,221,414,'#263833');
       type('练不练',2,-133,23,'#f5e8c7',650,serif,'center');line(-87,-115,89,-115,'#788273',.8);
       type('今天练不练？',2,-77,22,'#dfe1ca',600,serif,'center');
       oval(1,49,69,15,'#718576',.9);oval(1,49,75,18,'#586e61',.7);
       const lift=43*Math.sin(Math.PI*throwTime);
       brassDie(3,6-lift,31+lift*.06,-.82+TAU*(1-move),.47+TAU*(1-move),-.08+.55*Math.sin(Math.PI*throwTime));
       if(t>=34.05){
         type('两点',1,102,32,BR.ivory,650,serif,'center');
         type('今天休息',2,148,23,BR.gold,600,serif,'center');
       }else{
         type('1–3 休息   /   4–6 训练',2,104,14,'#d9d9bd',500,sans,'center');
         box(-74,129,150,40,'#c6ca9e',20);type(t<31?'掷一次':'掷骰中…',1,156,18,'#253d33',600,sans,'center');
       }
     });
     // Narrow screen reflection and home bar.
     shape('M-81 -200 L-65 -200 L-109 88 L-109 2Z','#e6edd20b');
     box(-25,192,55,3,'#abb7a5',2);
   });
   box(-24,-199,53,8,'#172328',4);
   const tap=Math.sin(Math.PI*ramp(t,30.55,31.4));
   group(()=>{ctx.translate(-tap*48,-tap*9);
     shape('M134 138 Q120 121 108 110 Q93 98 86 102 Q77 107 82 119 L100 162 Q108 178 130 179', '#5d6559','#c8b899',1.6);});
 });
}
function subtitle(a,b,credit){
 box(0,701,W,259,shade(0,701,0,960,[[0,'#14202500'],[.3,'#121d21d9'],[1,'#101a20']]));
 const fontSize=Math.min(25,Math.floor(466/Math.max(a.length,b.length,1)));
 line(39,770,70,770,'#c6a476',1.3);
 type(a,39,813,fontSize,'#f2e7cd',550,serif);if(b)type(b,39,853,fontSize,'#f2e7cd',550,serif);
 if(credit)type(credit,40,908,14,'#b7c3ad',500,serif);
}
function bedroomFilm(t){
 if(t<18 || t>=38)wideShot(t);else phonePortrait(t);
 if(t<8){
   // A match cut on the same movement carries the clock forward by twenty-four minutes.
   const later=t>=4.6;
   type(later?'20:06':'19:42',36,117,61,'#f1e5c9',500,book);
   type('再想五分钟。',40,159,27,'#e4d4af',580,serif);
   if(t<4.6)subtitle('“再刷五分钟，我就决定','今天练不练。”');
   else subtitle('拇指又划了一下。','鞋还在原地。');
 }else if(t<13.5){
   subtitle('“去吧，今天累成这样，','去了能练什么？”','20:06  ·  卧室');
 }else if(t<18){
   subtitle('“歇吧……','我昨天好像也是这么说的。”','20:06  ·  卧室');
 }else if(t<23.3){
   type('还没选，',38,131,40,BR.ivory,600,serif);
   type('已经在后悔。',38,189,47,BR.ivory,650,serif);
   subtitle('有时候，决定还没做，','人已经开始想：选错了会怎样？');
 }else if(t<28){
   type('预期后悔',38,152,47,BR.ivory,620,serif);
   subtitle('两个选项，都能想出一句','明天埋怨自己的话。','关于预期后悔与委托选择 · Steffel 与 Williams，2018');
 }else if(t<34.05){
   type('这次，交给骰子。',37,146,42,BR.ivory,600,serif);
   subtitle('“一二三，歇。','四五六，练。”');
 }else if(t<38){
   if(t>=35.12)subtitle('“行。','那今晚就歇。”');
 }else if(t<40.4){
   subtitle('他把鞋摆好。','');
 }else if(t<48){
   if(t>=45.2){type('练不练',39,128,39,'#dcddc1',600,serif);}
   subtitle('抛硬币实验发现，得到随机建议后，','人们对更多信息的需求降低了。','Douneva 等，2019 · 五项实验，共 997 人');
 }
 // The two phone close-ups are cut on screen light; all bedroom returns use one camera.
 for(const cut of [4.6,18,38]){
   const alpha=1-Math.min(1,Math.abs(t-cut)/.18);
   if(alpha>0)box(0,0,W,H,'rgba(19,29,32,'+(.69*alpha)+')');
 }
}
