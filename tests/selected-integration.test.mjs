import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {prepareHumanoidRig,attachPoseDriver} from '../src/index.mjs'

const transforms=f=>f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
test('N02 and the paired U02 drivers preserve nested render transactions, move with carrier, and stop on disable',()=>{
 const scene=new Scene(),passenger=createPoseFixture(),carrier=createPoseFixture(),root=new Group()
 root.add(carrier.mesh);root.rotation.y=.4;scene.add(root,passenger.mesh);passenger.seated(.3);scene.updateMatrixWorld(true)
 const rig=prepareHumanoidRig({mesh:passenger.mesh,bones:passenger.bones}),carrierRig=prepareHumanoidRig({mesh:carrier.mesh,bones:carrier.bones})
 const original={before:scene.onBeforeRender,after:scene.onAfterRender},host=transforms(passenger),carrierHost=transforms(carrier)
 let preset='nimbus',enabled=true
 const rider=attachPoseDriver({scene,rig,getOptions:()=>({enabled,preset,heading:.4,...(preset==='shoulder'?{carrierAnchors:{leftShoulder:carrier.bones.leftUpperArm.getWorldPosition(new Vector3()),rightShoulder:carrier.bones.rightUpperArm.getWorldPosition(new Vector3()),head:carrier.bones.head.getWorldPosition(new Vector3())}}:{})})})
 const driver=attachPoseDriver({scene,rig:carrierRig,getOptions:()=>({enabled:enabled&&preset==='shoulder',preset:'carrierSupport',heading:.4,shinTargets:rider.last?.kneesWorld?Object.fromEntries(['left','right'].map((s,i)=>[s,new Vector3(...rider.last.kneesWorld[i]).lerp(new Vector3(...rider.last.feetWorld[i]),.55)])):undefined})})
 const support=[]
 for(preset of ['nimbus','shoulder','shoulder']){
  if(support.length)root.position.set(1,.2,-2)
  scene.updateMatrixWorld(true);scene.onBeforeRender()
  assert.equal(rider.error,null);assert.equal(driver.error,null)
  if(preset==='shoulder'){assert.ok(rider.last.supportErrorMm<.001);assert.ok(driver.last.handTargetErrorMm<.001);assert.ok(driver.last.maxLimbLengthErrorMm<.001);support.push(rider.last.hipsWorld)}
  const posed=transforms(passenger);scene.onBeforeRender();scene.onAfterRender();assert.deepEqual(transforms(passenger),posed)
  scene.onAfterRender();assert.deepEqual(transforms(passenger),host);assert.deepEqual(transforms(carrier),carrierHost)
  assert.equal(rider.restored,true);assert.equal(driver.restored,true)
 }
 assert.ok(new Vector3(...support[1]).sub(new Vector3(...support[0])).distanceTo(new Vector3(1,.2,-2))<1e-8)
 enabled=false;const frames=[rider.frames,driver.frames];scene.onBeforeRender();scene.onAfterRender();assert.deepEqual([rider.frames,driver.frames],frames)
 rider.dispose();driver.dispose();assert.equal(scene.onBeforeRender,original.before);assert.equal(scene.onAfterRender,original.after)
 passenger.dispose();carrier.dispose()
})
