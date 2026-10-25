import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {prepareHumanoidRig} from '../src/index.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {applyNimbusPose} from '../src/nimbus-pose.mjs'

function sample(scale=1){const f=createPoseFixture(),scene=new Scene(),root=new Group();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);scene.updateMatrixWorld(true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones});f.seated();const snapshot=captureBones(f.skeleton),initial=applyNimbusPose(rig,{anchorMode:'support',supportSoleOffsetM:.0625*scale});return {f,rig,snapshot,targets:initial.footTargetsWorld,offset:.0625*scale}}
function pose(sample,balance={},extras={}){restoreBones(sample.snapshot);return applyNimbusPose(sample.rig,{anchorMode:'support',footTargetsWorld:sample.targets,supportSoleOffsetM:sample.offset,balance,...extras})}
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`)
const average=values=>values.reduce((sum,n)=>sum+n,0)/values.length

test('upward load compression couples knees, pelvis and chest; unloading reverses it without double-adding crouch',()=>{
 for(const scale of [.65,1,1.35]){
  const s=sample(scale),heavy=pose(s,{crouch:.45,verticalCompression:.12,verticalAcceleration:3,normalLoadRatio:12.81/9.81,effectiveGravityMps2:12.81,supportState:'supported'}),light=pose(s,{crouch:.45,verticalCompression:-.10,verticalAcceleration:-3,normalLoadRatio:6.81/9.81,effectiveGravityMps2:6.81,supportState:'supported'})
  close(heavy.verticalBody.baseCrouch,.45);close(heavy.verticalBody.combinedCrouch,.57);close(light.verticalBody.combinedCrouch,.35);assert.ok(average(heavy.knees)>average(light.knees)+10)
  assert.ok(heavy.bodyBalance.hipsWorld[1]<light.bodyBalance.hipsWorld[1]-.04*scale);assert.ok(heavy.bodyBalance.hipChestPitchDegrees>4);assert.ok(light.bodyBalance.hipChestPitchDegrees<-3)
  for(const result of [heavy,light]){assert.ok(result.footTargetErrorMm<.001);assert.ok(result.boneLengthErrorMm<.001);assert.ok(result.headRotationErrorDegrees<.001);assert.ok(result.bodyBalance.neckYawDegrees<9);assert.ok(result.knees.every(k=>k<=100.001));assert.ok(result.armBalance.every(arm=>arm.palmDownDot>.75&&arm.boneLengthErrorMm<.001))}s.f.dispose()
 }
})
test('world altitude translates body and sole contact plane equally while COM height and local posture stay invariant',()=>{
 const s=sample(),balance={verticalAcceleration:2,effectiveGravityMps2:11.81,normalLoadRatio:11.81/9.81,verticalCompression:.08,forwardAcceleration:1},base=pose(s,balance)
 for(const altitude of [8,100,-5]){
  const targets=s.targets.map(p=>[p[0],p[1]+altitude,p[2]]),result=pose(s,balance,{footTargetsWorld:targets})
  close(result.contactPlaneY-base.contactPlaneY,altitude);close(result.balanceProxy.centerOfMassWorld[1]-base.balanceProxy.centerOfMassWorld[1],altitude);close(result.balanceProxy.comHeightM,base.balanceProxy.comHeightM);close(result.headWorld[1]-base.headWorld[1],altitude)
  close(result.balanceProxy.zeroMomentPointWorld[1],result.contactPlaneY);close(result.balanceProxy.zeroMomentPointWorld[2],base.balanceProxy.zeroMomentPointWorld[2]);result.knees.forEach((value,index)=>close(value,base.knees[index],1e-5));assert.ok(result.footTargetErrorMm<.001)
 }s.f.dispose()
})
test('supported ZMP uses effective gravity instead of the fixed planar gravity',()=>{
 const s=sample(),base=pose(s,{forwardAcceleration:1.5}),heavy=pose(s,{forwardAcceleration:1.5,verticalAcceleration:9.81,effectiveGravityMps2:19.62,normalLoadRatio:2,supportState:'supported'})
 const p=heavy.balanceProxy;assert.equal(p.zmpValid,true);assert.equal(p.zmpInvalidReason,null);assert.equal(p.normalLoadRatio,2);close(p.zeroMomentPointWorld[2],p.centerOfMassWorld[2]-p.comHeightM/19.62*1.5)
 close(p.centerOfMassWorld[2]-p.zeroMomentPointWorld[2],(base.balanceProxy.centerOfMassWorld[2]-base.balanceProxy.zeroMomentPointWorld[2])/2);s.f.dispose()
})
test('low load and signed negative adhesion return null support diagnostics and an explicit reason',()=>{
 const s=sample()
 for(const balance of [{supportState:'low-load',normalLoadRatio:.08,effectiveGravityMps2:.7848,verticalAcceleration:-9.0252,zmpValid:false,zmpInvalidReason:'near-freefall',verticalCompression:-.12},{supportState:'adhesion',normalLoadRatio:-.2,effectiveGravityMps2:-1.962,verticalAcceleration:-11.772,zmpValid:false,zmpInvalidReason:'negative-normal-force',verticalCompression:-.12}]){
  const result=pose(s,balance),p=result.balanceProxy
  assert.equal(p.zmpValid,false);assert.equal(p.zmpInvalidReason,balance.zmpInvalidReason);assert.equal(p.normalLoadRatio,balance.normalLoadRatio);assert.equal(result.verticalBody.normalLoadRatio,balance.normalLoadRatio)
  for(const field of ['zeroMomentPointWorld','loadRatio','requestedLoadRatio','loadRatioError','unclampedFrontLoadRatio','supportMarginM','supportExceeded'])assert.equal(p[field],null,field)
  assert.ok(result.footTargetErrorMm<.001);assert.ok(result.boneLengthErrorMm<.001);assert.ok(result.headRotationErrorDegrees<.001)
 }
 assert.equal(pose(s,{supportState:'adhesion',normalLoadRatio:-.1}).verticalBody.footConstraintMode,'magical-adhesion');s.f.dispose()
})
test('zero or invalid force inputs never produce a divide-by-zero support success',()=>{
 const s=sample(),zero=pose(s,{effectiveGravityMps2:0,normalLoadRatio:0,supportState:'supported'});assert.equal(zero.balanceProxy.zmpValid,false);assert.equal(zero.balanceProxy.zeroMomentPointWorld,null);assert.equal(zero.balanceProxy.loadRatio,null)
 const invalid=pose(s,{verticalAcceleration:NaN,effectiveGravityMps2:NaN,normalLoadRatio:NaN,verticalCompression:NaN});assert.equal(invalid.verticalBody.verticalAcceleration,0);assert.equal(invalid.verticalBody.normalLoadRatio,1);assert.equal(invalid.verticalBody.verticalCompression,0);assert.ok(invalid.feetWorld.flat().every(Number.isFinite));assert.equal(invalid.balanceProxy.zmpValid,true)
 const denied=pose(s,{zmpValid:false,zmpInvalidReason:'caller-test'});assert.equal(denied.balanceProxy.zmpInvalidReason,'caller-test');assert.equal(denied.balanceProxy.supportExceeded,null);s.f.dispose()
})
test('heavy combined crouch respects the existing knee policy, while tracked hands retain input ownership',()=>{
 const s=sample(),heavy=pose(s,{crouch:.8,verticalCompression:.25,normalLoadRatio:2,effectiveGravityMps2:19.62}),tracked=pose(s,{crouch:.45,verticalCompression:.12},{preserveHands:true})
 assert.equal(heavy.verticalBody.combinedCrouch,1);assert.equal(heavy.verticalBody.compressionLimited,true);assert.ok(heavy.knees.every(k=>k<=100.001));assert.ok(heavy.boneLengthErrorMm<.001);assert.ok(heavy.footTargetErrorMm<.001)
 assert.equal(tracked.armBalance,null);assert.ok(Number.isFinite(tracked.handPositionErrorMm));assert.ok(tracked.handRotationErrorDegrees<.001);assert.ok(tracked.headRotationErrorDegrees<.001);s.f.dispose()
})
test('a smooth compression input yields a continuous supported body response without foot motion',()=>{
 const s=sample();let previous=null
 for(let frame=0;frame<=60;frame++){
  const result=pose(s,{verticalCompression:-.1+.22*frame/60,normalLoadRatio:1}),hip=new Vector3().fromArray(result.bodyBalance.hipsWorld)
  if(previous)assert.ok(hip.distanceTo(previous)<.01);previous=hip
  assert.ok(result.footTargetErrorMm<.001);assert.ok(result.headRotationErrorDegrees<.001);assert.ok(result.boneLengthErrorMm<.001)
 }s.f.dispose()
})
