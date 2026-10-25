// Authored bone fixtures only; these are not additional people's VRM assets.
import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Scene} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {inspectHumanoidRigs,prepareRig} from '../src/vendor/render-pose.mjs'
import {applyStandingPose} from '../src/standing.mjs'
test('different leg/torso/arm proportions and known exporter names preserve head and limb lengths',()=>{
 for(const profile of [{scale:.65,leg:.7,torso:1.3,arm:.75,prefix:'mixamorig'},{scale:1.4,leg:1.4,torso:.8,arm:1.3,prefix:'normalized_'}]){
  const f=createPoseFixture(),scene=new Scene(),root=new Group();root.scale.setScalar(profile.scale);root.rotation.y=.7;root.position.set(2,3,-4);scene.add(root);root.add(f.mesh)
  for(const [role,bone] of Object.entries(f.bones)){if(/LowerLeg|Foot/.test(role))bone.position.multiplyScalar(profile.leg);if(['spine','chest','neck'].includes(role))bone.position.multiplyScalar(profile.torso);if(/LowerArm|Hand/.test(role))bone.position.multiplyScalar(profile.arm);bone.name=profile.prefix+role}
  scene.updateMatrixWorld(true);f.skeleton.calculateInverses()
  const rig=prepareRig(inspectHumanoidRigs(scene)[0]),lengths=f.skeleton.bones.map(b=>b.position.length())
  for(let frame=0;frame<90;frame++){f.seated(frame/60);const result=applyStandingPose(rig,{heading:.5,pitch:.15*Math.sin(frame/20),roll:.1,kneeBend:.08});assert.ok(result.headDriftMm<.001&&result.headRotationErrorDegrees<.001);for(let i=0;i<lengths.length;i++)if(f.skeleton.bones[i]!==f.bones.hips)assert.ok(Math.abs(f.skeleton.bones[i].position.length()-lengths[i])<1e-8)}
  f.dispose()
 }
})
test('unrecognized bone names remain unsupported rather than guessing another avatar',()=>{
 const f=createPoseFixture(),scene=new Scene();scene.add(f.mesh);f.skeleton.bones.forEach((b,i)=>b.name='arbitraryNode'+i)
 assert.equal(inspectHumanoidRigs(scene)[0].supported,false);f.dispose()
})
