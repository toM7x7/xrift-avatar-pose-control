// Local-only check of role inference against each VRM's own humanoid map. No browser, uploads or edits to source VRMs.
//   node scripts/check-role-inference-vrms.mjs [vrmDir=vrm] [privateOutput=local-assets/role-inference-vrms.json]
// Per VRM (largest skin): original names, all names removed, names removed without foot geometry must match the humanoid map;
// names with left/right swapped, and names removed without toes or foot geometry, must be refused; smaller skins must be refused.
// The console and the returned summary use anonymous ids (file order); file names stay in the private output.
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {resolveRoles,INFERENCE_REQUIRED_ROLES} from '../src/role-inference.mjs'
import {glbSkeletons} from './glb-skeleton.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const input=path.resolve(root,process.argv[2]??'vrm'),output=path.resolve(root,process.argv[3]??'local-assets/role-inference-vrms.json')
const outputRelative=path.relative(root,output).replaceAll('\\','/')
if(outputRelative.startsWith('..')||path.isAbsolute(outputRelative)||!outputRelative.startsWith('local-assets/'))throw Error('Private output must stay inside local-assets/')
const files=(await fs.readdir(input).catch(()=>[])).filter(f=>/\.(vrm|glb)$/i.test(f)).sort()
if(!files.length){console.log(JSON.stringify({kind:'role-inference-local-vrms',vrms:0,note:'no local VRM files; nothing checked'}));process.exit(0)}

const swapSides=name=>name.replace(/Left|Right|left|right|[._]L(?![A-Za-z])|[._]R(?![A-Za-z])|_L_|_R_/g,m=>({Left:'Right',Right:'Left',left:'right',right:'left','.L':'.R','.R':'.L',_L:'_R',_R:'_L',_L_:'_R_',_R_:'_L_'})[m])
function without(skin,drop){
 const keep=skin.names.map((_,i)=>i).filter(i=>!drop.has(i)),at=new Map(keep.map((i,j)=>[i,j]))
 const up=i=>{let p=skin.parent[i];while(p>=0&&drop.has(p))p=skin.parent[p];return p<0?-1:at.get(p)}
 return {names:keep.map(i=>skin.names[i]),parent:keep.map(up),positions:keep.map(i=>skin.positions[i]),weights:keep.map(i=>skin.weights[i]),centroids:keep.map(i=>skin.centroids[i])}
}
const results=[],summary=[]
for(const [index,file] of files.entries()){
 const id=`local-${index+1}`,g=glbSkeletons(path.join(input,file)),body=g.skins.reduce((a,b)=>b.names.length>a.names.length?b:a),at=new Map(body.nodes.map((n,i)=>[n,i]))
 const truth=g.humanoid?Object.fromEntries(INFERENCE_REQUIRED_ROLES.map(r=>[r,at.get(g.humanoid[r])])):null
 const plain={...body,names:body.names.map((_,i)=>`b${i}`)},children=body.names.map(()=>[]);body.parent.forEach((p,i)=>p>=0&&children[p].push(i))
 const below=i=>children[i].flatMap(c=>[c,...below(c)]),toes=truth?new Set([...below(truth.leftFoot),...below(truth.rightFoot)]):new Set()
 const cases=[['names',body,'match'],['no names',plain,'match'],['no names, no foot geometry',{...plain,centroids:plain.centroids.map(()=>null)},'match'],
  ['names left/right swapped',{...body,names:body.names.map(swapSides)},'refuse'],['no names, no toes, no foot geometry',without({...plain,centroids:plain.centroids.map(()=>null)},toes),'refuse'],
  ...g.skins.filter(s=>s!==body).map(s=>[`other skin (${s.names.length} bones)`,s,'refuse'])]
 const rows=cases.map(([label,skeleton,expect])=>{
  const r=resolveRoles(skeleton),wrong=truth&&r.ok?INFERENCE_REQUIRED_ROLES.filter(role=>r.roles[role]!==truth[role]):[]
  const pass=expect==='match'?!!truth&&r.ok&&!wrong.length:!r.ok
  return {label,expect,pass,ok:r.ok,method:r.method,dialect:r.dialect,side:r.side,namesFound:r.namesFound,wrong,reason:r.reason}
 })
 results.push({id,file,version:g.version,bones:body.names.length,skins:g.skins.length,rows})
 summary.push({id,version:g.version,bones:body.names.length,cases:rows.length,passed:rows.filter(r=>r.pass).length,rows:rows.map(({label,pass,method,side,namesFound,wrong,reason})=>({label,pass,method,side:side.join('+'),namesFound,wrong,reason}))})
}
await fs.mkdir(path.dirname(output),{recursive:true})
await fs.writeFile(output,JSON.stringify({kind:'role-inference-local-vrms',date:new Date().toISOString(),results},null,1)+'\n')
const failed=summary.reduce((n,s)=>n+s.cases-s.passed,0)
console.log(JSON.stringify({kind:'role-inference-local-vrms',vrms:summary.length,cases:summary.reduce((n,s)=>n+s.cases,0),failed,summary},null,1))
process.exit(failed?1:0)
