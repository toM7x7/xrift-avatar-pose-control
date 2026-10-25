import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,PerspectiveCamera} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {captureBones} from '../src/vendor/render-pose.mjs'
import {prepareHumanoidRig,attachPoseDriver} from '../src/index.mjs'
test('experimental seat presets use the public nested-render transaction and restore host bones',()=>{
 const scene=new Scene(),fixture=createPoseFixture(),camera=new PerspectiveCamera();scene.add(fixture.mesh,camera)
 fixture.seated();scene.updateMatrixWorld(true)
 const snapshot=captureBones(fixture.skeleton),cameraBefore=camera.matrixWorld.clone(),rig=prepareHumanoidRig({mesh:fixture.mesh,bones:fixture.bones})
 let preset='chair';const driver=attachPoseDriver({scene,rig,getOptions:()=>({preset,family:preset,handMode:'relaxed'})})
 for(preset of ['chair','straddle','side-sit']){
  scene.onBeforeRender();assert.equal(driver.last.family,preset);assert.equal(driver.restored,false);assert.ok(driver.last.supportErrorMm<.001)
  const support=driver.last.hipsWorld.slice();scene.onBeforeRender();scene.onAfterRender()
  assert.equal(driver.restored,false);assert.deepEqual(driver.last.hipsWorld,support)
  scene.onAfterRender();assert.equal(driver.restored,true)
  for(const saved of snapshot){assert.ok(saved.bone.position.equals(saved.position));assert.ok(saved.bone.quaternion.equals(saved.quaternion));assert.ok(saved.bone.scale.equals(saved.scale))}
  camera.updateMatrixWorld(true);assert.ok(camera.matrixWorld.equals(cameraBefore))
 }
 driver.dispose();fixture.dispose()
})
