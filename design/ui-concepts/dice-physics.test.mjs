// Run with: node design/ui-concepts/dice-physics.test.mjs
import assert from 'node:assert/strict';
import './dice-physics.js';

const physics=globalThis.EonDicePhysics;
const identity=[0,0,0,1];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

// Free flight follows gravity and constant horizontal momentum.
const flight={p:[0,4,0],q:identity.slice(),v:[1,0,2],w:[0,0,0]};
for(let i=0;i<12;i++)assert.equal(physics.advance(flight,physics.STEP),0);
assert.ok(Math.abs(flight.p[0]-12*physics.STEP)<1e-10);
assert.ok(Math.abs(flight.p[2]-24*physics.STEP)<1e-10);
assert.ok(Math.abs(flight.p[1]-(4-physics.GRAVITY*physics.STEP**2*12*13/2))<1e-10);

// A vertical drop rebounds at contact, then rests on the same plane.
const dropped=physics.simulate({p:[0,3,0],q:identity},{v:[0,0,0],w:[0,0,0]});
assert.ok(dropped.settled);
assert.ok(dropped.frames.some(f=>f.time>dropped.firstImpact && f.v[1]>.5));
assert.ok(Math.abs(dropped.frames.at(-1).p[1]-physics.HALF)<.01);

// Surface friction dissipates horizontal motion instead of preserving a spin loop.
const slid=physics.simulate({p:[0,physics.HALF,0],q:identity},{v:[3,0,0],w:[0,0,0]});
assert.ok(slid.settled);
assert.ok(slid.frames.at(-1).p[0]>.1);
assert.ok(Math.hypot(...slid.frames.at(-1).v)<.045);
assert.ok(Math.hypot(...slid.frames.at(-1).w)<.065);

let seed=1729;
const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
let pose={p:[0,physics.HALF,.65],q:identity};
const timings=[],attempts=[];
for(let roll=0;roll<120;roll++){
  const requested=roll%6+1;
  const trajectory=await physics.planThrow(pose,requested,{random});
  const {frames}=trajectory,final=frames.at(-1);
  assert.ok(trajectory.settled && trajectory.inBounds);
  assert.equal(trajectory.face,requested);
  assert.equal(physics.upward(final.q).value,requested);
  assert.ok(trajectory.alignment>.999);
  assert.ok(trajectory.maxClearance>.18);
  assert.deepEqual(frames[0].p,pose.p,'A new throw must start where the last one stopped');
  assert.deepEqual(frames[0].q,pose.q);
  assert.ok(Math.abs(Math.hypot(...frames[0].w)-45)<1e-8,'Release speed must be fixed at 3 × 15 rad/s');
  assert.ok(frames[0].w[1]>Math.hypot(frames[0].w[0],frames[0].w[2])*2,'Spin must primarily be horizontal');
  assert.ok(Math.hypot(...final.w)<.065,'The horizontal spin must stop before showing the result');
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    assert.ok(f.p.every(Number.isFinite) && f.q.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...f.q)-1)<1e-8);
    assert.ok(f.p[1]-physics.supportHeight(f.q)>=-.0011,'Die penetrated the plane');
    if(i){
      assert.ok(distance(f.p,frames[i-1].p)<.13,'Position jumped');
      const alignment=Math.abs(f.q.reduce((sum,v,k)=>sum+v*frames[i-1].q[k],0));
      assert.ok(2*Math.acos(Math.min(1,alignment))<.3,'Orientation snapped');
    }
  }
  timings.push(final.time);attempts.push(trajectory.attempts);
  pose={p:final.p,q:final.q};
}
export const summary={
  physicalChecks:['ballistic flight','collision rebound','surface friction'],
  consecutiveThrows:timings.length,
  durationSeconds:[Math.min(...timings),Math.max(...timings)],
  maxPlanningAttempts:Math.max(...attempts),
};
console.log('Dice physics checks passed',summary);
