import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Bone,Vector3,Quaternion,PerspectiveCamera} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {inspectHumanoidRigs,prepareRig,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {selectRiderRig} from '../src/vendor/rider-binding.mjs'
import {applyStandingPose,installStandingPose} from '../src/standing.mjs'
const transforms=s=>s.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
function sample(scale=1){const scene=new Scene(),f=createPoseFixture(),root=new Group();root.scale.setScalar(scale);root.position.set(1,2,-3);root.rotation.y=.6;root.add(f.mesh);scene.add(root);f.seated(.8);scene.updateMatrixWorld(true);return {scene,f,root,rig:prepareRig(inspectHumanoidRigs(scene)[0])}}

test('seated knees become straight at different body sizes without changing head position/orientation or bone lengths',()=>{
 for(const scale of [.7,1,1.3]){const {f,rig}=sample(scale),lengths=f.skeleton.bones.map(b=>b.position.length());const result=applyStandingPose(rig,{heading:.6});assert.ok(result.knees.every(k=>k<4));assert.ok(result.upright>.999);assert.ok(result.headDriftMm<.001);assert.ok(result.headRotationErrorDegrees<.001);f.skeleton.bones.forEach((b,i)=>{if(b!==f.bones.hips)assert.ok(Math.abs(b.position.length()-lengths[i])<1e-8)});f.dispose()}
})
test('moving reachable VR-like head and hands retain their world position and rotation over 180 frames',()=>{
 const {f,rig}=sample()
 for(let frame=0;frame<180;frame++){
  f.seated(frame/60);applyStandingPose(rig,{heading:.6});f.bones.head.rotation.y+=Math.sin(frame/20)*.4;f.bones.head.rotation.x+=Math.cos(frame/18)*.2
  for(const s of ['left','right']){f.bones[s+'UpperArm'].rotation.z+=(s==='left'?1:-1)*(.4+.3*Math.sin(frame/30));f.bones[s+'LowerArm'].rotation.y=.2*Math.cos(frame/20);f.bones[s+'UpperLeg'].rotation.x=-Math.PI/2;f.bones[s+'LowerLeg'].rotation.x=Math.PI/2}
  f.mesh.updateWorldMatrix(true,true);const result=applyStandingPose(rig,{heading:.6,preserveHands:true})
  assert.ok(result.headDriftMm<.001);assert.ok(result.headRotationErrorDegrees<.001);assert.ok(result.handPositionErrorMm<.05,JSON.stringify(result));assert.ok(result.handRotationErrorDegrees<.001)
 }
 f.dispose()
})
test('unreachable controllers produce reach error without stretching bones or moving head',()=>{
 const {f,rig}=sample();f.bones.leftHand.position.x=3;f.mesh.updateWorldMatrix(true,true);const result=applyStandingPose(rig,{preserveHands:true});assert.ok(result.handPositionErrorMm>500);assert.ok(result.headDriftMm<.001);assert.ok(Math.abs(f.bones.leftHand.position.x-.25)<1e-8);f.dispose()
})
test('render-only correction restores animation, keeps camera unchanged and ceases on leave/dispose',()=>{
 const {scene,f,rig}=sample(),camera=new PerspectiveCamera();camera.position.set(3,4,5);scene.add(camera);scene.updateMatrixWorld(true)
 let occupied=true;const bridge=installStandingPose(scene,rig,()=>({enabled:occupied,preserveHands:false})),original=transforms(f.skeleton),cameraP=camera.getWorldPosition(new Vector3()),cameraQ=camera.getWorldQuaternion(new Quaternion())
 scene.onBeforeRender(null,scene,camera);assert.notDeepEqual(transforms(f.skeleton),original);assert.ok(bridge.last.headDriftMm<.001);scene.onAfterRender(null,scene,camera);assert.deepEqual(transforms(f.skeleton),original);assert.ok(camera.getWorldPosition(new Vector3()).equals(cameraP));assert.ok(camera.getWorldQuaternion(new Quaternion()).angleTo(cameraQ)<1e-8)
 occupied=false;scene.onBeforeRender();scene.onAfterRender();assert.equal(bridge.frames,1);bridge.dispose();scene.onBeforeRender();scene.onAfterRender();assert.deepEqual(transforms(f.skeleton),original);f.dispose()
})
test('owner selection rejects multiple unclaimed avatars and cannot correct unrelated bystanders',()=>{
 const {scene,f}=sample(),extra=createPoseFixture();scene.add(extra.mesh);scene.updateMatrixWorld(true);const found=selectRiderRig({scene,rigs:inspectHumanoidRigs(scene),occupantId:'pilot',localUserId:'pilot',seatPosition:new Vector3(1,2.9,-3)});assert.equal(found.rig,null);assert.equal(found.status,'ambiguous-rig');f.dispose();extra.dispose()
})

test('two simultaneous pose bridges restore independently when removed in either order',()=>{
 for(const reversed of [false,true]){
  const a=sample(),b=createPoseFixture();b.mesh.position.x=3;a.scene.add(b.mesh);b.seated();a.scene.updateMatrixWorld(true)
  const before=a.scene.onBeforeRender,after=a.scene.onAfterRender,rigB=prepareRig(inspectHumanoidRigs(a.scene).find(r=>r.mesh===b.mesh))
  const snapshots=[transforms(a.f.skeleton),transforms(b.skeleton)]
  const bridges=[installStandingPose(a.scene,a.rig,()=>({enabled:true})),installStandingPose(a.scene,rigB,()=>({enabled:true}))]
  a.scene.onBeforeRender();assert.equal(bridges[0].frames,1);assert.equal(bridges[1].frames,1);a.scene.onAfterRender()
  assert.deepEqual(transforms(a.f.skeleton),snapshots[0]);assert.deepEqual(transforms(b.skeleton),snapshots[1])
  bridges[reversed?1:0].dispose();a.scene.onBeforeRender();a.scene.onAfterRender();assert.equal(bridges[reversed?0:1].frames,2);bridges[reversed?0:1].dispose()
  assert.equal(a.scene.onBeforeRender,before);assert.equal(a.scene.onAfterRender,after);a.f.dispose();b.dispose()
 }
})
test('VR finger curls and facial bone animation are preserved below wrist and head anchors',()=>{
 const {scene,f}=sample();const finger=new Bone(),jaw=new Bone();finger.name='leftIndexProximal';jaw.name='jaw';finger.position.x=.03;jaw.position.y=-.05;f.bones.leftHand.add(finger);f.bones.head.add(jaw);scene.updateMatrixWorld(true)
 for(const bone of [finger,jaw]){f.skeleton.bones.push(bone);f.skeleton.boneInverses.push(bone.matrixWorld.clone().invert())}
 const rig=prepareRig(inspectHumanoidRigs(scene)[0]);finger.rotation.z=.8;jaw.rotation.x=.2;const fingerQ=finger.quaternion.clone(),jawQ=jaw.quaternion.clone();applyStandingPose(rig,{preserveHands:true})
 assert.ok(finger.quaternion.angleTo(fingerQ)<1e-7);assert.ok(jaw.quaternion.angleTo(jawQ)<1e-7);f.dispose()
})
test('upright body faces the Seat forward direction (-Z) while preserving the host head',()=>{
 const {f,rig}=sample();const result=applyStandingPose(rig,{heading:Math.PI})
 const left=f.bones.leftUpperArm.getWorldPosition(new Vector3()).sub(f.bones.rightUpperArm.getWorldPosition(new Vector3())).normalize(),up=f.bones.head.getWorldPosition(new Vector3()).sub(f.bones.hips.getWorldPosition(new Vector3())).normalize(),front=new Vector3().crossVectors(left,up).normalize()
 assert.ok(front.dot(new Vector3(0,0,-1))>.999);assert.ok(result.headDriftMm<.001);assert.ok(result.headRotationErrorDegrees<.001);f.dispose()
})
