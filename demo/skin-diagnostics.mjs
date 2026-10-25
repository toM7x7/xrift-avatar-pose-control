import {Vector3,Quaternion} from 'three'

const sides=['left','right']
const point=bone=>bone?.getWorldPosition(new Vector3())??null
const extrema=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]})
function include(bounds,p){const values=p.toArray();for(let axis=0;axis<3;axis++){bounds.min[axis]=Math.min(bounds.min[axis],values[axis]);bounds.max[axis]=Math.max(bounds.max[axis],values[axis])}}
const finish=bounds=>Number.isFinite(bounds.min[0])?bounds:{min:null,max:null}
const component=(attribute,index,channel)=>channel===0?attribute.getX(index):channel===1?attribute.getY(index):channel===2?attribute.getZ(index):attribute.getW(index)

/** Measure the CURRENT posed skin. Call after skeleton.update(), before restoring a render pose. */
export function measureSkinDiagnostics(actor,{supportFrame}={}){
 const q=supportFrame?.quaternion?.isQuaternion?supportFrame.quaternion.clone():Array.isArray(supportFrame?.quaternion)?new Quaternion().fromArray(supportFrame.quaternion):new Quaternion()
 const origin=supportFrame?.position?.isVector3?supportFrame.position.clone():Array.isArray(supportFrame?.position)?new Vector3().fromArray(supportFrame.position):new Vector3()
 if(![...q.toArray(),...origin.toArray()].every(Number.isFinite)||q.lengthSq()<1e-12)throw new TypeError('Diagnostic support frame must be finite with a nonzero quaternion')
 q.normalize();const normal=new Vector3(0,1,0).applyQuaternion(q)
 const body=extrema(),feet=sides.map(side=>({side,weightedVertexCount:0,...extrema(),ankleWorld:point(actor?.bones?.[side+'Foot'])?.toArray()??null,soleOffsetM:null,soleOffsetNormalM:null,supportGapM:null,ankleSupportDistanceM:null,minSupportDistanceM:Infinity})),descendants=sides.map(side=>{
  const set=new Set();actor?.bones?.[side+'Foot']?.traverse(node=>{if(node.isBone)set.add(node)});return set
 }),seen=[]
 let meshCount=0,vertexCount=0
 actor?.root?.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!mesh.geometry?.getAttribute('position'))return
  // First/third-person clones may share the same vertex data and palette.
  // Different world transforms or bind matrices must still be measured.
  if(seen.some(entry=>entry.geometry===mesh.geometry&&entry.skeleton===mesh.skeleton&&entry.world.equals(mesh.matrixWorld)&&entry.bind.equals(mesh.bindMatrix)&&entry.inverse.equals(mesh.bindMatrixInverse)))return
  seen.push({geometry:mesh.geometry,skeleton:mesh.skeleton,world:mesh.matrixWorld.clone(),bind:mesh.bindMatrix.clone(),inverse:mesh.bindMatrixInverse.clone()})
  meshCount++
  const count=mesh.geometry.getAttribute('position').count,indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),eligible=descendants.map(set=>new Set(mesh.skeleton.bones.flatMap((bone,index)=>set.has(bone)?[index]:[]))),p=new Vector3()
  for(let index=0;index<count;index++){
   mesh.getVertexPosition(index,p);mesh.localToWorld(p)
   if(!p.toArray().every(Number.isFinite))continue
   vertexCount++;include(body,p)
   if(!indices||!weights)continue
   for(let side=0;side<2;side++){
    let weight=0
    for(let channel=0;channel<Math.min(4,indices.itemSize,weights.itemSize);channel++)if(eligible[side].has(component(indices,index,channel)))weight+=component(weights,index,channel)
    if(weight>.5){feet[side].weightedVertexCount++;include(feet[side],p);feet[side].minSupportDistanceM=Math.min(feet[side].minSupportDistanceM,p.clone().sub(origin).dot(normal))}
   }
  }
 })
 for(const foot of feet){
  if(foot.weightedVertexCount&&foot.ankleWorld){
   foot.soleOffsetM=foot.ankleWorld[1]-foot.min[1]
   const ankleDistance=new Vector3().fromArray(foot.ankleWorld).sub(origin).dot(normal)
   foot.soleOffsetNormalM=ankleDistance-foot.minSupportDistanceM
   if(supportFrame){foot.supportGapM=foot.minSupportDistanceM;foot.ankleSupportDistanceM=ankleDistance}
  }else{foot.min=null;foot.max=null;foot.minSupportDistanceM=null}
 }
 const legLengths=sides.map(side=>{const upper=point(actor?.bones?.[side+'UpperLeg']),lower=point(actor?.bones?.[side+'LowerLeg']),foot=point(actor?.bones?.[side+'Foot']);return upper&&lower&&foot?upper.distanceTo(lower)+lower.distanceTo(foot):null}).filter(Number.isFinite)
 return {source:'posed-skinned-vertices',meshCount,vertexCount,bounds:finish(body),feet,supportPlane:supportFrame?{position:origin.toArray(),normal:normal.toArray()}:null,legLengthM:legLengths.length?legLengths.reduce((sum,value)=>sum+value,0)/legLengths.length:null}
}
