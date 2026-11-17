/* Dependency-free WebGL die. Six numbered faces, rounded geometry and lit recessed pips.
 * Replays fixed-step rigid-body trajectories from dice-physics.js.
 * Packaged locally with the Android app; no network or external runtime is needed. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const scale = (a, s) => a.map(v => v * s);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const normalize = a => scale(a, 1 / Math.hypot(...a));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
  function qMultiply(a,b){return [...add(add(scale(b.slice(0,3),a[3]),scale(a.slice(0,3),b[3])),cross(a,b)),a[3]*b[3]-dot(a.slice(0,3),b.slice(0,3))];}
  function qAxis(axis, angle){return [...scale(axis,Math.sin(angle/2)),Math.cos(angle/2)];}
  function qSlerp(a,b,t){let d=dot(a,b);if(d<0){b=scale(b,-1);d=-d;}if(d>.9995)return normalize(a.map((v,i)=>v+(b[i]-v)*t));const angle=Math.acos(clamp(d,-1,1));return a.map((v,i)=>(v*Math.sin((1-t)*angle)+b[i]*Math.sin(t*angle))/Math.sin(angle));}
  function modelMatrix(q,p){const [x,y,z,w]=q,xx=x*x,yy=y*y,zz=z*z;return new Float32Array([1-2*(yy+zz),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(xx+zz),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(xx+yy),0,...p,1]);}
  function cameraMatrix(eye,target){const z=normalize(add(eye,scale(target,-1))),x=normalize(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
  function perspective(aspect){const f=1/Math.tan(30*Math.PI/360),n=.1,far=60;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]);}
  const FACES=[
    {n:[1,0,0],u:[0,0,-1],v:[0,1,0],value:3},
    {n:[-1,0,0],u:[0,0,1],v:[0,1,0],value:4},
    {n:[0,1,0],u:[1,0,0],v:[0,0,-1],value:1},
    {n:[0,-1,0],u:[1,0,0],v:[0,0,1],value:6},
    {n:[0,0,1],u:[1,0,0],v:[0,1,0],value:2},
    {n:[0,0,-1],u:[-1,0,0],v:[0,1,0],value:5},
  ];
  function faceRotation(value,yaw=0){const n=FACES.find(f=>f.value===value)?.n;if(!n)throw new RangeError('Die face must be 1–6');const d=n[1];const q=d<-.999?qAxis([1,0,0],Math.PI):normalize([...cross(n,[0,1,0]),1+d]);return qMultiply(qAxis([0,1,0],yaw),q);}
  function topFace(q){const m=modelMatrix(q,[0,0,0]);return FACES.map(f=>({value:f.value,height:f.n[0]*m[1]+f.n[1]*m[5]+f.n[2]*m[9]})).sort((a,b)=>b.height-a.height)[0].value;}
  function supportHeight(q){return EonDicePhysics.supportHeight(q);}
  function geometry(){const out=[],steps=24,h=EonDicePhysics.HALF,r=EonDicePhysics.RADIUS;for(const face of FACES){const vertex=(i,j)=>{const uv=[i/steps,j/steps],p=add(scale(face.n,h),add(scale(face.u,(uv[0]-.5)*2*h),scale(face.v,(uv[1]-.5)*2*h))),inner=p.map(x=>clamp(x,-h+r,h-r)),normal=normalize(add(p,scale(inner,-1))),pos=add(inner,scale(normal,r));return [...pos,...normal,...uv,face.value];};for(let i=0;i<steps;i++)for(let j=0;j<steps;j++){const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i+1,j+1),d=vertex(i,j+1);out.push(...a,...b,...c,...a,...c,...d);}}return new Float32Array(out);}
  const VERTEX=`
    attribute vec3 aPosition; attribute vec3 aNormal; attribute vec2 aUv; attribute float aFace;
    uniform mat4 uModel; uniform mat4 uVP;
    varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv; varying float vFace;
    void main(){vec4 p=uModel*vec4(aPosition,1.0);vWorld=p.xyz;vNormal=mat3(uModel)*aNormal;vUv=aUv;vFace=aFace;gl_Position=uVP*p;}
  `;
  const FRAGMENT=`
    precision highp float;
    varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv; varying float vFace;
    uniform vec3 uEye;
    float pipDistance(vec2 p){
      float d=10.0;
      if(vFace<1.5 || (vFace>2.5 && vFace<3.5) || (vFace>4.5 && vFace<5.5))d=length(p);
      if(vFace>1.5){d=min(d,length(p-vec2(-.225,.225)));d=min(d,length(p-vec2(.225,-.225)));}
      if(vFace>3.5){d=min(d,length(p-vec2(.225,.225)));d=min(d,length(p-vec2(-.225,-.225)));}
      if(vFace>5.5){d=min(d,length(p-vec2(-.225,0.0)));d=min(d,length(p-vec2(.225,0.0)));}
      return d;
    }
    void main(){
      vec3 n=normalize(vNormal),light=normalize(vec3(-3.0,7.0,5.0)),view=normalize(uEye-vWorld);
      float key=max(dot(n,light),0.0),fill=max(dot(n,normalize(vec3(5.0,1.0,2.0))),0.0);
      float lighting=.61+key*.34+fill*.08;
      vec3 ivory=vec3(.99,.98,.94)*lighting;
      float spec=pow(max(dot(n,normalize(light+view)),0.0),44.0)*.10;
      ivory+=spec;
      float d=pipDistance(vUv-.5),radius=vFace<1.5?.079:.065;
      float inside=1.0-smoothstep(radius-.003,radius+.003,d);
      float rim=smoothstep(radius-.012,radius,d)*(1.0-smoothstep(radius,radius+.009,d));
      vec3 green=vec3(.16,.24,.18)*(.72+key*.26);
      green+=vec3(.08,.09,.055)*pow(clamp(d/radius,0.0,1.0),4.0);
      vec3 color=mix(ivory,green,inside);
      color=mix(color,vec3(.36,.40,.30)*lighting,rim*.35);
      gl_FragColor=vec4(color,1.0);
    }
  `;
  class DiceScene{
    constructor(canvas,shadow){
      this.canvas=canvas;this.shadow=shadow;this.stage=shadow.parentElement;this.ctx=shadow.getContext('2d');this.visible=true;
      this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
      if(!this.gl)throw new Error('3D rendering is unavailable');
      const gl=this.gl,shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);const data=geometry();this.vertexCount=data.length/9;const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      [['aPosition',3,0],['aNormal',3,3],['aUv',2,6],['aFace',1,8]].forEach(([name,size,offset])=>{const a=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,36,offset*4);});
      this.uniforms=Object.fromEntries(['uModel','uVP','uEye'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
      this.eye=[2.8,7.5,10.2];this.view=cameraMatrix(this.eye,[0,.7,0]);this.q=faceRotation(1,-.3);this.position=[0,EonDicePhysics.HALF,.65];this.air=0;this.rolling=false;this.lost=false;this.generation=0;
      gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);
      // The die has its own viewport-sized layer outside every clipped app panel.
      // The floor remains in the stage; both use the same camera and world origin.
      canvas.classList.add('dice-overlay');document.body.append(canvas);
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.stage);
      window.addEventListener('resize',()=>this.resize(),{passive:true});
      window.addEventListener('scroll',()=>this.draw(),{passive:true,capture:true});
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
      canvas.addEventListener('webglcontextrestored',()=>location.reload());
      this.resize();
    }
    setVisible(visible){this.visible=visible;this.canvas.hidden=!visible;if(visible)this.resize();}
    resize(){
      const rect=this.stage.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
      this.width=rect.width;this.height=rect.height;this.dpr=Math.min(window.devicePixelRatio||1,2);
      this.shadow.width=Math.round(rect.width*this.dpr);this.shadow.height=Math.round(rect.height*this.dpr);
      this.viewportWidth=window.innerWidth;this.viewportHeight=window.innerHeight;
      this.canvas.style.width=this.viewportWidth+'px';this.canvas.style.height=this.viewportHeight+'px';
      this.canvas.width=Math.round(this.viewportWidth*this.dpr);this.canvas.height=Math.round(this.viewportHeight*this.dpr);
      this.vp=multiply(perspective(rect.width/rect.height),this.view);this.draw();
    }
    overlayProjection(){
      const rect=this.stage.getBoundingClientRect(),w=this.viewportWidth,h=this.viewportHeight;
      // Expand the renderable area without changing the die's stage-relative size.
      const remap=new Float32Array([rect.width/w,0,0,0,0,rect.height/h,0,0,0,0,1,0,(rect.left*2+rect.width)/w-1,1-(rect.top*2+rect.height)/h,0,1]);
      return multiply(remap,this.vp);
    }
    project(p){const m=this.vp,w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return [(m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12])/w*this.width/2+this.width/2,(-(m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13])/w+1)*this.height/2];}
    floorPath(y=0){
      const ctx=this.ctx,rx=2.85,rz=2.5,r=.44;
      ctx.beginPath();
      const corners=[[-rx+r,-rz+r,Math.PI],[rx-r,-rz+r,-Math.PI/2],[rx-r,rz-r,0],[-rx+r,rz-r,Math.PI/2]];
      let first=true;
      for(const [cx,cz,angle] of corners)for(let i=0;i<=8;i++){
        const a=angle+i*Math.PI/16,p=this.project([cx+r*Math.cos(a),y,cz+r*Math.sin(a)]);
        if(first){ctx.moveTo(...p);first=false;}else ctx.lineTo(...p);
      }
      ctx.closePath();
    }
    drawFloor(){
      const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
      this.floorPath(-.065);ctx.fillStyle='#d7dccd';ctx.fill();
      this.floorPath();const surface=ctx.createLinearGradient(0,this.height*.2,this.width,this.height*.9);surface.addColorStop(0,'#f0f1e8');surface.addColorStop(1,'#e6eadc');ctx.fillStyle=surface;ctx.fill();ctx.strokeStyle='#dce1d1';ctx.lineWidth=.8;ctx.stroke();
      ctx.save();ctx.clip();
      const [x,y]=this.project([this.position[0],0,this.position[2]]),size=this.height*(.145*(EonDicePhysics.HALF/.8)+this.air*.05),opacity=.31/(1+this.air*1.1);
      ctx.translate(x+5+this.air*9,y+3);ctx.scale(1,.43);
      const gradient=ctx.createRadialGradient(0,0,size*.1,0,0,size);gradient.addColorStop(0,`rgba(47,62,33,${opacity})`);gradient.addColorStop(.35,`rgba(47,62,33,${opacity*.6})`);gradient.addColorStop(1,'rgba(47,62,33,0)');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,size,0,TAU);ctx.fill();ctx.restore();
    }
    draw(){
      if(!this.vp||this.lost||!this.visible)return;const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(this.uniforms.uVP,false,this.overlayProjection());gl.uniformMatrix4fv(this.uniforms.uModel,false,modelMatrix(this.q,this.position));gl.uniform3fv(this.uniforms.uEye,this.eye);gl.drawArrays(gl.TRIANGLES,0,this.vertexCount);
      this.drawFloor();
    }
    cancel(){this.generation++;this.rolling=false;}
    async roll(value){
      if(this.rolling||this.lost)return null;
      this.rolling=true;const generation=++this.generation;
      try {
        const trajectory=await EonDicePhysics.planThrow({p:this.position,q:this.q},value,{yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0)),isCancelled:()=>generation!==this.generation});
        if(generation!==this.generation)return null;
        const frames=trajectory.frames,last=frames[frames.length-1];
        if(matchMedia('(prefers-reduced-motion: reduce)').matches){
          this.position=last.p.slice();this.q=last.q.slice();this.air=0;this.draw();
          return EonDicePhysics.upward(this.q).value;
        }
        return await new Promise(resolve=>{
          let elapsed=0,previousTime=null,index=0;
          const animate=now=>{
            if(this.lost||generation!==this.generation){resolve(null);return;}
            // Frame drops must not turn a short throw into slow motion. Android
            // cancels on pause, so advance by real frame time while the scene is active.
            if(previousTime!==null)elapsed+=Math.max((now-previousTime)/1000,0);
            previousTime=now;
            while(index<frames.length-2 && frames[index+1].time<=elapsed)index++;
            const a=frames[index],b=frames[index+1],mix=clamp((elapsed-a.time)/(b.time-a.time||1),0,1);
            this.position=a.p.map((v,i)=>v+(b.p[i]-v)*mix);
            this.q=qSlerp(a.q,b.q,mix);
            this.air=Math.max(0,this.position[1]-supportHeight(this.q));this.draw();
            if(elapsed<last.time){requestAnimationFrame(animate);}else{
              // Keep the exact simulated resting pose and location.
              this.position=last.p.slice();this.q=last.q.slice();this.air=0;this.draw();
              resolve(EonDicePhysics.upward(this.q).value);
            }
          };
          requestAnimationFrame(animate);
        });
      } finally {if(generation===this.generation)this.rolling=false;}
    }
  }
  window.EonDice={DiceScene,faceRotation,topFace,supportHeight};
})();
