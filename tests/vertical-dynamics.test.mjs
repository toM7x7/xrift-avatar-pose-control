import test from 'node:test'
import assert from 'node:assert/strict'
import {createRideDynamics,stepRideDynamics} from '../src/ride-dynamics.mjs'
const noVerticalDrag={verticalDrag:0,verticalQuadraticDrag:0},run=(s,input,seconds,dt=1/60)=>{for(let t=0;t<seconds-1e-10;t+=dt)s=stepRideDynamics(s,input,Math.min(dt,seconds-t));return s},finiteTree=o=>typeof o==='number'?Number.isFinite(o):o&&typeof o==='object'?Object.values(o).every(finiteTree):true

test('hover compensation holds height, preserves signed initial vertical speed and integrates height at constant speed',()=>{
 const hover=run(createRideDynamics({initialPosition:[0,5,0]}),{},3);assert.equal(hover.position[1],5);assert.equal(hover.velocity[1],0);assert.equal(hover.pose.normalLoadRatio,1);assert.equal(hover.pose.verticalCompression,0)
 for(const vy of [-2,2]){const initial=createRideDynamics({...noVerticalDrag,initialPosition:[0,5,0],initialVelocity:[0,vy,0]}),s=run(initial,{},2);assert.equal(initial.velocity[1],vy);assert.ok(Math.abs(s.position[1]-(5+vy*2))<1e-10);assert.equal(s.pose.verticalSpeed,vy);assert.equal(s.pose.verticalAcceleration,0);assert.equal(s.pose.normalLoadRatio,1);assert.equal(s.pose.verticalCompression,0);assert.equal(s.pose.supportState,'supported')}
})
test('vertical velocity and acceleration are independent: four signed cases use the acceleration to classify load',()=>{
 for(const vy of [-2,2])for(const lift of [-1,1]){
  const s=stepRideDynamics(createRideDynamics({...noVerticalDrag,initialVelocity:[0,vy,0]}),{lift},.1)
  assert.ok(Math.abs(s.pose.verticalAcceleration-lift*3)<1e-10);assert.equal(Math.sign(s.pose.verticalSpeed),Math.sign(vy));assert.ok(Math.abs(s.pose.normalLoadRatio-(1+lift*3/9.81))<1e-10);assert.equal(Math.sign(s.pose.verticalCompression),lift);assert.equal(s.pose.supportState,'supported');assert.ok(s.pose.zmpValid)
 }
})
test('lift adds force over gravity compensation and mass changes net vertical acceleration without mutating config or input',()=>{
 const initial=createRideDynamics({...noVerticalDrag}),before=structuredClone(initial),input={lift:1},normal=stepRideDynamics(initial,input,.1),heavy=stepRideDynamics(createRideDynamics({...noVerticalDrag,mass:160}),input,.1)
 assert.deepEqual(initial,before);assert.deepEqual(input,{lift:1});assert.equal(initial.config.liftForceUp,240);assert.ok(Math.abs(normal.pose.verticalAcceleration-3)<1e-10);assert.ok(Math.abs(heavy.pose.verticalAcceleration-1.5)<1e-10);assert.ok(Object.isFrozen(initial.config))
})
test('upward braking unloads, downward braking compresses, and both stop and recover at hover',()=>{
 for(const vy of [-2,2]){const initial=createRideDynamics({...noVerticalDrag,initialVelocity:[0,vy,0]}),braking=stepRideDynamics(initial,{brake:1},.1);assert.equal(Math.sign(braking.pose.verticalAcceleration),-Math.sign(vy));assert.equal(Math.sign(braking.pose.verticalCompression),-Math.sign(vy));const stopped=run(braking,{brake:1},3);assert.equal(stopped.pose.verticalSpeed,0);assert.equal(stopped.pose.verticalAcceleration,0);assert.equal(stopped.pose.normalLoadRatio,1);assert.ok(Math.abs(stopped.pose.verticalCompression)<1e-6);assert.equal(stopped.pose.supportState,'supported')}
})
test('positive normal load uses effective gravity for horizontal ZMP and COM equilibrium',()=>{
 const s=run(createRideDynamics({...noVerticalDrag,linearDrag:0,quadraticDrag:0}),{throttle:1,lift:1},3),g=s.pose.effectiveGravityMps2
 assert.ok(Math.abs(g-12.81)<1e-10);assert.ok(Math.abs(s.pose.zeroMomentPoint.forward-(s.pose.centerOfMassOffset.forward-s.pose.comHeightM/g*s.pose.forwardAcceleration))<1e-10);assert.ok(Math.abs(s.pose.centerOfMassOffset.forward-s.pose.comHeightM/g*s.pose.forwardAcceleration)<1e-5);assert.ok(Math.abs(s.pose.loadRatio.front-.5)<1e-5)
 const horizontal=run(createRideDynamics({...noVerticalDrag,linearDrag:0,quadraticDrag:0}),{throttle:1},3);assert.ok(s.pose.balanceLeanForward<horizontal.pose.balanceLeanForward)
})
test('near-zero and negative normal loads invalidate pressure/ZMP and do not turn adhesion into heavy crouching',()=>{
 for(const [downAcceleration,expectedState,reason]of [[9.81,'low-load','low-normal-load'],[9.5,'low-load','low-normal-load'],[12,'adhesion','negative-normal-load']]){
  const s=run(createRideDynamics({...noVerticalDrag,liftForceDown:80*downAcceleration}),{throttle:.5,lift:-1},.2)
  assert.equal(s.pose.supportState,expectedState);assert.equal(s.pose.zmpValid,false);assert.equal(s.pose.zmpInvalidReason,reason);for(const key of ['zeroMomentPoint','loadRatio','unclampedLoadRatio','supportMarginM','supportExceeded'])assert.equal(s.pose[key],null);assert.ok(s.pose.verticalCompression<=0&&s.pose.verticalCompression>=-.12);assert.ok(finiteTree(s));if(expectedState==='adhesion')assert.ok(s.pose.normalLoadRatio<0)
 }
})
test('support hysteresis suppresses boundary toggles, requires a recovery hold and enters adhesion immediately',()=>{
 const cfg={...noVerticalDrag,liftForceDown:80*10},liftForRatio=n=>(n-1)*9.81/10
 let s=stepRideDynamics(createRideDynamics(cfg),{lift:liftForRatio(.1)},1/60);assert.equal(s.pose.supportState,'low-load')
 for(const n of [.18,.23,.16,.24]){s=stepRideDynamics(s,{lift:liftForRatio(n)},1/60);assert.equal(s.pose.supportState,'low-load')}
 s=stepRideDynamics(s,{lift:0},.04);assert.equal(s.pose.supportState,'low-load');assert.equal(s.pose.zmpInvalidReason,'support-recovery-pending');s=stepRideDynamics(s,{lift:0},.05);assert.equal(s.pose.supportState,'supported');assert.equal(s.pose.zmpValid,true)
 s=stepRideDynamics(s,{lift:-1},1/240);assert.equal(s.pose.supportState,'adhesion');assert.equal(s.pose.zmpValid,false)
})
test('vertical force release uses drag, brake actively stops, and nonfinite lift remains finite',()=>{
 const coast=stepRideDynamics(createRideDynamics({initialVelocity:[0,2,0]}),{},.1);assert.ok(coast.pose.verticalSpeed>0&&coast.pose.verticalSpeed<2);const brake=stepRideDynamics(createRideDynamics({initialVelocity:[0,2,0]}),{brake:1},.1);assert.ok(brake.pose.verticalSpeed<coast.pose.verticalSpeed)
 const invalid=stepRideDynamics(createRideDynamics(),{lift:NaN},.1);assert.equal(invalid.pose.verticalSpeed,0);assert.ok(finiteTree(invalid))
})
test('vertical launch coast brake and support/compression recovery agree at 30/60/120fps',()=>{
 const scenario=dt=>{let s=createRideDynamics({initialPosition:[0,4,0]});for(const [input,seconds]of [[{throttle:1,lift:1},1],[{throttle:.5,lift:0},.5],[{steer:.5,lift:-1},.7],[{brake:1},2]])s=run(s,input,seconds,dt);return s},a=scenario(1/30),b=scenario(1/60),c=scenario(1/120)
 for(const s of [b,c]){assert.ok(Math.hypot(...s.position.map((v,i)=>v-a.position[i]))<.005);assert.ok(Math.abs(s.pose.verticalCompression-a.pose.verticalCompression)<1e-4);assert.equal(s.pose.supportState,a.pose.supportState);assert.ok(finiteTree(s))}
})
test('zero lift preserves horizontal regression values and the flat crouch remains separate from vertical compression',()=>{
 const s=run(createRideDynamics(),{throttle:1,lift:0},2);assert.ok(Math.abs(s.position[2]-4.387222252048112)<1e-10);assert.ok(Math.abs(s.pose.speed-3.5663427684140787)<1e-10);assert.equal(s.position[1],0);assert.equal(s.pose.verticalCompression,0)
 const lift=run(createRideDynamics({...noVerticalDrag}),{lift:1},.3);assert.equal(lift.pose.crouch,.45);assert.ok(lift.pose.verticalCompression>0);assert.ok(lift.pose.totalSpeed>lift.pose.speed)
})
