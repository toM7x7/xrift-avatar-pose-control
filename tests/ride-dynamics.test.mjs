import test from 'node:test'
import assert from 'node:assert/strict'
import {createRideDynamics,stepRideDynamics} from '../src/ride-dynamics.mjs'
const run=(state,controls,seconds,dt=1/60)=>{let next=state;for(let time=0;time<seconds-1e-10;time+=dt)next=stepRideDynamics(next,controls,Math.min(dt,seconds-time));return next}
const allFinite=value=>typeof value==='number'?Number.isFinite(value):value&&typeof value==='object'?Object.values(value).every(allFinite):true

test('drive force and mass govern acceleration, and the pure step does not mutate inputs',()=>{
 const initial=createRideDynamics({linearDrag:0,quadraticDrag:0}),snapshot=structuredClone(initial),controls={throttle:1,steer:0,brake:0},next=stepRideDynamics(initial,controls,1/60),heavy=stepRideDynamics(createRideDynamics({mass:160,linearDrag:0,quadraticDrag:0}),controls,1/60)
 assert.deepEqual(initial,snapshot);assert.deepEqual(controls,{throttle:1,steer:0,brake:0});assert.ok(Math.abs(next.pose.forwardAcceleration-260/80)<1e-10);assert.ok(Math.abs(heavy.pose.forwardAcceleration-next.pose.forwardAcceleration/2)<1e-10);assert.ok(next.position[2]>0);assert.ok(next.pose.centerOfMassOffset.forward>0)
})
test('launch and braking reverse acceleration and COM response, then braking reaches a stable stop',()=>{
 const launched=run(createRideDynamics(),{throttle:1},2);assert.ok(launched.pose.forwardAcceleration>0);assert.ok(launched.pose.balanceLeanForward>0)
 const braking=run(launched,{brake:1},.4);assert.ok(braking.pose.forwardAcceleration<0);assert.ok(braking.pose.targetLeanForward<0);assert.ok(braking.pose.centerOfMassOffset.forward<0);assert.ok(braking.velocity[2]>=0)
 const stopped=run(braking,{brake:1},3);assert.equal(stopped.pose.speed,0);assert.ok(Math.abs(stopped.pose.balanceLeanForward)<1e-5);assert.ok(Math.abs(stopped.pose.balanceLeanSide)<1e-8);assert.equal(stopped.pose.forwardAcceleration,0);assert.equal(stopped.pose.crouch,.45)
})
test('left and right turns from identical speed give mirrored actual acceleration and balance',()=>{
 const initial=createRideDynamics({initialVelocity:[0,0,3]}),right=run(initial,{throttle:.6,steer:.7},1),left=run(initial,{throttle:.6,steer:-.7},1)
 assert.ok(right.pose.lateralAcceleration>0);assert.ok(left.pose.lateralAcceleration<0);assert.ok(right.pose.balanceLeanSide>0);assert.ok(left.pose.balanceLeanSide<0);assert.ok(Math.abs(right.position[0]+left.position[0])<1e-8);assert.ok(Math.abs(right.position[2]-left.position[2])<1e-8);assert.ok(Math.abs(right.pose.lateralAcceleration+left.pose.lateralAcceleration)<1e-8)
})
test('constant velocity without force produces no acceleration-driven pose oscillation',()=>{
 const s=run(createRideDynamics({initialVelocity:[0,0,4],linearDrag:0,quadraticDrag:0}),{},8)
 assert.ok(Math.abs(s.pose.speed-4)<1e-10);assert.equal(s.pose.forwardAcceleration,0);assert.equal(s.pose.lateralAcceleration,0);assert.equal(s.pose.balanceLeanForward,0);assert.equal(s.pose.balanceLeanSide,0);assert.equal(s.pose.crouch,.45);assert.deepEqual(s.pose.loadRatio,{front:.5,rear:.5,right:.5,left:.5})
})
test('drag dissipates speed without input and the balance response converges after stopping',()=>{
 const s=run(createRideDynamics({initialVelocity:[0,0,4]}),{},20);assert.equal(s.pose.speed,0);assert.ok(Math.abs(s.pose.balanceLeanForward)<1e-5);assert.ok(Math.abs(s.pose.balanceLeanSide)<1e-8)
})
test('near-identical scripted launch turn brake results across common frame rates',()=>{
 const scenario=dt=>{let s=createRideDynamics();for(const [input,seconds]of [[{throttle:1},2],[{throttle:.5,steer:.6},2],[{brake:1},1.5]])s=run(s,input,seconds,dt);return s},a=scenario(1/30),b=scenario(1/60),c=scenario(1/120)
 for(const s of [b,c]){assert.ok(Math.hypot(s.position[0]-a.position[0],s.position[2]-a.position[2])<.005);assert.ok(Math.abs(s.heading-a.heading)<.001);assert.ok(Math.abs(s.pose.balanceLeanForward-a.pose.balanceLeanForward)<.002)}
})
test('spring COM and acceleration determine approximate ZMP loads and expose support exceedance',()=>{
 const s=stepRideDynamics(createRideDynamics({linearDrag:0,quadraticDrag:0,supportHalfLengthM:.05}),{throttle:1},1/60),z=s.pose.centerOfMassOffset.forward-s.pose.comHeightM/9.81*s.pose.forwardAcceleration
 assert.ok(Math.abs(s.pose.zeroMomentPoint.forward-z)<1e-10);assert.equal(s.pose.supportExceeded,true);assert.ok(s.pose.supportMarginM<0);assert.equal(s.pose.loadRatio.front,0);assert.equal(s.pose.loadRatio.rear,1);assert.ok(s.pose.unclampedLoadRatio.front<0)
 const settled=run(createRideDynamics({linearDrag:0,quadraticDrag:0}),{throttle:1},3);assert.ok(Math.abs(settled.pose.zeroMomentPoint.forward)<1e-5);assert.ok(Math.abs(settled.pose.loadRatio.front-.5)<1e-5)
})
test('nonfinite controls and dt remain finite; catch-up limits are explicitly reported',()=>{
 let s=createRideDynamics({mass:NaN,initialHeading:Infinity,initialVelocity:[NaN,0,0]});s=stepRideDynamics(s,{throttle:NaN,steer:Infinity,brake:-Infinity},NaN);assert.ok(allFinite(s));assert.equal(s.time,0)
 const next=stepRideDynamics(s,{throttle:1},10);assert.equal(next.integratedDt,2);assert.equal(next.discardedDt,8);assert.ok(allFinite(next));const unchanged=stepRideDynamics(next,{},-1);assert.equal(unchanged.time,next.time);assert.ok(allFinite(unchanged))
})
test('initial heading is explicit and huge valid tuning values are bounded to a stable finite model',()=>{
 const right=stepRideDynamics(createRideDynamics({heading:Math.PI/2}),{throttle:1},.1);assert.ok(right.position[0]>0);assert.ok(Math.abs(right.position[2])<1e-8)
 const extreme=run(createRideDynamics({mass:1,driveForce:1e100,lateralGrip:1e100,comNaturalFrequency:1e100,comDampingRatio:1e100}),{throttle:1,steer:1},2);assert.ok(allFinite(extreme));assert.equal(extreme.config.comNaturalFrequency,20)
})
test('observed COM height converges smoothly while immutable configuration stays at its calibrated initial value',()=>{
 const initial=createRideDynamics({comHeightM:.75}),snapshot=structuredClone(initial),one=stepRideDynamics(initial,{observedComHeightM:.5},.25)
 assert.ok(Math.abs(one.estimatedComHeightM-(.5+.25*Math.exp(-1)))<1e-10);assert.equal(one.config.comHeightM,.75);assert.equal(one.pose.comHeightM,one.estimatedComHeightM);assert.equal(one.heightObservationStatus,'accepted');assert.deepEqual(initial,snapshot)
 const settled=run(one,{throttle:1,observedComHeightM:.5},3);assert.ok(Math.abs(settled.estimatedComHeightM-.5)<1e-5);assert.ok(Math.abs(settled.pose.zeroMomentPoint.forward-(settled.pose.centerOfMassOffset.forward-settled.estimatedComHeightM/9.81*settled.pose.forwardAcceleration))<1e-10)
 const held=run(settled,{},1);assert.equal(held.estimatedComHeightM,settled.estimatedComHeightM);assert.equal(held.heightObservationStatus,'none')
})
test('height feedback ignores nonfinite observations and reports bounded extreme observations and initialization',()=>{
 const initial=createRideDynamics({comHeightM:.69}),ignored=stepRideDynamics(initial,{observedComHeightM:NaN},1);assert.equal(ignored.estimatedComHeightM,.69);assert.equal(ignored.heightObservationStatus,'ignored-nonfinite');assert.equal(ignored.observedComHeightM,null)
 const low=run(initial,{observedComHeightM:-10},2),high=run(initial,{observedComHeightM:1e10},2);assert.ok(low.estimatedComHeightM>=.2&&low.estimatedComHeightM<.201);assert.ok(high.estimatedComHeightM<=2&&high.estimatedComHeightM>1.999);assert.equal(low.heightObservationStatus,'clamped');assert.equal(high.heightObservationStatus,'clamped');assert.equal(createRideDynamics({comHeightM:.001}).estimatedComHeightM,.2);assert.equal(createRideDynamics({comHeightM:100}).estimatedComHeightM,2);assert.ok(allFinite(high))
})
test('one-frame delayed synthetic height feedback remains bounded and agrees across frame rates',()=>{
 const simulate=dt=>{let s=createRideDynamics({comHeightM:.75,linearDrag:0,quadraticDrag:0}),maxOffset=0;for(let t=0;t<5-1e-9;t+=dt){const observed=.75-.45*Math.abs(s.pose.centerOfMassOffset.forward);s=stepRideDynamics(s,{throttle:1,observedComHeightM:observed},dt);maxOffset=Math.max(maxOffset,Math.abs(s.pose.centerOfMassOffset.forward));assert.ok(allFinite(s));assert.ok(s.estimatedComHeightM>=.2&&s.estimatedComHeightM<=.75)}return {s,maxOffset}},a=simulate(1/30),b=simulate(1/60),c=simulate(1/120),equilibrium=.75/(1+.45*3.25/9.81)
 for(const result of [a,b,c]){assert.ok(Math.abs(result.s.estimatedComHeightM-equilibrium)<1e-4);assert.ok(result.maxOffset<.3);assert.ok(Math.abs(result.s.pose.zeroMomentPoint.forward)<1e-4)}assert.ok(Math.abs(a.s.estimatedComHeightM-c.s.estimatedComHeightM)<1e-4)
})
test('launch then braking with lower observed height stops and returns COM and lean to zero',()=>{
 const launched=run(createRideDynamics({comHeightM:.75}),{throttle:1,observedComHeightM:.69},2),braking=run(launched,{brake:1,observedComHeightM:.5},.4),stopped=run(braking,{brake:1,observedComHeightM:.69},4)
 assert.ok(braking.pose.balanceLeanForward<0);assert.ok(braking.estimatedComHeightM<launched.estimatedComHeightM);assert.equal(stopped.pose.speed,0);assert.ok(Math.abs(stopped.pose.centerOfMassOffset.forward)<1e-6);assert.ok(Math.abs(stopped.pose.balanceLeanForward)<1e-6);assert.ok(Math.abs(stopped.estimatedComHeightM-.69)<1e-6);assert.ok(Math.abs(stopped.pose.loadRatio.front-.5)<1e-6)
})
