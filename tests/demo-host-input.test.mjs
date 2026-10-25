import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,PerspectiveCamera,Quaternion,Scene,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {applyDemoHostPose} from '../demo/host-input.mjs'

const point=b=>b.getWorldPosition(new Vector3()),direction=(a,z)=>point(z).sub(point(a)).normalize()
function sample(bindYaw=0,rootYaw=0){
 const f=createPoseFixture(),scene=new Scene(),root=new Group();root.add(f.mesh);scene.add(root)
 f.mesh.rotation.y=bindYaw;scene.updateMatrixWorld(true);f.skeleton.calculateInverses()
 root.rotation.y=rootYaw;root.position.set(.4,1,-2);root.scale.setScalar(.8);scene.updateMatrixWorld(true)
 return {f,scene,root}
}
test('synthetic seating puts thighs forward, calves down and arms down for original and rotated anatomical frames',()=>{
 for(const [bindYaw,rootYaw]of [[0,0],[Math.PI,0],[0,Math.PI],[Math.PI,.61],[.47,-.81]]){
  const {f}=sample(bindYaw,rootYaw),b=f.bones,head=point(b.head),positions=f.skeleton.bones.map(x=>x.position.clone()),scales=f.skeleton.bones.map(x=>x.scale.clone()),boneLengths=[['leftUpperLeg','leftLowerLeg'],['leftLowerLeg','leftFoot'],['leftUpperArm','leftLowerArm'],['leftLowerArm','leftHand']].map(([a,z])=>point(b[a]).distanceTo(point(b[z])))
  const axes=applyDemoHostPose(b,{seated:true}),forward=new Vector3(...axes.forward),up=new Vector3(...axes.up)
  for(const side of ['left','right']){assert.ok(direction(b[side+'UpperLeg'],b[side+'LowerLeg']).dot(forward)>.999);assert.ok(direction(b[side+'LowerLeg'],b[side+'Foot']).dot(up)<-.995);assert.ok(direction(b[side+'UpperArm'],b[side+'LowerArm']).dot(up)<-.999)}
  assert.ok(point(b.head).distanceTo(head)<1e-8)
  f.skeleton.bones.forEach((x,i)=>{assert.ok(x.position.distanceTo(positions[i])<1e-8);assert.ok(x.scale.distanceTo(scales[i])<1e-8)})
  for(const [i,[a,z]]of [['leftUpperLeg','leftLowerLeg'],['leftLowerLeg','leftFoot'],['leftUpperArm','leftLowerArm'],['leftLowerArm','leftHand']].entries())assert.ok(Math.abs(point(b[a]).distanceTo(point(b[z]))-boneLengths[i])<1e-8)
  f.dispose()
 }
})
test('head yaw and pitch rotate about anatomical axes without moving its pivot or touching a camera',()=>{
 const {f,scene}=sample(Math.PI,.4),b=f.bones,camera=new PerspectiveCamera();camera.position.set(2,3,4);camera.rotation.set(.2,.4,.1);scene.add(camera);scene.updateMatrixWorld(true)
 const head=point(b.head),headQ=b.head.getWorldQuaternion(new Quaternion()),cameraP=point(camera),cameraQ=camera.getWorldQuaternion(new Quaternion()),yaw=.6,pitch=.3
 const result=applyDemoHostPose(b,{seated:true,headYaw:yaw,headPitch:pitch}),up=new Vector3(...result.up),lateral=new Vector3(...result.lateral),yawQ=new Quaternion().setFromAxisAngle(up,yaw),expected=new Quaternion().setFromAxisAngle(lateral.applyQuaternion(yawQ),pitch).multiply(yawQ).multiply(headQ)
 assert.ok(b.head.getWorldQuaternion(new Quaternion()).angleTo(expected)<1e-7);assert.ok(point(b.head).distanceTo(head)<1e-8);assert.ok(point(camera).distanceTo(cameraP)<1e-8);assert.ok(camera.getWorldQuaternion(new Quaternion()).angleTo(cameraQ)<1e-7);f.dispose()
})
test('unseated demo input keeps neutral limbs and nonfinite look values do not corrupt the skeleton',()=>{
 const {f}=sample(),before=f.skeleton.bones.map(b=>b.quaternion.clone()),result=applyDemoHostPose(f.bones,{headYaw:NaN,headPitch:Infinity});assert.equal(result.headYaw,0);assert.equal(result.headPitch,0);f.skeleton.bones.forEach((b,i)=>assert.ok(b.quaternion.angleTo(before[i])<1e-7));f.dispose()
})
