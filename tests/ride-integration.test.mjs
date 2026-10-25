import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Vector3,Quaternion,PerspectiveCamera} from 'three'
import {prepareHumanoidRig,attachPoseDriver,applyPose,createRideDynamics,stepRideDynamics} from '../src/index.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'

const transforms=f=>f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
test('force-driven ride keeps local foot anchors through translation, turn, braking and nested render restore',()=>{
 const scene=new Scene(),root=new Group(),f=createPoseFixture(),camera=new PerspectiveCamera()
 camera.position.set(4,3,5);scene.add(root,camera);root.add(f.mesh);f.seated(0);scene.updateMatrixWorld(true)
 const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones}),host=captureBones(f.skeleton),initial=applyPose(rig,{preset:'nimbus',anchorMode:'support'})
 const anchors=initial.footTargetsWorld.map(p=>new Vector3(...p)),comHeightM=initial.balanceProxy.centerOfMassWorld[1]-initial.supportHeight+.0625
 restoreBones(host)
 let state=createRideDynamics({mass:70,driveForce:154,brakeForce:210,comHeightM}),current={}
 const driver=attachPoseDriver({scene,rig,getOptions:()=>current}),cameraBefore=[...camera.position.toArray(),...camera.quaternion.toArray()],up=new Vector3(0,1,0)
 const cases=[]
 for(const [input,seconds]of [[{throttle:1},1],[{throttle:.35,steer:.7},.8],[{brake:1},1],[{},1.5]]){
  for(let frame=0;frame<Math.round(seconds*60);frame++){
   const proxy=driver.last?.balanceProxy
   state=stepRideDynamics(state,{...input,observedComHeightM:proxy?proxy.centerOfMassWorld[1]-proxy.contactPlaneY:undefined},1/60);root.position.fromArray(state.position);root.quaternion.setFromAxisAngle(up,state.heading)
   f.seated(0);root.updateWorldMatrix(true,true)
   const before=transforms(f),worldAnchors=anchors.map(p=>p.clone().applyAxisAngle(up,state.heading).add(root.position).toArray()),p=state.pose
   current={preset:'nimbus',anchorMode:'support',heading:state.heading,footTargetsWorld:worldAnchors,supportSoleOffsetM:.0625,balance:{leanForward:p.balanceLeanForward,leanSide:p.balanceLeanSide,centerOfMassOffset:p.centerOfMassOffset,crouch:p.crouch,loadRatio:p.loadRatio,forwardAcceleration:p.forwardAcceleration,lateralAcceleration:p.lateralAcceleration}}
   scene.onBeforeRender();assert.equal(driver.error,null);assert.ok(driver.last.footTargetErrorMm<1);assert.ok(driver.last.boneLengthErrorMm<.01);assert.ok(driver.last.bodyBalance.neckYawDegrees<15)
   const posed=transforms(f);scene.onBeforeRender();scene.onAfterRender();assert.deepEqual(transforms(f),posed);scene.onAfterRender();assert.deepEqual(transforms(f),before)
   assert.deepEqual([...camera.position.toArray(),...camera.quaternion.toArray()],cameraBefore)
  }
  cases.push({speed:state.pose.speed,forward:state.pose.balanceLeanForward,knees:driver.last.knees})
 }
 assert.ok(cases[0].speed>1);assert.ok(cases[0].forward>0);assert.ok(state.pose.speed<.01);assert.ok(Math.abs(state.pose.balanceLeanForward)<.001)
 driver.dispose();f.dispose()
})
