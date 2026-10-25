import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Quaternion,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {prepareHumanoidRig} from '../src/index.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {applyNimbusPose} from '../src/nimbus-pose.mjs'
function sample(scale=1){const f=createPoseFixture(),root=new Group(),scene=new Scene();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);scene.updateMatrixWorld(true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones});f.seated(0);return {f,root,rig,snapshot:captureBones(f.skeleton)}}
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`)

test('support stance distributes yaw through pelvis, chest and neck instead of assigning ninety degrees to the head',()=>{
 for(const scale of [.65,1,1.35]){
  const {f,rig}=sample(scale),result=applyNimbusPose(rig,{anchorMode:'support'}),body=result.bodyBalance
  close(body.pelvisYawDegrees,50);close(body.chestYawDegrees,20);close(body.hipChestYawDegrees,30);close(body.neckYawDegrees,8);assert.equal(body.footYawDegrees,62);assert.equal(body.neckPolicyExceeded,false)
  assert.ok(result.headDriftMm>10*scale);assert.ok(result.headRotationErrorDegrees<.001);assert.ok(result.footTargetErrorMm<.001);assert.ok(result.contactPlaneErrorMm<.001);assert.ok(result.balanceProxy.centerOfMassErrorMm<.01)
  f.dispose()
 }
})
test('acceleration, braking and turning move actual hips and center of mass while the same supplied foot anchors stay fixed',()=>{
 const {f,rig,snapshot}=sample(),initial=applyNimbusPose(rig,{anchorMode:'support'}),anchors=structuredClone(initial.footTargetsWorld),unchanged=structuredClone(anchors),samples=[]
 for(const balance of [{leanForward:.15,centerOfMassOffset:{forward:.08,side:0},forwardAcceleration:1.5},{leanForward:-.15,centerOfMassOffset:{forward:-.08,side:0},forwardAcceleration:-1.5},{leanSide:.12,centerOfMassOffset:{forward:0,side:.05},lateralAcceleration:1},{leanSide:-.12,centerOfMassOffset:{forward:0,side:-.05},lateralAcceleration:-1}]){
  restoreBones(snapshot);const result=applyNimbusPose(rig,{anchorMode:'support',footTargetsWorld:anchors,balance});samples.push(result)
  assert.deepEqual(result.footTargetsWorld,anchors);assert.deepEqual(anchors,unchanged);assert.ok(result.footTargetErrorMm<.001);assert.ok(result.contactPlaneErrorMm<.001);assert.ok(result.headRotationErrorDegrees<.001);assert.ok(result.boneLengthErrorMm<.001);assert.ok(result.balanceProxy.centerOfMassErrorMm<.02)
  assert.ok(Math.abs(result.knees[0]-result.knees[1])>3);assert.ok(result.armBalance.every(arm=>arm.boneLengthErrorMm<.001))
 }
 assert.ok(samples[0].bodyBalance.hipsWorld[2]>samples[1].bodyBalance.hipsWorld[2]+.1);assert.ok(samples[2].bodyBalance.hipsWorld[0]>samples[3].bodyBalance.hipsWorld[0]+.05);assert.ok(samples[0].balanceProxy.centerOfMassOffset.forward>.079);assert.ok(samples[1].balanceProxy.centerOfMassOffset.forward<-.079)
 f.dispose()
})
test('head priority retains host head position and honestly leaves a requested center-of-mass offset unsatisfied',()=>{
 const {f,rig,snapshot}=sample(),initial=applyNimbusPose(rig,{anchorMode:'support'}),options={footTargetsWorld:initial.footTargetsWorld,balance:{leanForward:.15,centerOfMassOffset:{forward:.08,side:0}}}
 restoreBones(snapshot);const head=applyNimbusPose(rig,{...options,anchorMode:'head'});restoreBones(snapshot);const support=applyNimbusPose(rig,{...options,anchorMode:'support'})
 assert.ok(head.headDriftMm<.001);assert.ok(head.balanceProxy.centerOfMassErrorMm>30);assert.ok(support.headDriftMm>50);assert.ok(support.balanceProxy.centerOfMassErrorMm<.02);assert.ok(head.headRotationErrorDegrees<.001&&support.headRotationErrorDegrees<.001);f.dispose()
})
test('large head turns adapt the chest within its policy and flag the remaining neck conflict without overriding head tracking',()=>{
 const {f,rig}=sample();f.bones.head.rotation.y=Math.PI;f.mesh.updateWorldMatrix(true,true);const headQ=f.bones.head.getWorldQuaternion(new Quaternion()),result=applyNimbusPose(rig,{anchorMode:'support'})
 assert.ok(result.bodyBalance.chestYawDegrees>90);assert.ok(result.bodyBalance.hipChestYawDegrees<=45.001);assert.equal(result.bodyBalance.chestPolicyLimited,true);assert.equal(result.bodyBalance.neckPolicyExceeded,true);assert.ok(result.poseLimitReasons.includes('head-torso-yaw-conflict'));assert.ok(f.bones.head.getWorldQuaternion(new Quaternion()).angleTo(headQ)<1e-7);f.dispose()
})
test('far foot targets and extreme COM goals report misses instead of stretching limbs, clamping away the goal, or moving the anchors',()=>{
 const {f,rig,snapshot}=sample(),initial=applyNimbusPose(rig,{anchorMode:'support'}),targets=structuredClone(initial.footTargetsWorld);targets[0][2]-=5;targets[1][2]+=5
 restoreBones(snapshot);const result=applyNimbusPose(rig,{anchorMode:'support',footTargetsWorld:targets,balance:{centerOfMassOffset:{forward:10,side:0}}})
 assert.deepEqual(result.footTargetsWorld,targets);assert.ok(result.footTargetErrorMm>1000);assert.ok(result.balanceProxy.centerOfMassErrorMm>8000);assert.ok(result.poseLimitReasons.includes('foot-target-out-of-reach'));assert.ok(result.poseLimitReasons.includes('center-of-mass-target-unmet'));assert.ok(result.boneLengthErrorMm<.001);assert.ok(result.headRotationErrorDegrees<.001);f.dispose()
})
test('load and support diagnostics derive from the posed COM proxy and acceleration rather than echoing requested load',()=>{
 const {f,rig,snapshot}=sample(),initial=applyNimbusPose(rig,{anchorMode:'support'});restoreBones(snapshot)
 const result=applyNimbusPose(rig,{anchorMode:'support',footTargetsWorld:initial.footTargetsWorld,balance:{forwardAcceleration:20,loadRatio:{front:.8,rear:.2}}}),proxy=result.balanceProxy,com=proxy.centerOfMassWorld,zmp=proxy.zeroMomentPointWorld
 close(zmp[2],com[2]-(com[1]-result.supportHeight)/9.81*20);close(zmp[1],result.supportHeight);assert.ok(proxy.loadRatioError>.5);assert.equal(proxy.supportExceeded,true);assert.ok(proxy.supportMarginM<0);assert.ok(result.poseLimitReasons.includes('zero-moment-point-outside-support'));assert.ok(result.boneLengthErrorMm<.001);f.dispose()
})
test('measured sole offset changes the ZMP contact plane and COM height while ankle IK targets remain unchanged',()=>{
 const {f,rig,snapshot}=sample(),initial=applyNimbusPose(rig,{anchorMode:'support'}),options={anchorMode:'support',footTargetsWorld:initial.footTargetsWorld,balance:{forwardAcceleration:1.5}}
 restoreBones(snapshot);const ankle=applyNimbusPose(rig,options);restoreBones(snapshot);const sole=applyNimbusPose(rig,{...options,supportSoleOffsetM:.08})
 assert.deepEqual(sole.footTargetsWorld,ankle.footTargetsWorld);assert.ok(sole.footTargetErrorMm<.001);close(sole.contactPlaneY,ankle.supportHeight-.08);assert.equal(sole.contactPlaneSource,'ankle-minus-measured-sole-offset');close(sole.balanceProxy.zeroMomentPointWorld[1],sole.contactPlaneY);close(sole.balanceProxy.zeroMomentPointWorld[2]-ankle.balanceProxy.zeroMomentPointWorld[2],-.08/9.81*1.5)
 restoreBones(snapshot);const invalid=applyNimbusPose(rig,{...options,supportSoleOffsetM:Infinity});assert.equal(invalid.supportSoleOffsetM,0);assert.equal(invalid.contactPlaneSource,'ankle-plane-fallback');f.dispose()
})
test('mean hip height and a knee pose policy avoid deep braking squats while retaining fixed feet and reporting unmet goals',()=>{
 const {f,rig,snapshot}=sample(),initial=applyNimbusPose(rig,{anchorMode:'support'})
 for(const offset of [-.2,-.15,.15,.2]){
  restoreBones(snapshot);const result=applyNimbusPose(rig,{anchorMode:'support',footTargetsWorld:initial.footTargetsWorld,balance:{leanForward:Math.sign(offset)*.25,crouch:.65,centerOfMassOffset:{forward:offset,side:0}}})
  assert.ok(result.knees.every(k=>k<=100.001&&k>=8));assert.ok(result.footTargetErrorMm<.001);assert.ok(result.boneLengthErrorMm<.001);assert.ok(result.balanceProxy.centerOfMassErrorMm<.1);assert.ok(result.headRotationErrorDegrees<.001);assert.ok(result.poseLimitReasons.includes('fixed-support-changes-crouch'));assert.equal(result.bodyBalance.hipHeightPolicy,'mean-requested-height-with-knee-policy')
 }
 restoreBones(snapshot);const extreme=applyNimbusPose(rig,{anchorMode:'support',footTargetsWorld:initial.footTargetsWorld,maxKneeDegrees:95,balance:{leanForward:.3,crouch:.8,centerOfMassOffset:{forward:.6,side:0}}})
 assert.ok(extreme.knees.every(k=>k<=95.001));assert.ok(extreme.balanceProxy.centerOfMassErrorMm>100);assert.ok(extreme.poseLimitReasons.includes('center-of-mass-target-unmet'));assert.ok(extreme.footTargetErrorMm<.001);assert.ok(extreme.bodyBalance.hipBalanceLimited);f.dispose()
})
