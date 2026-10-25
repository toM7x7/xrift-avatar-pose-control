// Offline skin influence audit. Source VRMs remain unchanged; private report only.
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const inventory=JSON.parse(await fs.readFile(path.join(root,'local-assets/vrm-inspection-2026-10-25.json'),'utf8'))
const threshold=1e-5,models=[]
const types={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']}
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}
for(const input of inventory.models){
 const bytes=await fs.readFile(path.join(root,input.sourceRelativePath));let json,bin
 for(let offset=12;offset+8<=bytes.length;){const length=bytes.readUInt32LE(offset),kind=bytes.readUInt32LE(offset+4);offset+=8;if(kind===0x4e4f534a)json=JSON.parse(bytes.subarray(offset,offset+length).toString('utf8').replace(/[\u0000\s]+$/g,''));if(kind===0x004e4942)bin=bytes.subarray(offset,offset+length);offset+=length}
 if(!json||!bin)throw Error('Expected embedded GLB JSON and binary chunks')
 const cache=new Map()
 function accessor(index){
  if(cache.has(index))return cache.get(index)
  const a=json.accessors[index],width=widths[a.type],[size,method]=types[a.componentType]??[]
  if(!width||!size)throw Error('Unsupported accessor format')
  if(a.sparse)throw Error('Sparse accessor requires explicit audit support')
  const view=json.bufferViews?.[a.bufferView];if(view?.buffer!==0)throw Error('Expected embedded buffer 0')
  const base=(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??width*size
  const row=i=>Array.from({length:width},(_,c)=>{const value=bin[method](base+i*stride+c*size);if(!a.normalized)return value;return a.componentType===5121?value/255:a.componentType===5123?value/65535:a.componentType===5120?Math.max(-1,value/127):a.componentType===5122?Math.max(-1,value/32767):value})
  const result={count:a.count,row};cache.set(index,result);return result
 }
 const nodes=json.nodes??[],parents=new Map(),rolesByNode=new Map(Object.entries(input.humanoid).map(([role,value])=>[value.node,role]))
 nodes.forEach((n,i)=>(n.children??[]).forEach(child=>parents.set(child,i)))
 const roleAncestors=index=>{const roles=[];for(let n=index;n!==undefined;n=parents.get(n)){const role=rolesByNode.get(n);if(role)roles.push(role)}return roles}
 const groups=new Map(),rigid=[]
 nodes.forEach((node,nodeIndex)=>{if(node.mesh===undefined)return;for(const [primitiveIndex,p]of json.meshes[node.mesh].primitives.entries()){
  if(p.attributes.POSITION===undefined)continue
  const pos=accessor(p.attributes.POSITION),indices=p.indices===undefined?Array.from({length:pos.count},(_,i)=>i):Array.from({length:accessor(p.indices).count},(_,i)=>accessor(p.indices).row(i)[0])
  if(node.skin===undefined){rigid.push({node:nodeIndex,mesh:node.mesh,primitive:primitiveIndex,vertexCount:new Set(indices).size,ancestorHumanoidRoles:roleAncestors(nodeIndex)});continue}
  const key=[nodeIndex,node.skin,p.attributes.POSITION,p.attributes.JOINTS_0,p.attributes.WEIGHTS_0,p.attributes.JOINTS_1,p.attributes.WEIGHTS_1].join(':')
  let group=groups.get(key)
  if(!group){group={node:nodeIndex,mesh:node.mesh,skin:node.skin,position:p.attributes.POSITION,influenceSets:[0,1].flatMap(i=>p.attributes['JOINTS_'+i]===undefined?[]:[{joints:p.attributes['JOINTS_'+i],weights:p.attributes['WEIGHTS_'+i]}]),referenced:new Set(),primitives:[]};groups.set(key,group)}
  indices.forEach(i=>group.referenced.add(i));group.primitives.push(primitiveIndex)
 }})
 const perRole=Object.fromEntries(Object.keys(input.humanoid).map(role=>[role,{directVertices:0,directWeightSum:0,descendantVertices:0}])),geometry=[],totals={uniqueGeometryVertices:0,verticesWithLegInfluence:0,verticesWithFootInfluence:0,verticesWithHipInfluence:0,maximumRawLegWeight:0,maximumRawFootWeight:0}
 for(const group of groups.values()){
  const skin=json.skins[group.skin],sets=group.influenceSets.map(s=>({joints:accessor(s.joints),weights:accessor(s.weights)})),stats={node:group.node,mesh:group.mesh,skin:group.skin,primitives:group.primitives,vertices:group.referenced.size,legVertices:0,footVertices:0,hipVertices:0,directRoleVertices:{}}
  for(const index of group.referenced){const direct=new Set(),ancestors=new Set();for(const set of sets){const joints=set.joints.row(index),weights=set.weights.row(index);for(let c=0;c<weights.length;c++){const w=weights[c],nodeIndex=skin.joints[joints[c]],chain=roleAncestors(nodeIndex);if(chain.some(r=>/^(left|right)(UpperLeg|LowerLeg|Foot|Toes)$/.test(r)))totals.maximumRawLegWeight=Math.max(totals.maximumRawLegWeight,w);if(chain.some(r=>/^(left|right)(Foot|Toes)$/.test(r)))totals.maximumRawFootWeight=Math.max(totals.maximumRawFootWeight,w);if(w<=threshold)continue;const role=rolesByNode.get(nodeIndex);if(role){direct.add(role);perRole[role].directWeightSum+=w}chain.forEach(role=>ancestors.add(role))}}
   totals.uniqueGeometryVertices++
   for(const role of direct){perRole[role].directVertices++;stats.directRoleVertices[role]=(stats.directRoleVertices[role]??0)+1}
   for(const role of ancestors)perRole[role].descendantVertices++
   if([...ancestors].some(r=>/^(left|right)(UpperLeg|LowerLeg|Foot|Toes)$/.test(r))){totals.verticesWithLegInfluence++;stats.legVertices++}
   if([...ancestors].some(r=>/^(left|right)(Foot|Toes)$/.test(r))){totals.verticesWithFootInfluence++;stats.footVertices++}
   if(direct.has('hips')){totals.verticesWithHipInfluence++;stats.hipVertices++}
  }
  geometry.push(stats)
 }
 const rigidLegVertices=rigid.filter(r=>r.ancestorHumanoidRoles.some(role=>/^(left|right)(UpperLeg|LowerLeg|Foot|Toes)$/.test(role))).reduce((s,v)=>s+v.vertexCount,0)
 models.push({anonymousId:input.anonymousId,sourceFile:input.sourceFile,threshold,totals,rigidLegVertices,perRole,geometry,rigid,interpretation:'Counts unique referenced vertices per geometry/node/skin; glTF index sharing across primitives is deduplicated. Ancestor influence includes helper joints below mapped humanoid bones. Does not prove rendered visibility or material opacity.'})
}
const output=path.join(root,'local-assets/vrm-weight-inspection-2026-10-25.json')
await fs.writeFile(output,JSON.stringify({createdAt:new Date().toISOString(),privacy:'Private local audit; do not commit filenames or model details.',models},null,2)+'\n')
console.log(JSON.stringify({output:'local-assets/vrm-weight-inspection-2026-10-25.json',models:models.map(m=>({id:m.anonymousId,...m.totals,rigidLegVertices:m.rigidLegVertices,legRoleVertices:Object.fromEntries(Object.entries(m.perRole).filter(([r])=>/(UpperLeg|LowerLeg|Foot|Toes)$/.test(r)).map(([r,v])=>[r,v.directVertices]))}))},null,2))
