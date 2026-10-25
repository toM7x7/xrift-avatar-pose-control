import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Vector3} from 'three'
import {createFlightMotion,stepFlightMotion} from '../src/flight-motion.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {inspectHumanoidRigs,prepareRig} from '../src/vendor/render-pose.mjs'
import {applyStandingPose,installStandingPose} from '../src/standing.mjs'

test('body movement smoothly follows the head and leans toward forward/lateral flight',()=>{
 const s=createFlightMotion();stepFlightMotion(s,{heading:Math.PI,velocity:{x:0,y:0,z:-2}},1/60)
 assert.ok(s.pitch>0&&s.pitch<12*Math.PI/180);const first=s.pitch
 for(let i=0;i<90;i++)stepFlightMotion(s,{heading:Math.PI,velocity:{x:0,y:0,z:-2},time:i/60},1/60)
 assert.ok(s.pitch>first*5&&s.pitch<=12*Math.PI/180);const previous=s.heading
 stepFlightMotion(s,{heading:Math.PI+.8,velocity:{x:2,y:0,z:0}},1/60);assert.ok(s.heading>previous&&s.heading<Math.PI+.8)
 for(let i=0;i<90;i++)stepFlightMotion(s,{heading:Math.PI,velocity:{x:2,y:0,z:0}},1/60)
 assert.ok(s.roll>0&&s.roll<.17)
})
test('angle following takes the short route across the pi boundary and settles at rest',()=>{
 const s=createFlightMotion();stepFlightMotion(s,{heading:Math.PI-.02},0)
 stepFlightMotion(s,{heading:-Math.PI+.02},1/60);assert.ok(s.heading>Math.PI-.02&&s.heading<Math.PI+.02)
 for(let i=0;i<240;i++)stepFlightMotion(s,{heading:0,velocity:{x:0,y:0,z:0},airborne:false},1/60)
 assert.ok(Math.abs(s.pitch)<1e-8&&Math.abs(s.roll)<1e-8&&s.kneeBend<1e-8)
})
test('animated tilted flight preserves head, reachable tracked hands and leg segment lengths',()=>{
 const scene=new Scene(),f=createPoseFixture();scene.add(f.mesh);scene.updateMatrixWorld(true);const rig=prepareRig(inspectHumanoidRigs(scene)[0])
 for(let i=0;i<180;i++){
  f.seated(i/60);applyStandingPose(rig,{heading:.3})
  for(const side of ['left','right']){f.bones[side+'UpperArm'].rotation.z+=(side==='left'?1:-1)*.4;f.bones[side+'UpperLeg'].rotation.x=-Math.PI/2;f.bones[side+'LowerLeg'].rotation.x=Math.PI/2}
  f.mesh.updateWorldMatrix(true,true);const head=f.bones.head.getWorldPosition(new Vector3()),lengths=['left','right'].map(s=>[f.bones[s+'UpperLeg'].getWorldPosition(new Vector3()).distanceTo(f.bones[s+'LowerLeg'].getWorldPosition(new Vector3())),f.bones[s+'LowerLeg'].getWorldPosition(new Vector3()).distanceTo(f.bones[s+'Foot'].getWorldPosition(new Vector3()))])
  const result=applyStandingPose(rig,{heading:.3,preserveHands:true,pitch:.15*Math.sin(i/30),roll:.1*Math.cos(i/24),kneeBend:.09,armSwing:.012})
  assert.ok(result.headDriftMm<.001&&result.headRotationErrorDegrees<.001);assert.ok(result.handPositionErrorMm<.05&&result.handRotationErrorDegrees<.001)
  assert.ok(f.bones.head.getWorldPosition(new Vector3()).distanceTo(head)<1e-8)
  for(const [index,s] of ['left','right'].entries()){const upper=f.bones[s+'UpperLeg'].getWorldPosition(new Vector3()),lower=f.bones[s+'LowerLeg'].getWorldPosition(new Vector3()),foot=f.bones[s+'Foot'].getWorldPosition(new Vector3());assert.ok(Math.abs(upper.distanceTo(lower)-lengths[index][0])<1e-8);assert.ok(Math.abs(lower.distanceTo(foot)-lengths[index][1])<1e-8)}
 }
 f.dispose()
})
test('ground mode leaves host walking pose unchanged and nested airborne render still restores',()=>{
 const scene=new Scene(),f=createPoseFixture();scene.add(f.mesh);f.seated();scene.updateMatrixWorld(true);const rig=prepareRig(inspectHumanoidRigs(scene)[0]),values=()=>f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]),host=values();let air=false
 const bridge=installStandingPose(scene,rig,()=>({enabled:air,pitch:.2,roll:.12,kneeBend:.1}))
 scene.onBeforeRender();scene.onAfterRender();assert.deepEqual(values(),host);assert.equal(bridge.frames,0)
 air=true;scene.onBeforeRender();const tilted=values();scene.onBeforeRender();scene.onAfterRender();assert.deepEqual(values(),tilted);scene.onAfterRender();assert.deepEqual(values(),host)
 bridge.dispose();f.dispose()
})
