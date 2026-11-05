// Three.js entry for role inference: builds the bind-time input from a skeleton and returns an explicit role -> Bone map.
// Opt-in. inspectHumanoidRigs/selectRiderRig keep their name-only behavior; use this only for skeletons they cannot read.
import {Matrix4,Vector3} from 'three'
import {resolveRoles} from './role-inference.mjs'

const skins=new WeakMap()
// Per mesh: bone -> summed skin weight and weighted bind-space vertex sum. Geometry does not change, so it is counted once.
function skinOf(mesh){
 let map=skins.get(mesh);if(map)return map
 map=new Map()
 const g=mesh.geometry,position=g?.getAttribute('position'),index=g?.getAttribute('skinIndex'),weight=g?.getAttribute('skinWeight')
 if(position&&index&&weight){
  const v=new Vector3()
  for(let i=0;i<position.count;i++){
   v.fromBufferAttribute(position,i).applyMatrix4(mesh.bindMatrix)
   for(let k=0;k<4;k++){
    const w=weight.getComponent(i,k),bone=w>0?mesh.skeleton.bones[index.getComponent(i,k)]:undefined;if(!bone)continue
    let e=map.get(bone);if(!e)map.set(bone,e={weight:0,sum:new Vector3()})
    e.weight+=w;e.sum.addScaledVector(v,w)
   }
  }
 }
 skins.set(mesh,map);return map
}

/** Bind-time joints (inverse of boneInverses), skin weights and centroids from meshes sharing the bones, plus vertices of plain meshes hung under a bone. */
export function skeletonInputOf(skeleton,meshes=[]){
 const bones=skeleton.bones,at=new Map(bones.map((b,i)=>[b,i]))
 const parent=bones.map(b=>{for(let p=b.parent;p;p=p.parent){const i=at.get(p);if(i!==undefined)return i}return -1})
 const m=new Matrix4(),v=new Vector3(),positions=bones.map((_,i)=>{v.setFromMatrixPosition(m.copy(skeleton.boneInverses[i]).invert());return [v.x,v.y,v.z]})
 const skinWeight=bones.map(()=>0),sums=bones.map(()=>new Vector3())
 for(const mesh of meshes)for(const [bone,e] of skinOf(mesh)){const i=at.get(bone);if(i!==undefined){skinWeight[i]+=e.weight;sums[i].add(e.sum)}}
 const weights=bones.map((bone,i)=>{
  let attached=0;const stack=[...bone.children]
  while(stack.length){const o=stack.pop();if(o.isBone)continue;if(o.isMesh&&!o.isSkinnedMesh)attached+=o.geometry?.getAttribute('position')?.count??0;stack.push(...o.children)}
  return skinWeight[i]+attached
 })
 return {names:bones.map(b=>b.name),parent,positions,weights,centroids:sums.map((s,i)=>skinWeight[i]>0?[s.x/skinWeight[i],s.y/skinWeight[i],s.z/skinWeight[i]]:null)}
}

/** Infer an explicit humanoid map for prepareHumanoidRig({mesh,bones}). meshes: every SkinnedMesh sharing the bones (defaults to mesh). */
export function inferHumanoidBones({mesh,meshes=[mesh]}){
 const result=resolveRoles(skeletonInputOf(mesh.skeleton,meshes)),bones=mesh.skeleton.bones
 return {ok:result.ok,bones:result.ok?Object.fromEntries(Object.entries(result.roles).map(([role,i])=>[role,bones[i]])):null,names:Object.fromEntries(Object.entries(result.roles).map(([role,i])=>[role,bones[i].name])),result}
}

const cache=new WeakMap()
/**
 * Infer rigs that inspectHumanoidRigs could not read by name, near a point (e.g. a seat).
 * Rigs sharing the same bones (other meshes of one avatar) are inferred once, using the one with the most bones.
 * Results are cached per bone set and recomputed when meshes sharing the bones are added.
 */
export function inferHumanoidRigs(rigs,scene,{exclude=()=>false,near=null,maxDistance=Infinity}={}){
 const groups=new Map()
 for(const rig of rigs){
  if(rig.supported||exclude(rig)||!rig.skeleton.bones.length)continue
  if(near&&rig.skeleton.bones[0].getWorldPosition(new Vector3()).distanceTo(near)>maxDistance)continue
  const key=rig.skeleton.bones[0],old=groups.get(key)
  if(!old||rig.skeleton.bones.length>old.skeleton.bones.length)groups.set(key,rig)
 }
 if(!groups.size)return []
 const all=[];scene.traverse(o=>{if(o.isSkinnedMesh)all.push(o)})
 const out=[]
 for(const [key,rig] of groups){
  const set=new Set(rig.skeleton.bones),meshes=all.filter(mesh=>mesh.skeleton?.bones.some(b=>set.has(b))),hit=cache.get(key)
  if(hit&&hit.bones===rig.skeleton.bones.length&&hit.meshes===meshes.length){out.push(hit.inferred);continue}
  const {ok,bones,names,result}=inferHumanoidBones({mesh:rig.mesh,meshes})
  const inferred={rig:ok?{mesh:rig.mesh,skeleton:rig.skeleton,bones,missing:[],supported:true}:null,result,names,source:rig}
  cache.set(key,{bones:rig.skeleton.bones.length,meshes:meshes.length,inferred});out.push(inferred)
 }
 return out
}
