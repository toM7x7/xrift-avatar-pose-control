import {Vector3} from 'three'
import {inferHumanoidRigs} from '../humanoid-inference.mjs'
import {inspectHumanoidRigs} from '../vendor/render-pose.mjs'

export function within(object,ancestor){for(let node=object;node;node=node.parent)if(node===ancestor)return true;return false}
function family(rigs){const byHips=new Map();for(const rig of rigs)if(rig.supported){const old=byHips.get(rig.bones.hips);if(!old||rig.skeleton.bones.length>old.skeleton.bones.length)byHips.set(rig.bones.hips,rig)}return [...byHips.values()]}
export function rigScope(rig){
  for(let node=rig.mesh;node;node=node.parent)if(within(rig.bones.hips,node))return node
  return rig.mesh
}
/** Public Interactable metadata used by the host's remote-player hit target.
 * It is a host convention, not a promised SDK avatar API. Fail closed if it
 * disappears or becomes ambiguous; never fall back to the viewing camera.
 */
export function remotePlayerScopes(scene){
  const entries=[]
  scene.traverse(object=>{const data=object.userData,id=data?.id;if(typeof id==='string'&&id.startsWith('remote-player-')&&typeof data.onInteract==='function'&&object.parent&&object.parent!==scene)entries.push({playerId:id.slice('remote-player-'.length),scope:object.parent})})
  return entries
}
export function selectRiderRig({scene,rigs,occupantId,localUserId,seatPosition}){
  if(!occupantId)return {status:'empty',rig:null,source:null,relatedSkeletons:[]}
  const scopes=remotePlayerScopes(scene)
  let candidates,source
  if(occupantId===localUserId){
    source='local-unclaimed'
    candidates=family(rigs.filter(r=>!scopes.some(s=>within(r.mesh,s.scope))))
  }else{
    source='remote-player-marker'
    const matches=[...new Set(scopes.filter(s=>s.playerId===occupantId).map(s=>s.scope))]
    if(matches.length!==1)return {status:matches.length?'ambiguous-owner':'waiting-for-avatar',rig:null,source,relatedSkeletons:[]}
    candidates=family(rigs.filter(r=>within(r.mesh,matches[0])))
  }
  if(candidates.length!==1)return {status:candidates.length?'ambiguous-rig':'unsupported-or-loading',rig:null,source,relatedSkeletons:[]}
  const rig=candidates[0]
  // Seat calibration, independent of any active camera (photo mode included).
  if(!seatPosition||rig.bones.hips.getWorldPosition(new Vector3()).distanceTo(seatPosition)>1.4)return {status:'waiting-for-seat',rig:null,source,relatedSkeletons:[]}
  const scope=rigScope(rig),relatedSkeletons=[...new Set(rigs.filter(r=>within(r.mesh,scope)).map(r=>r.skeleton))]
  return {status:'ready',rig,source,relatedSkeletons}
}
/**
 * Opt-in: selectRiderRig, then, only when no name-readable rig is usable (unsupported-or-loading / waiting-for-seat),
 * infer roles for unreadable skeletons near the seat and select again. Inferred hips must also be within 1.4m of the seat.
 * exclude: skeletons that are never riders (e.g. the vehicle's own). Refusals keep the original status; attempts explain why.
 */
export function selectRiderRigWithInference({scene,rigs,occupantId,localUserId,seatPosition,exclude=()=>false,inferRadius=3}){
  const found=selectRiderRig({scene,rigs,occupantId,localUserId,seatPosition})
  if(!seatPosition||(found.status!=='unsupported-or-loading'&&found.status!=='waiting-for-seat'))return {...found,inference:null,attempts:[]}
  const attempts=inferHumanoidRigs(rigs,scene,{exclude,near:seatPosition,maxDistance:inferRadius})
  const usable=attempts.filter(a=>a.rig&&a.rig.bones.hips.getWorldPosition(new Vector3()).distanceTo(seatPosition)<=1.4)
  if(!usable.length)return {...found,inference:null,attempts}
  const again=selectRiderRig({scene,rigs:[...rigs,...usable.map(a=>a.rig)],occupantId,localUserId,seatPosition})
  if(again.status!=='ready')return {...found,inference:null,attempts}
  return {...again,inference:usable.find(a=>a.rig===again.rig)??null,attempts}
}

/**
 * The avatar rig of one user for a standing action (no seat): the remote player's rig inside its
 * remote-player-<id> scope, or, for the local user, a rig outside every remote scope. Its hips must be near the
 * user's feet. Name lookup first; only when no name-readable rig qualifies are roles inferred (bone-name dialects +
 * skeleton shape) for the unreadable skeletons there. A refusal says why in `diagnosis` (for a console line the
 * user can copy), and never falls back to guessing.
 * feet: the user's foot point (world). radius: horizontal hips distance (m). hipsAbove: [min,max] hips height above the feet (m).
 */
export function selectActorRig({scene,userId,isLocal,feet,rigs=inspectHumanoidRigs(scene),exclude=()=>false,radius=1.2,hipsAbove=[.15,2.6],infer=true}){
  const empty={rig:null,relatedSkeletons:[],roles:null,inference:null,diagnosis:null}
  const scopes=remotePlayerScopes(scene)
  let scope=null
  const source=isLocal?'local-unclaimed':'remote-player-marker'
  if(!isLocal){
    const matches=[...new Set(scopes.filter(s=>s.playerId===userId).map(s=>s.scope))]
    if(matches.length!==1)return {status:matches.length?'ambiguous-owner':'waiting-for-avatar',source,...empty}
    scope=matches[0]
  }
  const mine=rig=>!exclude(rig)&&(scope?within(rig.mesh,scope):!scopes.some(s=>within(rig.mesh,s.scope)))
  const at=new Vector3(),horizontal=p=>Math.hypot(p.x-feet.x,p.z-feet.z)
  const near=bone=>{bone.getWorldPosition(at);const up=at.y-feet.y;return horizontal(at)<=radius&&up>=hipsAbove[0]&&up<=hipsAbove[1]}
  const nearest=list=>list.map(rig=>({rig,d:horizontal(rig.bones.hips.getWorldPosition(at))})).sort((a,b)=>a.d-b.d||b.rig.skeleton.bones.length-a.rig.skeleton.bones.length)[0]?.rig??null
  const ready=(rig,roles,inference)=>{
    const scopeOfRig=rigScope(rig),related=new Set([rig.skeleton])
    for(const other of rigs)if(within(other.mesh,scopeOfRig))related.add(other.skeleton)
    return {status:'ready',source,rig,relatedSkeletons:[...related],roles,inference,diagnosis:null}
  }
  const named=nearest(family(rigs.filter(rig=>rig.supported&&mine(rig)&&near(rig.bones.hips))))
  if(named)return ready(named,{method:'names'},null)
  // Unreadable by name: the skeletons of this user standing at the feet (any bone within reach of the hips window).
  const reach=radius+hipsAbove[1]
  const candidates=rigs.filter(rig=>!rig.supported&&mine(rig)&&rig.skeleton.bones.some(b=>b.getWorldPosition(at).distanceTo(feet)<=reach))
  if(!candidates.length)return {status:'no-avatar-near',source,...empty,diagnosis:{reason:'no skinned skeleton of this user near the feet',skeletons:rigs.filter(mine).length}}
  const attempts=infer?inferHumanoidRigs(candidates,scene):[]
  const inferred=nearest(family(attempts.map(a=>a.rig).filter(rig=>rig&&near(rig.bones.hips))))
  if(inferred){const attempt=attempts.find(a=>a.rig===inferred);return ready(inferred,{method:attempt.result.method,dialect:attempt.result.dialect,side:attempt.result.side},attempt)}
  // Explain with the largest unreadable skeleton (the body, not hair or accessories).
  const body=[...candidates].sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length)[0],attempt=attempts.find(a=>a.source.skeleton===body.skeleton)??attempts[0]??null
  return {status:'unsupported',source,...empty,inference:attempt,diagnosis:{
    reason:attempt?attempt.result.reason??'inferred hips are not at the feet':'role inference is off',
    conflicts:attempt?.result.conflicts??[],mesh:body.mesh.name,bones:body.skeleton.bones.length,missingByName:body.missing,
    inferred:attempt?.names??{},boneNames:body.skeleton.bones.map(b=>b.name)}}
}
