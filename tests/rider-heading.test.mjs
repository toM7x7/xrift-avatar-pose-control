import test from 'node:test'
import assert from 'node:assert/strict'
import {Euler,Group,Quaternion,Scene,Vector3} from 'three'
import {resolveRiderHeading} from '../src/rider-heading.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {inspectHumanoidRigs,prepareRig} from '../src/vendor/render-pose.mjs'
const up=new Vector3(0,1,0),direction=h=>new Vector3(0,0,-1).applyAxisAngle(up,h)
function setHeadFace(rig,yaw,pitch=0){
 const world=new Quaternion().setFromEuler(new Euler(pitch,yaw,0,'YXZ')).multiply(rig.restBasis.clone().invert()).multiply(rig.headRest)
 const head=rig.bones.head,parent=head.parent?.getWorldQuaternion(new Quaternion())??new Quaternion()
 head.quaternion.copy(parent.invert().multiply(world));head.updateWorldMatrix(true,true)
}
test('anatomical head forward handles authored rest axes and transformed parents',()=>{
 for(const restYaw of [0,Math.PI,.7]){
  const scene=new Scene(),root=new Group(),fixture=createPoseFixture();root.rotation.y=restYaw;root.scale.setScalar(.8);root.position.set(3,2,-1);scene.add(root);root.add(fixture.mesh);scene.updateMatrixWorld(true);fixture.skeleton.calculateInverses()
  const rig=prepareRig(inspectHumanoidRigs(scene)[0])
  for(const yaw of [0,.8,-2.7]){setHeadFace(rig,yaw);const result=resolveRiderHeading({rig});assert.equal(result.source,'head');assert.ok(direction(result.heading).distanceTo(new Vector3(0,0,1).applyAxisAngle(up,yaw))<1e-8)}
  fixture.dispose()
 }
})
test('near vertical head direction holds the last horizontal heading and resumes on return',()=>{
 const scene=new Scene(),fixture=createPoseFixture();scene.add(fixture.mesh);scene.updateMatrixWorld(true);const rig=prepareRig(inspectHumanoidRigs(scene)[0])
 setHeadFace(rig,.4);const first=resolveRiderHeading({rig})
 for(const pitch of [Math.PI/2,-Math.PI/2]){setHeadFace(rig,2,pitch);const held=resolveRiderHeading({rig,previous:first.heading});assert.equal(held.source,'head-vertical-hold');assert.equal(held.heading,first.heading)}
 setHeadFace(rig,1.1);assert.ok(direction(resolveRiderHeading({rig,previous:first.heading}).heading).distanceTo(new Vector3(0,0,1).applyAxisAngle(up,1.1))<1e-8)
 fixture.dispose()
})
test('missing rig uses seat world yaw plus independent seated look yaw',()=>{
 for(const seatYaw of [0,.6,-2])for(const lookYaw of [0,.3,-.7]){
  const result=resolveRiderHeading({seatQuaternion:new Quaternion().setFromAxisAngle(up,seatYaw),lookYaw})
  assert.equal(result.source,'seat-look');assert.ok(direction(result.heading).distanceTo(direction(seatYaw+lookYaw))<1e-8)
 }
 const tilted=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2)
 assert.deepEqual(resolveRiderHeading({seatQuaternion:tilted,previous:.7}),{heading:.7,source:'held'})
})
