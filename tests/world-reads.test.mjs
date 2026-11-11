import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Scene,Vector3,Quaternion} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {inspectHumanoidRigs,prepareRig,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {gliderSupportSurface} from '../src/vendor/torso-support.mjs'
import * as engine from '../src/index.mjs'
import {applyHeld,timelineParams,timelineDuration} from '../src/authoring/prop.mjs'
import {referenceWorldReads,solving,worldPositionOf,worldQuaternionOf,intoLocal,settle} from '../src/world.mjs'
import {SCENARIOS,record,firstDifference,stage} from './world-reads-scenarios.mjs'

const m={...engine,createPoseFixture,createDetailedPoseFixture,inspectHumanoidRigs,prepareRig,captureBones,restoreBones,gliderSupportSurface,applyHeld,timelineParams,timelineDuration}

test('every solver mode gives bit-identical bones and results with lazy world reads and with plain three calls',()=>{
 for(const scenario of SCENARIOS){
  referenceWorldReads(true);let reference;try{reference=record(m,scenario)}finally{referenceWorldReads(false)}
  const lazy=record(m,scenario),difference=firstDifference(reference,lazy)
  assert.equal(difference,null,`${scenario[0]}: ${difference&&`${difference.what} differ at frame ${difference.frame}`}`)
  assert.ok(reference.every(f=>f.result&&f.result!=='null'),scenario[0]+': no solver result')
 }
})

test('a read during a solve sees writes that were never announced, on the bone and on its ancestors',()=>{
 const s=stage(m,{extra:20,place:'nested'}),b=s.rig.bones,expected=[]
 const moves=()=>{b.hips.position.x+=.2;b.chest.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.3));b.leftLowerArm.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.5))}
 const reads=()=>[b.leftHand.getWorldPosition(new Vector3()).toArray(),b.head.getWorldQuaternion(new Quaternion()).toArray(),b.rightFoot.getWorldPosition(new Vector3()).toArray(),b.leftHand.parent.worldToLocal(new Vector3(1,2,3)).toArray()]
 const snapshot=captureBones(s.f.skeleton);moves();expected.push(...reads());restoreBones(snapshot)
 solving(s.rig,()=>{
  // Look first, then move without settle(): the next read must still be current.
  worldPositionOf(b.leftHand);worldQuaternionOf(b.head);moves()
  assert.deepEqual([worldPositionOf(b.leftHand).toArray(),worldQuaternionOf(b.head).toArray(),worldPositionOf(b.rightFoot).toArray(),intoLocal(b.leftHand.parent,new Vector3(1,2,3)).toArray()],expected)
 })
 // After the solve every matrix under the hips is current, including bones no read touched.
 for(const bone of s.f.skeleton.bones){const now=bone.matrixWorld.clone();bone.updateWorldMatrix(true,false);assert.deepEqual(now.elements,bone.matrixWorld.elements,bone.name)}
 s.f.dispose()
})

test('moving something above the hips during a solve, then settling it, is seen by the next read',()=>{
 const s=stage(m,{place:'moved'}),b=s.rig.bones
 solving(s.rig,()=>{
  const before=worldPositionOf(b.head).clone()
  s.root.position.x+=1;settle(s.root,true,true)
  const after=worldPositionOf(b.head)
  assert.ok(Math.abs(after.x-before.x-1)<1e-12,`${after.x} vs ${before.x}`)
  assert.deepEqual(after.toArray(),b.head.getWorldPosition(new Vector3()).toArray())
 })
 s.f.dispose()
})

test('solves nest for the same avatar, and another avatar solved inside leaves both current',()=>{
 const scene=new Scene(),make=x=>{const f=createPoseFixture(),root=new Group();root.position.x=x;root.add(f.mesh);scene.add(root);f.seated(0);return {f,root}}
 const a=make(0),c=make(2);scene.updateMatrixWorld(true)
 const [rigA,rigC]=[a,c].map(x=>prepareRig(inspectHumanoidRigs(scene).find(r=>r.mesh===x.f.mesh)))
 const direct=bone=>bone.getWorldPosition(new Vector3()).toArray()
 solving(rigA,()=>{
  rigA.bones.hips.position.y+=.1
  solving(rigA,()=>assert.deepEqual(worldPositionOf(rigA.bones.head).toArray()[1],direct(rigA.bones.head)[1]))
  solving(rigC,()=>{rigC.bones.hips.position.y-=.1;assert.deepEqual(worldPositionOf(rigC.bones.head).toArray(),direct(rigC.bones.head))})
  // The other avatar is not under these hips: a plain three read.
  assert.deepEqual(worldPositionOf(rigC.bones.head).toArray(),direct(rigC.bones.head))
  rigA.bones.spine.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.2))
  assert.deepEqual(worldPositionOf(rigA.bones.head).toArray(),direct(rigA.bones.head))
 })
 assert.throws(()=>solving(rigA,()=>referenceWorldReads(true)),/during a solve/)
 a.f.dispose();c.f.dispose()
})
