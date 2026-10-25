import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Vector3,Quaternion,PerspectiveCamera} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {prepareHumanoidRig,attachPoseDriver} from '../src/index.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {applyNimbusPose} from '../src/nimbus-pose.mjs'
const up=new Vector3(0,1,0),point=b=>b.getWorldPosition(new Vector3()),close=(a,z,tolerance=1e-7)=>assert.ok(Math.abs(a-z)<tolerance,`${a} != ${z}`),vectorClose=(a,z,tolerance=1e-7)=>assert.ok(new Vector3().fromArray(a).distanceTo(new Vector3().fromArray(z))<tolerance,`${a} != ${z}`)
const transforms=s=>s.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
function sample({scale=1,heading=0,height=0}={}){
 const f=createPoseFixture(),scene=new Scene(),root=new Group();root.scale.setScalar(scale);root.position.y=height;root.rotation.y=heading;root.add(f.mesh);scene.add(root);scene.updateMatrixWorld(true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones});f.seated();const snapshot=captureBones(f.skeleton),offset=.0625*scale,base=applyNimbusPose(rig,{anchorMode:'support',heading,supportSoleOffsetM:offset}),origin=new Vector3(0,base.contactPlaneY,0),yaw=new Quaternion().setFromAxisAngle(up,heading),localFeet=base.footTargetsWorld.map(p=>new Vector3().fromArray(p).sub(origin).applyQuaternion(yaw.clone().invert()));restoreBones(snapshot)
 return {f,scene,root,rig,snapshot,offset,origin,heading,localFeet,base}
}
function pose(s,{pitch=.2,bank=.3,balance={},anchorMode='support',quaternionScale=1}={}){
 restoreBones(s.snapshot);const q=new Quaternion().setFromAxisAngle(up,s.heading).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-pitch)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-bank)),targets=s.localFeet.map(p=>p.clone().applyQuaternion(q).add(s.origin)),raw=q.toArray().map(n=>n*quaternionScale),options={anchorMode,heading:s.heading,supportSoleOffsetM:s.offset,footTargetsWorld:targets,supportFrame:{position:s.origin,quaternion:raw},balance}
 return {result:applyNimbusPose(s.rig,options),options,q,targets}
}

test('pitched and banked support keeps feet on its normal while the head stays world-up and the torso shares the tilt',()=>{
 for(const scale of [.65,1,1.35])for(const [pitch,bank]of [[.2,.3],[-.2,-.3],[20*Math.PI/180,25*Math.PI/180]]){
  const s=sample({scale}),{result:r,targets}=pose(s,{pitch,bank,quaternionScale:3})
  assert.ok(r.footTargetErrorMm<.001);assert.ok(r.contactPlaneErrorMm<.001);assert.ok(r.boneLengthErrorMm<.001);assert.ok(r.headRotationErrorDegrees<.001);assert.ok(r.headUpDotWorld>.999999)
  assert.ok(r.footSoleNormalErrorDegrees.every(n=>n<.001));assert.ok(r.feetSupport.every(foot=>Math.abs(foot.soleProxyGapM)<1e-8));assert.ok(r.knees.every(k=>k<=100.001));r.feetWorld.forEach((p,i)=>vectorClose(p,targets[i].toArray()))
  const normal=new Vector3().fromArray(r.supportNormalWorld);assert.ok(r.bodyBalance.chestWorldUpDot>normal.dot(up));assert.ok(r.bodyBalance.chestWorldUpDot>r.bodyBalance.pelvisWorldUpDot);close(new Quaternion().fromArray(r.supportFrame.quaternion).length(),1)
  const bodyUp=new Vector3().fromArray(r.headWorld).sub(new Vector3().fromArray(r.bodyBalance.hipsWorld)).normalize();close(r.upright,bodyUp.dot(up));close(r.uprightSupport,bodyUp.dot(normal))
  close(r.balanceProxy.comHeightM,new Vector3().fromArray(r.balanceProxy.centerOfMassWorld).sub(s.origin).dot(normal));s.f.dispose()
 }
})
test('equal tilt at different world altitude and yaw has the same local posture and normal COM height',()=>{
 const a=sample(),b=sample({height:100,heading:.7}),ra=pose(a).result,rb=pose(b).result
 close(ra.balanceProxy.comHeightM,rb.balanceProxy.comHeightM);ra.knees.forEach((value,i)=>close(value,rb.knees[i],1e-5));close(ra.bodyBalance.headNeckAngleDegrees,rb.bodyBalance.headNeckAngleDegrees,1e-5);assert.ok(rb.headUpDotWorld>.999999)
 assert.ok(rb.feetWorld.every(p=>p[1]>99));assert.ok(Math.abs(rb.ankleHeightSpreadMm)>1);assert.ok(rb.ankleNormalHeightSpreadMm<.001);a.f.dispose();b.f.dispose()
})
test('a level yaw-only support frame preserves the existing acceleration-driven planar body lean',()=>{
 const s=sample({heading:.7}),balance={leanForward:.15,leanSide:.1,forwardAcceleration:1.5,lateralAcceleration:.8,centerOfMassOffset:{forward:.07,side:.03}}
 restoreBones(s.snapshot);const flat=applyNimbusPose(s.rig,{anchorMode:'support',heading:s.heading,supportSoleOffsetM:s.offset,footTargetsWorld:s.base.footTargetsWorld,balance}),framed=pose(s,{pitch:0,bank:0,balance}).result
 vectorClose(flat.headWorld,framed.headWorld);vectorClose(flat.bodyBalance.hipsWorld,framed.bodyBalance.hipsWorld);vectorClose(flat.balanceProxy.centerOfMassWorld,framed.balanceProxy.centerOfMassWorld);flat.feetWorld.forEach((p,i)=>vectorClose(p,framed.feetWorld[i]));close(flat.bodyBalance.leanForward,framed.bodyBalance.leanForward);close(flat.bodyBalance.chestWorldUpDot,framed.bodyBalance.chestWorldUpDot);s.f.dispose()
})
test('COM, ZMP, arms and hull world outputs are restored from support coordinates',()=>{
 const s=sample({heading:.4,height:8}),balance={forwardAcceleration:1.2,lateralAcceleration:-.6,effectiveGravityMps2:10,normalLoadRatio:10/9.81,centerOfMassOffset:{forward:.05,side:-.03}},r=pose(s,{balance}).result,n=new Vector3().fromArray(r.supportNormalWorld),forward=new Vector3().fromArray(r.supportFrame.forwardWorld),right=new Vector3().fromArray(r.supportFrame.rightWorld),com=new Vector3().fromArray(r.balanceProxy.centerOfMassWorld),zmp=new Vector3().fromArray(r.balanceProxy.zeroMomentPointWorld),delta=com.clone().sub(zmp)
 close(zmp.clone().sub(s.origin).dot(n),0);close(delta.dot(forward),r.balanceProxy.comHeightM/10*1.2);close(delta.dot(right),r.balanceProxy.comHeightM/10*-.6)
 for(const p of r.balanceProxy.footHullWorld)close(new Vector3().fromArray(p).sub(s.origin).dot(n),0)
 vectorClose(r.headWorld,point(s.f.bones.head).toArray());vectorClose(r.bodyBalance.hipsWorld,point(s.f.bones.hips).toArray());for(const arm of r.armBalance){vectorClose(arm.handWorld,point(s.f.bones[arm.side+'Hand']).toArray());vectorClose(arm.elbowWorld,point(s.f.bones[arm.side+'LowerArm']).toArray());close(new Vector3().fromArray(arm.palmNormalWorld).length(),1)}
 close(r.contactPlaneY,s.origin.y);s.f.dispose()
})
test('head priority preserves world head position on a tilted support, and tracked hand orientation stays host-owned',()=>{
 const s=sample(),head=point(s.f.bones.head),{options}=pose(s,{anchorMode:'head'});assert.ok(point(s.f.bones.head).distanceTo(head)<1e-8)
 restoreBones(s.snapshot);const handQ=s.f.bones.leftHand.getWorldQuaternion(new Quaternion()),r=applyNimbusPose(s.rig,{...options,preserveHands:true});assert.ok(r.headDriftMm<.001);assert.ok(r.headRotationErrorDegrees<.001);assert.ok(r.handRotationErrorDegrees<.001);assert.ok(s.f.bones.leftHand.getWorldQuaternion(new Quaternion()).angleTo(handQ)<1e-7);assert.equal(r.armBalance,null);s.f.dispose()
})
test('invalid or zero support frames reject without leaking transformed bones, and invalid targets restore after conversion',()=>{
 const s=sample(),before=transforms(s.f.skeleton)
 for(const supportFrame of [{position:[0,0,0],quaternion:[0,0,0,0]},{position:[0,NaN,0],quaternion:[0,0,0,1]},{position:[0,0,0],quaternion:[0,Infinity,0,1]}]){assert.throws(()=>applyNimbusPose(s.rig,{supportFrame}));assert.deepEqual(transforms(s.f.skeleton),before)}
 assert.throws(()=>applyNimbusPose(s.rig,{supportFrame:{position:[0,1,0],quaternion:[0,0,.2,1]},footTargetsWorld:[[0,0,0],[0,NaN,0]]}));assert.deepEqual(transforms(s.f.skeleton),before);s.f.dispose()
})
test('render transactions restore tilted body poses after nested renders without changing the camera',()=>{
 const s=sample(),{options}=pose(s);restoreBones(s.snapshot);const before=transforms(s.f.skeleton),camera=new PerspectiveCamera();camera.position.set(3,4,5);s.scene.add(camera);const cameraPosition=point(camera),cameraQ=camera.getWorldQuaternion(new Quaternion()),driver=attachPoseDriver({scene:s.scene,rig:s.rig,getOptions:()=>({...options,preset:'nimbus'})})
 s.scene.onBeforeRender();assert.ok(driver.last.headUpDotWorld>.999999);assert.notDeepEqual(transforms(s.f.skeleton),before);s.scene.onBeforeRender();s.scene.onAfterRender();assert.equal(driver.restored,false);s.scene.onAfterRender();assert.deepEqual(transforms(s.f.skeleton),before);assert.ok(point(camera).distanceTo(cameraPosition)<1e-8);assert.ok(camera.getWorldQuaternion(new Quaternion()).angleTo(cameraQ)<1e-8);driver.dispose();s.f.dispose()
})
test('world-up diagnostics detect a banked input head even when pose rotation preservation is perfect',()=>{
 const s=sample();s.root.rotation.z=-.2;s.root.updateWorldMatrix(true,true);s.snapshot=captureBones(s.f.skeleton);const r=pose(s).result
 assert.ok(r.headRotationErrorDegrees<.001);assert.ok(r.headUpDotWorld<.99);close(r.headUpDotWorld,Math.cos(.2));s.f.dispose()
})
test('invalid unilateral support remains null after the frame result is returned to world space',()=>{
 const s=sample(),r=pose(s,{balance:{supportState:'adhesion',normalLoadRatio:-.2,effectiveGravityMps2:-1.962,zmpValid:false,zmpInvalidReason:'negative-normal-force'}}).result
 assert.equal(r.balanceProxy.zeroMomentPointWorld,null);assert.equal(r.balanceProxy.loadRatio,null);assert.equal(r.balanceProxy.supportMarginM,null);assert.equal(r.balanceProxy.zmpInvalidReason,'negative-normal-force');assert.ok(r.footSoleNormalErrorDegrees.every(n=>n<.001));s.f.dispose()
})
