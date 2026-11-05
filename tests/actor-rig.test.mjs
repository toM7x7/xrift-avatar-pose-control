import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Scene,Group,Object3D,Vector3} from 'three'
import {createDetailedPoseFixture,FIXTURE_NAMINGS} from '../src/vendor/detailed-fixture.mjs'
import {inspectHumanoidRigs} from '../src/vendor/render-pose.mjs'
import {selectActorRig} from '../src/adapters/xrift.mjs'
import {COMPAT_VARIANTS,stageVariant,deviationMm} from '../scripts/review-compat.mjs'

const clip=JSON.parse(readFileSync(new URL('../specs/charge-wave.v1.json',import.meta.url),'utf8'))
const REQUIRED=['hips','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
function stage(options={},{at=new Vector3(.4,0,-.7),remoteId=null}={}){
 const scene=new Scene(),f=createDetailedPoseFixture(options),root=new Group();root.position.copy(at);root.add(f.mesh);scene.add(root)
 if(remoteId){const marker=new Object3D();marker.userData={id:'remote-player-'+remoteId,onInteract(){}};root.add(marker)}
 f.idle(0);scene.updateMatrixWorld(true);return {scene,f,feet:at.clone()}
}

test('actor rig: readable names stay on the name path; Blender/Unreal/VRChat/MMD/nameless skeletons are inferred to the true bones',()=>{
 const named=stage({}),plain=selectActorRig({scene:named.scene,userId:'me',isLocal:true,feet:named.feet})
 assert.equal(plain.status,'ready');assert.deepEqual(plain.roles,{method:'names'});assert.equal(plain.inference,null)
 named.f.dispose()
 for(const naming of ['blender','rigify','unreal','cats','mmd','nameless']){
  const s=stage({naming})
  assert.equal(inspectHumanoidRigs(s.scene)[0].supported,false,naming+' is not readable by the name table')
  const r=selectActorRig({scene:s.scene,userId:'me',isLocal:true,feet:s.feet})
  assert.equal(r.status,'ready',`${naming}: ${r.diagnosis?.reason}`)
  assert.match(r.roles.method,/structure/,naming)
  for(const role of REQUIRED)assert.equal(r.rig.bones[role],s.f.bones[role],`${naming} ${role}`)
  assert.ok(r.relatedSkeletons.includes(s.f.skeleton))
  s.f.dispose()
 }
})

test('actor rig: refusals explain themselves and never guess (swapped sides, nobody at the feet, remote scopes)',()=>{
 const swapped=stage({naming:role=>FIXTURE_NAMINGS.cats(role).replace(/^(Left|Right)/,m=>m==='Left'?'Right':'Left').replace(/_(L|R)(_end)?$/,(m,s,e)=>'_'+(s==='L'?'R':'L')+(e??''))})
 const refused=selectActorRig({scene:swapped.scene,userId:'me',isLocal:true,feet:swapped.feet})
 assert.equal(refused.status,'unsupported');assert.equal(refused.rig,null)
 assert.ok(refused.diagnosis.reason.length>0&&refused.diagnosis.boneNames.length===swapped.f.skeleton.bones.length,'diagnosis lists the bones')
 const far=selectActorRig({scene:swapped.scene,userId:'me',isLocal:true,feet:new Vector3(30,0,30)})
 assert.equal(far.status,'no-avatar-near')
 swapped.f.dispose()
 // A remote player's avatar is found through its marker, and is never taken as the local user's.
 const remote=stage({naming:'blender'},{remoteId:'u2'})
 const theirs=selectActorRig({scene:remote.scene,userId:'u2',isLocal:false,feet:remote.feet})
 assert.equal(theirs.status,'ready');assert.equal(theirs.source,'remote-player-marker');assert.equal(theirs.rig.bones.hips,remote.f.bones.hips)
 assert.equal(selectActorRig({scene:remote.scene,userId:'me',isLocal:true,feet:remote.feet}).status,'no-avatar-near')
 assert.equal(selectActorRig({scene:remote.scene,userId:'u3',isLocal:false,feet:remote.feet}).status,'waiting-for-avatar')
 remote.f.dispose()
})

test('compatibility matrix: every exporter variant poses; same skeletons pose exactly like the reference body',()=>{
 const reference=stageVariant(clip,{})
 for(const [id,options,same] of COMPAT_VARIANTS){
  const v=stageVariant(clip,options)
  assert.equal(v.selection.status,'ready',`${id}: ${v.selection.diagnosis?.reason}`)
  assert.ok(v.rolesCorrect,id+' roles')
  const reach=Math.max(...v.samples.flatMap(s=>Object.values(s.metrics.arms).map(a=>a?.reachErrorMm??0)))
  assert.ok(reach<1,`${id} reach ${reach}`)
  if(same)assert.ok(deviationMm(v,reference)<.01,`${id} differs from the reference by ${deviationMm(v,reference).toFixed(3)} mm`)
  v.f.dispose()
 }
 reference.f.dispose()
})
