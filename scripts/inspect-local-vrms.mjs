// Local-only GLB inventory. No browser, uploads, external asset requests or edits to source VRMs.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {Matrix4,Quaternion,Vector3,Box3} from 'three'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const input=path.resolve(root,process.argv[2]??'vrm')
const output=path.resolve(root,process.argv[3]??'local-assets/vrm-inspection-2026-10-25.json')
const outputRelative=path.relative(root,output)
if(outputRelative.startsWith('..')||path.isAbsolute(outputRelative)||!outputRelative.replaceAll('\\','/').startsWith('local-assets/'))throw Error('Private inventory output must stay inside local-assets/')
const required=['hips','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
const xyz=v=>v.toArray().map(n=>Number(n.toFixed(6)))
function parseGLB(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67)throw Error('Expected GLB magic')
 const version=bytes.readUInt32LE(4),declaredLength=bytes.readUInt32LE(8)
 if(version!==2||declaredLength!==bytes.length)throw Error('Unsupported GLB version or invalid declared length')
 let json=null,offset=12,binBytes=0
 while(offset+8<=bytes.length){const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;if(offset+length>bytes.length)throw Error('GLB chunk exceeds file bounds');if(type===0x4e4f534a)json=JSON.parse(bytes.subarray(offset,offset+length).toString('utf8').replace(/[\u0000\s]+$/g,''));if(type===0x004e4942)binBytes+=length;offset+=length}
 if(!json)throw Error('Missing GLB JSON chunk')
 return {json,version,binBytes}
}
function inspect(json){
 const nodes=json.nodes??[],parents=new Map(),warnings=[]
 nodes.forEach((n,i)=>(n.children??[]).forEach(c=>{if(parents.has(c))warnings.push('Node has multiple parents: '+c);parents.set(c,i)}))
 const worlds=new Map(),visiting=new Set()
 function world(index){if(worlds.has(index))return worlds.get(index);if(visiting.has(index))throw Error('Cyclic node tree');visiting.add(index);const n=nodes[index];if(!n)throw Error('Missing referenced node');const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));const m=parents.has(index)?world(parents.get(index)).clone().multiply(local):local;worlds.set(index,m);visiting.delete(index);return m}
 nodes.forEach((_,i)=>world(i))
 const ext=json.extensions??{},vrm0=ext.VRM,vrm1=ext.VRMC_vrm,source=vrm1??vrm0,bones=vrm1?Object.fromEntries(Object.entries(vrm1.humanoid?.humanBones??{}).map(([role,v])=>[role,v.node])):Object.fromEntries((vrm0?.humanoid?.humanBones??[]).map(v=>[v.bone,v.node]))
 const worldBone=role=>Number.isInteger(bones[role])?new Vector3().setFromMatrixPosition(world(bones[role])):null
 const humanoid=Object.fromEntries(Object.entries(bones).map(([role,index])=>[role,{node:index,name:nodes[index]?.name??null,position:xyz(new Vector3().setFromMatrixPosition(world(index)))}]))
 const lengths={}
 for(const side of ['left','right'])for(const [label,a,z]of [['thigh','UpperLeg','LowerLeg'],['calf','LowerLeg','Foot'],['upperArm','UpperArm','LowerArm'],['forearm','LowerArm','Hand']]){const av=worldBone(side+a),zv=worldBone(side+z);if(av&&zv)lengths[side+label]=Number(av.distanceTo(zv).toFixed(6))}
 const head=worldBone('head'),hips=worldBone('hips'),feet=['leftFoot','rightFoot'].map(worldBone).filter(Boolean),ankleMean=feet.length?feet.reduce((s,v)=>s+v.y,0)/feet.length:null
 const bounds=new Box3(),primitiveBounds=[]
 nodes.forEach((n,index)=>{if(n.mesh===undefined)return;for(const [primitiveIndex,p]of (json.meshes?.[n.mesh]?.primitives??[]).entries()){const position=json.accessors?.[p.attributes?.POSITION];if(!position?.min||!position?.max){warnings.push('No accessor bounds for mesh '+n.mesh+' primitive '+primitiveIndex);continue}const b=new Box3(new Vector3(...position.min),new Vector3(...position.max)).applyMatrix4(world(index));bounds.union(b);primitiveBounds.push({node:index,mesh:n.mesh,primitive:primitiveIndex,vertexCount:position.count,min:xyz(b.min),max:xyz(b.max),skin:n.skin??null})}})
 const skinPalettes=(json.skins??[]).map((skin,index)=>{const joints=new Set(skin.joints??[]);return {index,name:skin.name??null,jointCount:joints.size,meshNodes:nodes.flatMap((n,i)=>n.skin===index?[i]:[]),mappedRolesInPalette:Object.keys(bones).filter(role=>joints.has(bones[role])),missingRequired:required.filter(role=>!joints.has(bones[role])),allRequiredPresent:required.every(role=>joints.has(bones[role]))}})
 const uriAssets=[...(json.buffers??[]).map(v=>({kind:'buffer',uri:v.uri})),...(json.images??[]).map(v=>({kind:'image',uri:v.uri}))].filter(v=>v.uri)
 const externalAssets=uriAssets.filter(v=>!v.uri.startsWith('data:'))
 if(externalAssets.length)warnings.push('External/relative asset URIs will be blocked by the demo local loader')
 if(!source)warnings.push('No VRM0/VRM1 extension')
 if(!skinPalettes.some(s=>s.allRequiredPresent))warnings.push('No single skin palette contains all core required humanoid bones')
 return {vrmGeneration:vrm1?'1.x':vrm0?'0.x':'unknown',specVersion:source?.specVersion??null,gltfAsset:json.asset,extensionsUsed:json.extensionsUsed??[],metadata:source?.meta??null,humanoid,humanoidRoleCount:Object.keys(bones).length,missingHumanoidRequired:required.filter(role=>bones[role]===undefined),skinPalettes,dimensions:{accessorBoundsM:bounds.isEmpty()?null:{min:xyz(bounds.min),max:xyz(bounds.max),size:xyz(bounds.getSize(new Vector3()))},headToAnkleM:head&&ankleMean!==null?Number((head.y-ankleMean).toFixed(6)):null,headToHipsM:head&&hips?Number(head.distanceTo(hips).toFixed(6)):null,limbLengthsM:lengths,interpretation:'Approximate rest-pose JSON/node/accessor dimensions in glTF units treated as meters; excludes morph, spring bone and runtime skin evaluation.'},counts:{nodes:nodes.length,meshes:json.meshes?.length??0,skins:skinPalettes.length,materials:json.materials?.length??0,images:json.images?.length??0,primitives:primitiveBounds.length},primitiveBounds,externalAssets,warnings}
}
const files=(await fs.readdir(input,{withFileTypes:true})).filter(v=>v.isFile()&&/\.vrm$/i.test(v.name)).map(v=>v.name).sort((a,b)=>a.localeCompare(b,'en'))
const models=[]
for(const name of files){try{const bytes=await fs.readFile(path.join(input,name)),{json,version,binBytes}=parseGLB(bytes);models.push({sourceFile:name,sourceRelativePath:path.relative(root,path.join(input,name)).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),glbVersion:version,binBytes,...inspect(json)})}catch(error){models.push({sourceFile:name,error:String(error)})}}
// A02 denotes the shortest available rig in THIS dataset only; historical A02 identity is unverified.
const eligible=models.filter(m=>m.dimensions?.headToAnkleM!==null&&!m.error).sort((a,b)=>a.dimensions.headToAnkleM-b.dimensions.headToAnkleM),smallest=eligible[0]
let other=0
for(const model of models)model.anonymousId=model===smallest?'A02':++other===1?'A01':'A'+String(other+1).padStart(2,'0')
const report={createdAt:new Date().toISOString(),inputDirectory:path.relative(root,input).replaceAll('\\','/'),privacy:'Private local inventory; do not commit or copy literal metadata into public docs.',assignment:'Anonymous IDs assigned for this local dataset. A02 is the shortest humanoid; remaining files retain deterministic name order. No claim of matching historical A01/A02/A03 identities.',rightsInterpretation:'Metadata is recorded as supplied and is not proof of usage permission, authorship, or redistribution rights. No external sites were opened.',models}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({output:outputRelative.replaceAll('\\','/'),models:models.map(m=>({id:m.anonymousId,generation:m.vrmGeneration,bytes:m.bytes,headToAnkleM:m.dimensions?.headToAnkleM,approxSizeM:m.dimensions?.accessorBoundsM?.size,skinPalettes:m.skinPalettes?.map(s=>({joints:s.jointCount,allRequiredPresent:s.allRequiredPresent,missingRequired:s.missingRequired})),externalAssetCount:m.externalAssets?.length,warnings:m.warnings,error:m.error})),note:'Exact filenames, hashes and metadata retained only in ignored local report.'},null,2))
