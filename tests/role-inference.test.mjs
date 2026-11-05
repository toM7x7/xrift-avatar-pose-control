import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {inspectHumanoidRigs,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {prepareHumanoidRig,applyPose,resolveRoles,parseBoneName,validateRoles,inferHumanoidBones,INFERENCE_REQUIRED_ROLES} from '../src/index.mjs'
import {selectRiderRig,selectRiderRigWithInference} from '../src/adapters/xrift.mjs'
import {humanoid,toInput,truthOf,CONVENTIONS,ARM,scrambledNames,sideMarksOnly,quadruped} from './role-inference-skeletons.mjs'

const wrongRoles=(result,truth)=>INFERENCE_REQUIRED_ROLES.filter(r=>result.roles[r]!==truth[r])
function decides(result,truth,label){assert.ok(result.ok,`${label}: refused (${result.reason})`);assert.deepEqual(wrongRoles(result,truth),[],label)}
function refuses(result,label){assert.equal(result.ok,false,`${label}: decided ${JSON.stringify(result.roles)}`);assert.ok(result.reason,label)}

test('every exporter convention and the nameless body resolve to the true 14 roles, facing +Z or -Z, in T or A pose',()=>{
 const bodies=[...Object.entries(CONVENTIONS).map(([id,c])=>{const bones=humanoid(c.names,c.layout);return [id,bones,truthOf(bones,c.hips)]}),
  ['no names',humanoid(scrambledNames(),{skirt:true,tails:true})],['L/R marks only',humanoid(sideMarksOnly())]]
 for(const [id,bones,truth=truthOf(bones)] of bodies)for(const facing of [1,-1])for(const aPose of [false,true])decides(resolveRoles(toInput(bones,{facing,aPose})),truth,`${id} ${facing} ${aPose?'A':'T'}`)
})

test('names decide the segment boundaries, the shape fills unnamed roles, and "leg" is read per convention',()=>{
 const cats=resolveRoles(toInput(humanoid(CONVENTIONS.cats.names))),mixamo=resolveRoles(toInput(humanoid(CONVENTIONS.mixamo.names)))
 assert.equal(cats.dialect,'vrchat');assert.equal(mixamo.dialect,'mixamo');assert.equal(cats.method,'names+structure');assert.equal(cats.namesFound,14)
 const mmd=resolveRoles(toInput(humanoid(CONVENTIONS.mmd.names,CONVENTIONS.mmd.layout)));assert.equal(mmd.namesFound,13);assert.ok(mmd.ok)
 const nameless=resolveRoles(toInput(humanoid(scrambledNames())));assert.equal(nameless.method,'structure');assert.deepEqual(nameless.side,['toes','feet'])
})

test('skirts, floor-length hair, wings and ribbons do not steal the arms or legs, and scale or bind orientation does not matter',()=>{
 for(const [id,names,layout,mode] of [['long skirt',CONVENTIONS.unity.names,{longSkirt:true},'ok'],['floor twin tails',CONVENTIONS.unity.names,{tails:'floor'},'ok'],['wings',CONVENTIONS.unity.names,{wings:true},'ok'],
  ['nameless wings',scrambledNames(),{wings:true},'ok'],['nameless floor ribbons',scrambledNames(),{ribbons:true},'safe'],['nameless cape, no fingers',scrambledNames(),{cape:true,fingers:false},'safe'],['nameless wings, no fingers',scrambledNames(),{wings:true,fingers:false},'safe']]){
  const bones=humanoid(names,layout)
  for(const facing of [1,-1]){const r=resolveRoles(toInput(bones,{facing}));if(mode==='ok'||r.ok)decides(r,truthOf(bones),`${id} ${facing}`)}
 }
 const body=humanoid(scrambledNames())
 decides(resolveRoles(toInput(body,{transform:([x,y,z])=>[x,-z,y]})),truthOf(body),'lying bind pose')
 decides(resolveRoles(toInput(body,{transform:p=>p.map(v=>v*100)})),truthOf(body),'x100 scale')
})

test('undecidable or contradictory skeletons are refused with a reason',()=>{
 const bare=humanoid(scrambledNames(),{toes:false})
 refuses(resolveRoles(toInput(bare,{centroids:false})),'no names, toes or foot geometry')
 decides(resolveRoles(toInput(bare)),truthOf(bare),'foot geometry alone decides the sides')
 const swap=name=>name.replace(/^(Left|Right)/,m=>m==='Left'?'Right':'Left')
 const swapped=resolveRoles(toInput(humanoid(CONVENTIONS.cats.names),{rename:b=>swap(b.name)}));refuses(swapped,'L/R names swapped');assert.match(swapped.reason,/left\/right contradicts/)
 refuses(resolveRoles(toInput(humanoid(CONVENTIONS.unity.names),{rename:b=>ARM.has(b.key)?swap(b.name):b.name})),'arm names swapped')
 const quad=resolveRoles(toInput(quadruped(),{centroids:false}));refuses(quad,'quadruped');assert.match(quad.reason,/no pair of legs/)
 refuses(resolveRoles({names:['a','b'],parent:[-1,0],positions:[[0,0,0],[0,1,0]],weights:[1,1]}),'too few bones')
})

test('bone names are tokenized with prefixes, numbers, sides and helper markers',()=>{
 const cases={'mixamorig:LeftUpLeg':[1,'upleg',false,false],'Character1_LeftUpLeg':[1,'upleg',false,false],'Bip001 R Thigh':[-1,'thigh',false,false],'J_Bip_C_Hips':[0,'hips',false,false],
  'DEF-thigh.L.001':[1,'thigh',true,false],'upperarm_twist_01_l':[1,'upperarmtwist',true,true],'lThighBend':[1,'thigh',false,false],'foot.L_end':[1,'footend',false,true],'Left knee':[1,'knee',false,false]}
 for(const [name,[side,base,numbered,skip]] of Object.entries(cases)){const p=parseBoneName(name);assert.deepEqual([p.side,p.base,p.numbered,p.skip],[side,base,numbered,skip],name)}
 assert.deepEqual(parseBoneName('左足首'),{side:1,base:'足首',numbered:false,skip:false,mmd:true});assert.equal(parseBoneName('右足ＩＫ').base,'足IK')
 const body=humanoid(CONVENTIONS.unity.names),input=toInput(body),truth=truthOf(body)
 assert.deepEqual(validateRoles(input,truth),[]);assert.ok(validateRoles(input,{...truth,leftHand:truth.rightHand}).length)
})

// The fixture renamed the way other exporters name bones: inspectHumanoidRigs cannot read it, inference must give back the same rig.
const RENAMES={
 cats:{hips:'Hips',spine:'Spine',chest:'Chest',neck:'Neck',head:'Head',leftUpperArm:'Left arm',leftLowerArm:'Left elbow',leftHand:'Left wrist',rightUpperArm:'Right arm',rightLowerArm:'Right elbow',rightHand:'Right wrist',leftUpperLeg:'Left leg',leftLowerLeg:'Left knee',leftFoot:'Left ankle',rightUpperLeg:'Right leg',rightLowerLeg:'Right knee',rightFoot:'Right ankle'},
 unreal:{hips:'pelvis',spine:'spine_01',chest:'spine_02',neck:'neck_01',head:'head',leftUpperArm:'upperarm_l',leftLowerArm:'lowerarm_l',leftHand:'hand_l',rightUpperArm:'upperarm_r',rightLowerArm:'lowerarm_r',rightHand:'hand_r',leftUpperLeg:'thigh_l',leftLowerLeg:'calf_l',leftFoot:'foot_l',rightUpperLeg:'thigh_r',rightLowerLeg:'calf_r',rightFoot:'foot_r'},
 mmd:{hips:'センター',spine:'上半身',chest:'上半身2',neck:'首',head:'頭',leftUpperArm:'左腕',leftLowerArm:'左ひじ',leftHand:'左手首',rightUpperArm:'右腕',rightLowerArm:'右ひじ',rightHand:'右手首',leftUpperLeg:'左足',leftLowerLeg:'左ひざ',leftFoot:'左足首',rightUpperLeg:'右足',rightLowerLeg:'右ひざ',rightFoot:'右足首'},
}
RENAMES.nameless=Object.fromEntries(Object.keys(RENAMES.cats).map((role,i)=>[role,`Bone.${String(i).padStart(3,'0')}`]))
RENAMES.swapped=Object.fromEntries(Object.entries(RENAMES.cats).map(([role,name])=>[role,name.replace(/^(Left|Right)/,m=>m==='Left'?'Right':'Left')]))
function staged(renames=null){
 const f=createPoseFixture(),scene=new Scene(),root=new Group();root.add(f.mesh);scene.add(root);scene.updateMatrixWorld(true)
 if(renames)for(const [role,name] of Object.entries(renames))f.bones[role].name=name
 return {f,scene,meshes:[f.mesh,...f.mesh.children.filter(o=>o.isSkinnedMesh)]}
}

test('a renamed fixture is unreadable by name, inferred back to its own bones, and poses exactly like the original',()=>{
 const original=staged(),reference=prepareHumanoidRig({mesh:original.f.mesh,bones:original.f.bones}),start=captureBones(original.f.skeleton)
 applyPose(reference,{preset:'nimbus'});const expected=Object.keys(RENAMES.cats).map(role=>original.f.bones[role].getWorldPosition(new Vector3()))
 restoreBones(start)
 for(const id of ['cats','unreal','mmd','nameless']){
  const s=staged(RENAMES[id]);assert.equal(inspectHumanoidRigs(s.scene).find(r=>r.mesh===s.f.mesh).supported,false,id)
  const inferred=inferHumanoidBones({mesh:s.f.mesh,meshes:s.meshes});assert.ok(inferred.ok,`${id}: ${inferred.result.reason}`)
  for(const role of Object.keys(RENAMES.cats))assert.equal(inferred.bones[role],s.f.bones[role],`${id} ${role}`)
  applyPose(prepareHumanoidRig({mesh:s.f.mesh,bones:inferred.bones}),{preset:'nimbus'})
  Object.keys(RENAMES.cats).forEach((role,i)=>assert.ok(s.f.bones[role].getWorldPosition(new Vector3()).distanceTo(expected[i])<1e-9,`${id} ${role} pose`))
  s.f.dispose()
 }
 const swapped=staged(RENAMES.swapped),refused=inferHumanoidBones({mesh:swapped.f.mesh,meshes:swapped.meshes})
 assert.equal(refused.ok,false);assert.equal(refused.bones,null);assert.match(refused.result.reason,/left\/right/)
 original.f.dispose();swapped.f.dispose()
})

test('rider selection infers only when name lookup fails, only near the seat, and leaves readable rigs on the original path',()=>{
 const pick=(renames,seatOffset=0)=>{
  const s=staged(renames),seat=s.f.bones.hips.getWorldPosition(new Vector3()).add(new Vector3(0,0,seatOffset)),rigs=inspectHumanoidRigs(s.scene)
  return {s,plain:selectRiderRig({scene:s.scene,rigs,occupantId:'me',localUserId:'me',seatPosition:seat}),inferred:selectRiderRigWithInference({scene:s.scene,rigs,occupantId:'me',localUserId:'me',seatPosition:seat})}
 }
 const named=pick(null);assert.equal(named.plain.status,'ready');assert.equal(named.inferred.status,'ready');assert.equal(named.inferred.inference,null);assert.deepEqual(named.inferred.attempts,[])
 const cats=pick(RENAMES.cats);assert.equal(cats.plain.status,'unsupported-or-loading');assert.equal(cats.inferred.status,'ready');assert.equal(cats.inferred.inference.result.method,'names+structure')
 assert.equal(cats.inferred.rig.bones.leftUpperLeg,cats.s.f.bones.leftUpperLeg);assert.ok(cats.inferred.relatedSkeletons.includes(cats.s.f.skeleton))
 const far=pick(RENAMES.cats,10);assert.equal(far.inferred.status,'unsupported-or-loading');assert.deepEqual(far.inferred.attempts,[])
 const swapped=pick(RENAMES.swapped);assert.equal(swapped.inferred.status,'unsupported-or-loading');assert.equal(swapped.inferred.attempts.length,1);assert.equal(swapped.inferred.attempts[0].rig,null)
 const own=pick(RENAMES.cats),excluded=selectRiderRigWithInference({scene:own.s.scene,rigs:inspectHumanoidRigs(own.s.scene),occupantId:'me',localUserId:'me',seatPosition:own.s.f.bones.hips.getWorldPosition(new Vector3()),exclude:rig=>rig.mesh===own.s.f.mesh})
 assert.equal(excluded.status,'unsupported-or-loading')
 for(const run of [named,cats,far,swapped,own])run.s.f.dispose()
})
