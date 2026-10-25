import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {inspectHumanoidRigs,prepareRig,captureBones} from '../src/vendor/render-pose.mjs'
import {installStandingPose as v3} from '../src/repro/v3-standing.mjs'
import {installStandingPose} from '../src/standing.mjs'

const transforms=f=>captureBones(f.skeleton).map(s=>[...s.position.toArray(),...s.quaternion.toArray(),...s.scale.toArray()])
function sample(install){
 const scene=new Scene(),f=createPoseFixture();scene.add(f.mesh);f.seated();scene.updateMatrixWorld(true)
 const rig=prepareRig(inspectHumanoidRigs(scene)[0]),bridge=install(scene,rig,()=>({enabled:true}))
 return {scene,f,bridge,footY:()=>f.bones.leftFoot.getWorldPosition(new Vector3()).y}
}
test('v3 restores seated bones during the outer render when a nested camera finishes',()=>{
 const {scene,f,bridge,footY}=sample(v3),seatedY=footY()
 scene.onBeforeRender();const uprightY=footY();assert.ok(uprightY<seatedY-.2)
 scene.onBeforeRender();scene.onAfterRender();assert.ok(Math.abs(footY()-seatedY)<1e-8)
 scene.onAfterRender();bridge.dispose();f.dispose()
})
test('nested camera renders keep all body copies upright and restore only after the outer render',()=>{
 const {scene,f,bridge,footY}=sample(installStandingPose),host=transforms(f)
 scene.onBeforeRender();const uprightY=footY(),standing=transforms(f)
 for(let i=0;i<3;i++)scene.onBeforeRender()
 for(let i=0;i<3;i++){scene.onAfterRender();assert.ok(Math.abs(footY()-uprightY)<1e-8);assert.deepEqual(transforms(f),standing);assert.equal(bridge.restored,false)}
 assert.equal(bridge.frames,1)
 scene.onAfterRender();assert.deepEqual(transforms(f),host);assert.equal(bridge.restored,true)
 scene.onBeforeRender();scene.onAfterRender();assert.equal(bridge.frames,2);assert.deepEqual(transforms(f),host)
 bridge.dispose();f.dispose()
})
test('a failing pre-existing nested render callback does not end the outer pose transaction',()=>{
 const scene=new Scene(),f=createPoseFixture();scene.add(f.mesh);f.seated();scene.updateMatrixWorld(true)
 let fail=false;scene.onBeforeRender=()=>{if(fail)throw Error('test photo failure')}
 const before=scene.onBeforeRender,host=transforms(f),rig=prepareRig(inspectHumanoidRigs(scene)[0]),bridge=installStandingPose(scene,rig,()=>({enabled:true}))
 scene.onBeforeRender();const upright=transforms(f);fail=true
 assert.throws(()=>scene.onBeforeRender(),/photo failure/);assert.deepEqual(transforms(f),upright)
 scene.onAfterRender();assert.deepEqual(transforms(f),host);bridge.dispose();assert.equal(scene.onBeforeRender,before);f.dispose()
})
test('two bridges targeting different skin palettes of one body apply only once',()=>{
 const {scene,f,bridge}=sample(installStandingPose),raw=inspectHumanoidRigs(scene)[0],clone=f.skeleton.clone()
 const second=installStandingPose(scene,prepareRig({...raw,skeleton:clone}),()=>({enabled:true}))
 const host=transforms(f);scene.onBeforeRender();scene.onAfterRender()
 assert.equal(bridge.frames,1);assert.equal(second.frames,0);assert.deepEqual(transforms(f),host)
 bridge.dispose();scene.onBeforeRender();scene.onAfterRender();assert.equal(second.frames,1);assert.deepEqual(transforms(f),host)
 second.dispose();clone.dispose();f.dispose()
})
