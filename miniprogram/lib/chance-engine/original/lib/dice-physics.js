// Synced from Android chance/lib/dice-physics.js. Run node tools/chance/sync-miniprogram.js.
module.exports = function mountOriginal(platform) {
  const { window, document, location, matchMedia, requestAnimationFrame, cancelAnimationFrame,
    ResizeObserver, Image, performance, devicePixelRatio, setTimeout, clearTimeout } = platform
  const globalThis = window

;
/* A single rounded rigid die against a fixed horizontal plane.
 * Units are scene units; simulation always advances at 240 Hz.
 * Contact impulses provide restitution, sliding friction and angular response.
 * Sleeping freezes an already resting body; it never aligns a face or moves it home.
 */
(function () {
  'use strict';
  const STEP = 1 / 240;
  const SIZE = .82;
  const INNER = .62*SIZE, RADIUS = .18*SIZE, GRAVITY = 22, INV_INERTIA = 2.6/(SIZE*SIZE);
  const TUMBLE_SPEED = 15;
  const SPIN_MULTIPLIER = 3;
  const LAUNCH_SPIN_SPEED = TUMBLE_SPEED*SPIN_MULTIPLIER;
  const THROW_HEIGHT_MULTIPLIER = 3;
  const FACES = [[3,1,0,0],[4,-1,0,0],[1,0,1,0],[6,0,-1,0],[2,0,0,1],[5,0,0,-1]];
  const corners = [];
  for (const x of [-INNER, INNER]) for (const y of [-INNER, INNER]) for (const z of [-INNER, INNER]) corners.push([x,y,z]);
  const length = v => Math.hypot(...v);
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  function rotate(q,p) {
    const t = cross(q,p).map(v => 2*v), c = cross(q,t);
    return p.map((v,i) => v+q[3]*t[i]+c[i]);
  }
  function upward(q) {
    let value=1, alignment=-1;
    for (const [face,...normal] of FACES) {
      const y=rotate(q,normal)[1];
      if (y>alignment) { value=face; alignment=y; }
    }
    return {value,alignment};
  }
  function supportHeight(q) {
    return Math.max(...corners.map(c => -rotate(q,c)[1]))+RADIUS;
  }
  function integrateRotation(body,dt) {
    const [x,y,z,w]=body.q, [a,b,c]=body.w, h=dt*.5;
    const q=[x+h*(a*w+b*z-c*y), y+h*(-a*z+b*w+c*x), z+h*(a*y-b*x+c*w), w-h*(a*x+b*y+c*z)];
    const norm=Math.hypot(...q);
    body.q=q.map(v=>v/norm);
  }
  function velocityAt(body,r) {
    const spin=cross(body.w,r);
    return body.v.map((v,i)=>v+spin[i]);
  }
  function impulse(body,r,j) {
    const torque=cross(r,j);
    for (let i=0;i<3;i++) { body.v[i]+=j[i]; body.w[i]+=torque[i]*INV_INERTIA; }
  }
  function advance(body,dt) {
    body.v[1]-=GRAVITY*dt;
    for (let i=0;i<3;i++) { body.p[i]+=body.v[i]*dt; body.w[i]*=Math.exp(-.045*dt); }
    integrateRotation(body,dt);
    const contacts=[];
    for (const corner of corners) {
      const r=rotate(body.q,corner); r[1]-=RADIUS;
      const height=body.p[1]+r[1];
      if (height>.006) continue;
      const incoming=velocityAt(body,r)[1];
      contacts.push({r,normal:0,tx:0,tz:0,
        bounce:incoming < -1.1 ? -incoming*.31 : 0,
        kY:1+INV_INERTIA*(r[0]*r[0]+r[2]*r[2]),
        kX:1+INV_INERTIA*(r[1]*r[1]+r[2]*r[2]),
        kZ:1+INV_INERTIA*(r[0]*r[0]+r[1]*r[1]),
      });
    }
    // Accumulated sequential impulses: resting contacts can unload, never pull.
    for (let iteration=0;iteration<12;iteration++) {
      for (let index=0;index<contacts.length;index++) {
        const c=contacts[iteration%2 ? contacts.length-index-1 : index];
        const speed=velocityAt(body,c.r);
        const normal=Math.max(0,c.normal+(c.bounce-speed[1])/c.kY);
        impulse(body,c.r,[0,normal-c.normal,0]); c.normal=normal;
        const tangent=velocityAt(body,c.r);
        let tx=c.tx-tangent[0]/c.kX, tz=c.tz-tangent[2]/c.kZ;
        const magnitude=Math.hypot(tx,tz), limit=.30*c.normal;
        if (magnitude>limit) { tx*=limit/magnitude; tz*=limit/magnitude; }
        impulse(body,c.r,[tx-c.tx,0,tz-c.tz]); c.tx=tx; c.tz=tz;
      }
    }
    if (contacts.length) {
      // Very small positional correction only for actual interpenetration.
      body.p[1]=Math.max(body.p[1],supportHeight(body.q)-.001);
      // Rolling/torsional resistance applies only while touching the surface.
      const resistance=Math.exp(-1.1*dt);
      body.w=body.w.map(v=>v*resistance);
    }
    return contacts.length;
  }
  function frame(body,time) {
    return {time,p:body.p.slice(),q:body.q.slice(),v:body.v.slice(),w:body.w.slice()};
  }
  function simulate(start,launch,{maxTime=6}={}) {
    const body={p:start.p.slice(),q:start.q.slice(),v:launch.v.slice(),w:launch.w.slice()};
    const frames=[frame(body,0)];
    let quiet=0, settled=false, firstImpact=null, maxClearance=0;
    for (let step=1;step<=maxTime/STEP;step++) {
      const contacts=advance(body,STEP), time=step*STEP;
      const clearance=body.p[1]-supportHeight(body.q);
      maxClearance=Math.max(maxClearance,clearance);
      if (contacts && time>.12 && firstImpact===null) firstImpact=time;
      const resting=contacts && length(body.v)<.045 && length(body.w)<.065 && upward(body.q).alignment>.999;
      quiet=resting ? quiet+STEP : 0;
      frames.push(frame(body,time));
      if (quiet>.22 && time>.9) {
        body.v=[0,0,0]; body.w=[0,0,0]; settled=true;
        frames.push(frame(body,time)); break;
      }
    }
    const result=upward(body.q);
    const inBounds=frames.every(f=>Math.abs(f.p[0])<1.65 && Math.abs(f.p[2])<1.55);
    return {frames,settled,inBounds,face:result.value,alignment:result.alignment,firstImpact,maxClearance};
  }
  function randomLaunch(start,random=Math.random) {
    const range=(a,b)=>a+(b-a)*random();
    // Throw toward the other part of the table from wherever the last roll stopped.
    const targetX=start.p[0]>.15 ? range(-.55,-.1) : range(.1,.55);
    const targetZ=start.p[2]>.15 ? range(-.55,-.1) : range(.1,.55);
    const direction=[range(-1,1),range(-1,1),range(-1,1)];
    const magnitude=length(direction);
    const w=magnitude>1e-8 ? direction.map(v=>v*TUMBLE_SPEED/magnitude) : [TUMBLE_SPEED,0,0];
    // Ballistic rise is proportional to vertical launch speed squared.
    return {v:[(targetX-start.p[0])*1.1,range(6.9,8.0)*Math.sqrt(THROW_HEIGHT_MULTIPLIER),(targetZ-start.p[2])*1.1],w};
  }
  function yawQuaternion(q,angle) {
    const s=Math.sin(angle/2),c=Math.cos(angle/2),[x,y,z,w]=q;
    return [c*x+s*z,c*y+s*w,c*z-s*x,c*w-s*y];
  }
  function yawVector(v,angle) {
    const c=Math.cos(angle),s=Math.sin(angle);
    return [c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];
  }
  function withHorizontalSpin(trajectory) {
    // Keep the contact-driven tumble, and put the added speed around world Y.
    // This is a visual spin approximation: yaw preserves support height and the
    // upward face, while leaving the physical collision/translation path intact.
    // The resulting release angular speed is exactly 45 rad/s on every throw.
    const initial=trajectory.frames[0].w;
    let rate=Math.sqrt(LAUNCH_SPIN_SPEED**2-initial[0]**2-initial[2]**2)-initial[1];
    let yaw=0,previous=trajectory.frames[0];
    const frames=[];
    function transform(f) {
      const w=yawVector(f.w,yaw);w[1]+=rate;
      return {...f,p:f.p.slice(),q:yawQuaternion(f.q,yaw),v:f.v.slice(),w};
    }
    frames.push(transform(previous));
    for(const f of trajectory.frames.slice(1)) {
      const dt=f.time-previous.time;
      const touching=f.p[1]-supportHeight(f.q)<.025;
      const nextRate=touching ? Math.max(0,rate-32*dt) : rate*Math.exp(-.045*dt);
      yaw+=(rate+nextRate)*.5*dt;rate=nextRate;
      frames.push(transform(f));previous=f;
    }
    // If the tumble stops first, finish the horizontal spin on the same face.
    while(rate>0) {
      const nextRate=Math.max(0,rate-32*STEP);
      yaw+=(rate+nextRate)*.5*STEP;rate=nextRate;
      previous={...previous,time:previous.time+STEP};
      frames.push(transform(previous));
    }
    return {...trajectory,frames};
  }
  // Pick a launch whose unmodified physical landing matches the independently
  // sampled fair result. No end-of-animation rotation or face swapping is used.
  async function planThrow(start,face,{random=Math.random,yieldControl=()=>Promise.resolve(),isCancelled=()=>false}={}) {
    if (!Number.isInteger(face)||face<1||face>6) throw new RangeError('Die face must be 1–6');
    for (let attempt=0;attempt<180;attempt++) {
      if(isCancelled())throw new Error('Throw cancelled');
      const trajectory=simulate(start,randomLaunch(start,random));
      if (trajectory.settled && trajectory.inBounds && trajectory.face===face && trajectory.maxClearance>.18) return {...withHorizontalSpin(trajectory),attempts:attempt+1};
      await yieldControl();
    }
    throw new Error('Could not prepare a settled throw');
  }
  globalThis.EonDicePhysics={STEP,GRAVITY,INNER,RADIUS,HALF:INNER+RADIUS,LAUNCH_SPIN_SPEED,advance,simulate,planThrow,randomLaunch,supportHeight,upward};
})();

}
