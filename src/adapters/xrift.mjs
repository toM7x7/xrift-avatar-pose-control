import {Vector3} from 'three'

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
