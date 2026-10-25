import test from 'node:test'
import assert from 'node:assert/strict'
import {Quaternion,Vector3} from 'three'
import {createRideDynamics,stepRideDynamics} from '../src/ride-dynamics.mjs'
const run=(s,input,seconds,dt=1/60)=>{for(let t=0;t<seconds-1e-10;t+=dt)s=stepRideDynamics(s,input,Math.min(dt,seconds-t));return s},finiteTree=o=>typeof o==='number'?Number.isFinite(o):o&&typeof o==='object'?Object.values(o).every(finiteTree):true,dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),v=a=>new Vector3(...a)

test('attitude is opt-in and disabled support stays yaw-only with original movement numbers',()=>{
 const s=run(createRideDynamics(),{throttle:1},2);assert.equal(s.config.attitudeEnabled,false);assert.equal(s.attitude.pitch,0);assert.equal(s.attitude.roll,0);assert.deepEqual(s.supportFrame.normal,[0,1,0]);assert.ok(Math.abs(s.position[2]-4.387222252048112)<1e-10);assert.ok(Math.abs(s.pose.speed-3.5663427684140787)<1e-10)
 const turned=run(createRideDynamics({initialVelocity:[0,0,3]}),{throttle:.6,steer:.7},1),expected=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),turned.heading);assert.ok(new Quaternion(...turned.supportQuaternion).angleTo(expected)<1e-7);assert.ok(Math.abs(turned.pose.tangentLateralAcceleration-turned.pose.lateralAcceleration)<1e-10)
})
test('up/down flight gives public nose-up/down pitch and preserves yaw during vertical-only movement',()=>{
 for(const sign of [-1,1]){const s=run(createRideDynamics({attitudeEnabled:true,initialHeading:.73}),{lift:sign},1.2);assert.equal(Math.sign(s.attitude.pitch),sign);assert.equal(Math.sign(s.supportFrame.forward[1]),sign);assert.ok(Math.abs(s.heading-.73)<1e-10);assert.ok(Math.abs(s.attitude.pitch)<=s.config.pitchLimitRadians);assert.ok(Math.abs(s.attitude.roll)<1e-10)}
})
test('left/right turns mirror bank and normal axes while support quaternions obey the public rotation order',()=>{
 const cfg={attitudeEnabled:true,initialVelocity:[0,0,3]},right=run(createRideDynamics(cfg),{throttle:.6,steer:.7},1.4),left=run(createRideDynamics(cfg),{throttle:.6,steer:-.7},1.4)
 assert.ok(right.attitude.roll>0);assert.ok(left.attitude.roll<0);assert.ok(Math.abs(right.attitude.roll+left.attitude.roll)<1e-10);assert.ok(Math.abs(right.supportFrame.normal[0]+left.supportFrame.normal[0])<1e-10)
 const expected=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),right.heading).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-right.attitude.pitch)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-right.attitude.roll));assert.ok(new Quaternion(...right.supportQuaternion).angleTo(expected)<1e-7)
})
test('tilt is a support attitude and does not create a second movement integrator or mutate its input',()=>{
 const cfg={initialVelocity:[0,0,2]},flatInitial=createRideDynamics(cfg),tiltInitial=createRideDynamics({...cfg,attitudeEnabled:true}),before=structuredClone(tiltInitial),flat=run(flatInitial,{throttle:.8,steer:.5,lift:.6},2),tilt=run(tiltInitial,{throttle:.8,steer:.5,lift:.6},2)
 assert.deepEqual(tiltInitial,before);assert.deepEqual(tilt.position,flat.position);assert.deepEqual(tilt.velocity,flat.velocity);assert.equal(tilt.heading,flat.heading);assert.equal(tilt.pose.rotationalPointAccelerationIncluded,false)
})
test('normal load, tangent demand, ZMP and compression use the same tilted support frame',()=>{
 const s=run(createRideDynamics({attitudeEnabled:true,initialVelocity:[0,2,0],verticalDrag:0,verticalQuadraticDrag:0}),{},3),required=[s.acceleration[0],s.acceleration[1]+s.config.gravity,s.acceleration[2]],p=s.pose
 assert.ok(Math.abs(p.effectiveGravityMps2-dot(required,s.supportFrame.normal))<1e-10);assert.ok(Math.abs(p.tangentForwardAcceleration-dot(required,s.supportFrame.forward))<1e-10);assert.ok(Math.abs(p.tangentLateralAcceleration-dot(required,s.supportFrame.right))<1e-10);assert.ok(Math.abs(p.normalLoadRatio-p.effectiveGravityMps2/s.config.gravity)<1e-10)
 assert.equal(p.forwardAcceleration,0);assert.ok(p.tangentForwardAcceleration>3);assert.ok(Math.abs(p.zeroMomentPoint.forward-(p.centerOfMassOffset.forward-p.comHeightM/p.effectiveGravityMps2*p.tangentForwardAcceleration))<1e-10);assert.ok(Math.abs(p.zeroMomentPoint.forward)<1e-5);assert.ok(p.verticalCompression<0)
})
test('angle limits, angular rates and frame orthonormality remain bounded during force reversals',()=>{
 let s=createRideDynamics({attitudeEnabled:true,pitchLimitRadians:12*Math.PI/180,rollLimitRadians:18*Math.PI/180,attitudeMaxRate:.4,initialVelocity:[0,0,6]})
 for(let i=0;i<240;i++){s=stepRideDynamics(s,{throttle:1,steer:i<120?1:-1,lift:i<120?1:-1},1/60);const a=s.attitude;assert.ok(Math.abs(a.pitch)<=s.config.pitchLimitRadians+1e-10);assert.ok(Math.abs(a.roll)<=s.config.rollLimitRadians+1e-10);assert.ok(Math.abs(a.pitchRate)<=.4+1e-10);assert.ok(Math.abs(a.rollRate)<=.4+1e-10);assert.ok(a.angularSpeed<=a.angularSpeedLimit+1e-5);assert.ok(Math.abs(new Quaternion(...s.supportQuaternion).length()-1)<1e-10);assert.ok(Math.abs(v(s.supportFrame.normal).dot(v(s.supportFrame.right)))<1e-10);assert.ok(v(s.supportFrame.right).clone().cross(v(s.supportFrame.normal)).distanceTo(v(s.supportFrame.forward))<1e-10);assert.ok(finiteTree(s))}
})
test('braking to hover returns pitch, bank, COM and rates to rest without yaw reset',()=>{
 let s=run(createRideDynamics({attitudeEnabled:true}),{throttle:1,lift:1,steer:.5},2);assert.ok(Math.abs(s.attitude.pitch)>0);assert.ok(Math.abs(s.attitude.roll)>0);s=run(s,{brake:1},6);assert.equal(s.pose.totalSpeed,0);assert.ok(Math.abs(s.attitude.pitch)<1e-5);assert.ok(Math.abs(s.attitude.roll)<1e-5);assert.ok(Math.abs(s.attitude.pitchRate)<1e-5);assert.ok(Math.abs(s.attitude.rollRate)<1e-5);assert.ok(Math.abs(s.pose.centerOfMassOffset.forward)<1e-5);assert.ok(Math.abs(s.pose.centerOfMassOffset.side)<1e-5);assert.equal(s.pose.supportState,'supported')
})
test('tilted low/negative loads still return null ZMP with explicit reasons and recover',()=>{
 let s=run(createRideDynamics({attitudeEnabled:true,liftForceDown:1600,verticalDrag:0,verticalQuadraticDrag:0}),{lift:-1,throttle:.5},.2);assert.equal(s.pose.supportState,'adhesion');assert.equal(s.pose.zmpValid,false);assert.equal(s.pose.zeroMomentPoint,null);assert.equal(s.pose.loadRatio,null);assert.equal(s.pose.zmpInvalidReason,'negative-normal-load');s=run(s,{},.5);assert.equal(s.pose.supportState,'supported');assert.ok(s.pose.zmpValid);assert.ok(finiteTree(s))
})
test('attitude and projected demand agree at 30/60/120fps for a scripted 3D course',()=>{
 const course=dt=>{let s=createRideDynamics({attitudeEnabled:true});for(const [input,seconds]of [[{throttle:1,lift:1},1],[{throttle:.5,steer:.6},1],[{steer:-.6,lift:-1},1],[{brake:1},2]])s=run(s,input,seconds,dt);return s},a=course(1/30),b=course(1/60),c=course(1/120)
 for(const s of [b,c]){assert.ok(Math.hypot(...s.position.map((p,i)=>p-a.position[i]))<.005);assert.ok(new Quaternion(...s.supportQuaternion).angleTo(new Quaternion(...a.supportQuaternion))<.001);assert.ok(Math.abs(s.pose.normalLoadRatio-a.pose.normalLoadRatio)<1e-4);assert.ok(finiteTree(s))}
})
