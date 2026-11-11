import test from 'node:test'
import assert from 'node:assert/strict'
import {Bone,Group,Scene,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {captureBones,restoreBones,roleOf,inspectHumanoidRigs,prepareRig} from '../src/vendor/render-pose.mjs'
import {attachPoseDriver} from '../src/index.mjs'

const transforms=f=>f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
function sample(){const scene=new Scene(),root=new Group(),f=createPoseFixture();root.add(f.mesh);scene.add(root);f.seated(.3);scene.updateMatrixWorld(true);return {scene,f}}

test('a snapshot can be reused for the same skeleton and is replaced for another one',()=>{
 const a=sample(),b=sample(),first=captureBones(a.f.skeleton),host=transforms(a.f)
 a.f.bones.hips.position.y+=.2;a.f.bones.leftUpperArm.quaternion.set(0,.6,0,.8)
 const second=captureBones(a.f.skeleton,first)
 assert.equal(second,first);assert.deepEqual(second[0].position.toArray(),a.f.bones.hips.position.toArray())
 assert.notEqual(captureBones(b.f.skeleton,first),first);assert.notEqual(captureBones(a.f.skeleton,first.slice(1)),first)
 // The reused snapshot now holds the moved pose; restoring it brings exactly that back.
 const moved=transforms(a.f);a.f.seated(.9);restoreBones(second);assert.deepEqual(transforms(a.f),moved);assert.notDeepEqual(moved,host)
 a.f.dispose();b.f.dispose()
})

test('restoring refreshes world matrices from the top bones, also after a bone is re-parented',()=>{
 const {scene,f}=sample(),snapshot=captureBones(f.skeleton),head=f.bones.head.getWorldPosition(new Vector3())
 for(let pass=0;pass<2;pass++){
  f.bones.hips.position.x+=1;f.bones.hips.updateWorldMatrix(false,true);restoreBones(snapshot)
  assert.ok(new Vector3().setFromMatrixPosition(f.bones.head.matrixWorld).distanceTo(head)<1e-12)
 }
 // The hips move under a new parent: they are still the top of the snapshot and must be refreshed under it.
 const holder=new Bone();holder.position.set(0,0,2);f.bones.hips.parent.add(holder);holder.add(f.bones.hips);scene.updateMatrixWorld(true)
 const shifted=f.bones.head.getWorldPosition(new Vector3())
 f.bones.hips.position.x+=1;f.bones.hips.updateWorldMatrix(false,true);restoreBones(snapshot)
 assert.ok(new Vector3().setFromMatrixPosition(f.bones.head.matrixWorld).distanceTo(shifted)<1e-12);assert.ok(Math.abs(shifted.z-head.z-2)<1e-12)
 f.dispose()
})

test('the driver puts the host pose back exactly on every frame while reusing its snapshot',()=>{
 const {scene,f}=sample(),rig=prepareRig(inspectHumanoidRigs(scene)[0]),driver=attachPoseDriver({scene,rig,getOptions:()=>({preset:'nimbus'})})
 for(let i=0;i<5;i++){
  f.seated(i*.4);scene.updateMatrixWorld(true);const host=transforms(f)
  scene.onBeforeRender();assert.equal(driver.error,null);assert.notDeepEqual(transforms(f),host)
  scene.onAfterRender();assert.deepEqual(transforms(f),host)
 }
 driver.dispose();f.dispose()
})

test('bone-name roles are remembered per name, null included',()=>{
 for(let pass=0;pass<2;pass++){
  assert.equal(roleOf('mixamorig:LeftUpLeg'),'leftUpperLeg');assert.equal(roleOf('J_Bip_C_Hips'),'hips');assert.equal(roleOf('Normalized_head'),'head')
  assert.equal(roleOf('Left knee'),null);assert.equal(roleOf('HairJoint_07'),null)
 }
 const {scene,f}=sample();assert.equal(inspectHumanoidRigs(scene)[0].supported,true)
 f.bones.leftFoot.name='Left ankle';assert.deepEqual(inspectHumanoidRigs(scene)[0].missing,['leftFoot'])
 f.bones.leftFoot.name='leftFoot';assert.equal(inspectHumanoidRigs(scene)[0].supported,true)
 f.dispose()
})
