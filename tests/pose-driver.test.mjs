import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Vector3} from 'three'
import {prepareHumanoidRig,attachPoseDriver} from '../src/index.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
const transforms=f=>f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
test('explicit humanoid map accepts arbitrary authored node names',()=>{
 const f=createPoseFixture();f.skeleton.bones.forEach((b,i)=>b.name='custom_'+i);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones});assert.equal(rig.bones.head,f.bones.head)
 assert.throws(()=>prepareHumanoidRig({mesh:f.mesh,bones:{...f.bones,head:null}}));f.dispose()
})
test('standing and prone share outermost render restoration and can switch presets',()=>{
 const scene=new Scene(),f=createPoseFixture();scene.add(f.mesh);f.seated();scene.updateMatrixWorld(true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones}),host=transforms(f),head=f.bones.head.getWorldPosition(new Vector3());let preset='upright'
 const before=scene.onBeforeRender,after=scene.onAfterRender,driver=attachPoseDriver({scene,rig,getOptions:()=>({preset,heading:.4})})
 for(preset of ['upright','hover','board','glider']){scene.onBeforeRender();const posed=transforms(f);assert.ok(f.bones.head.getWorldPosition(new Vector3()).distanceTo(head)<1e-8);scene.onBeforeRender();scene.onAfterRender();assert.deepEqual(transforms(f),posed);scene.onAfterRender();assert.deepEqual(transforms(f),host);assert.equal(driver.error,null)}
 driver.dispose();assert.equal(scene.onBeforeRender,before);assert.equal(scene.onAfterRender,after);f.dispose()
})
test('shared body palettes apply once, disabled poses do nothing, and bad preset restores safely',()=>{
 const scene=new Scene(),f=createPoseFixture();scene.add(f.mesh);f.seated();scene.updateMatrixWorld(true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones}),host=transforms(f);let options={enabled:false}
 const a=attachPoseDriver({scene,rig,getOptions:()=>options}),b=attachPoseDriver({scene,rig,getOptions:()=>options})
 scene.onBeforeRender();scene.onAfterRender();assert.equal(a.frames+b.frames,0)
 options={preset:'hover'};scene.onBeforeRender();scene.onAfterRender();assert.equal(a.frames+b.frames,1);assert.deepEqual(transforms(f),host)
 b.dispose();options={preset:'unknown'};scene.onBeforeRender();scene.onAfterRender();assert.match(a.error,/Unknown pose/);assert.deepEqual(transforms(f),host);a.dispose();f.dispose()
})
