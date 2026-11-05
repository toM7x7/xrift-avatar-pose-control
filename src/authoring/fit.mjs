// Authoring aid: fit the orientation of a two-hand pair (clam / push) so both
// wrists and forearms stay inside comfortable ranges on a given body, while
// staying close to what the author asked for. The author keeps the contact
// centre and the hand shape; only the pair axes (yaw/pitch/roll) are searched.
import {captureBones,restoreBones} from '../vendor/render-pose.mjs'
import {applyAuthoredPose} from './solve.mjs'
import {authoringRig} from './rig.mjs'
import {resolveKey} from './clip.mjs'

/** Cost of one key on this rig: anatomical arm cost + skin clearance + contact shift. */
export function keyCost(rig,key,{heading=0,hostPose=null}={}){
 const info=authoringRig(rig)
 if(hostPose)hostPose()
 rig.mesh.updateWorldMatrix(true,true)
 const snap=captureBones(rig.skeleton)
 try{
  const r=applyAuthoredPose(rig,{...resolveKey(key,info),weight:1},{heading,state:{}})
  let cost=0
  for(const s of ['left','right']){
   const a=r.arms[s];if(!a)continue
   cost+=a.cost
   const clearance=Math.min(...Object.values(r.handClearance[s]??{}).map(v=>v.mm??Infinity))
   if(clearance<10)cost+=((10-clearance)/15)**2*4
  }
  cost+=(r.pairShiftMm/40)**2
  return {cost,result:r}
 }finally{restoreBones(snap);rig.skeleton.update()}
}

/**
 * Search the pair axes of clip.keys[name] (degrees). range: half-width of the
 * coarse search per axis; prior: how strongly to stay near the authored axes.
 * Returns {axes, cost, before, evaluated}.
 */
export function fitPairAxes(rig,key,{range=key?.hands?.pair?.fit?.range??[75,45,60],step=key?.hands?.pair?.fit?.step??[15,15,20],prior=key?.hands?.pair?.fit?.prior??.35,heading=0,hostPose=null}={}){
 if(!key?.hands?.pair)throw new TypeError('Key has no hand pair to fit')
 const base=[...(key.hands.pair.axes??[0,0,0])].map(Number),evalAxes=axes=>{const k=structuredClone(key);k.hands.pair.axes=axes;const c=keyCost(rig,k,{heading,hostPose}).cost;const dev=axes.reduce((s,v,i)=>s+((v-base[i])/45)**2,0);return c+prior*dev}
 const before=evalAxes(base)
 let best=base,bestCost=before,evaluated=1
 const grid=(center,half,st)=>{const out=[];for(let v=-half;v<=half+1e-9;v+=st)out.push(center+v);return out}
 for(const y of grid(base[0],range[0],step[0]))for(const p of grid(base[1],range[1],step[1]))for(const r of grid(base[2],range[2],step[2])){const c=evalAxes([y,p,r]);evaluated++;if(c<bestCost){bestCost=c;best=[y,p,r]}}
 let st=[...step]
 for(let level=0;level<3;level++){
  st=st.map(v=>v/3);const center=best
  for(const y of grid(center[0],st[0],st[0]))for(const p of grid(center[1],st[1],st[1]))for(const r of grid(center[2],st[2],st[2])){const c=evalAxes([y,p,r]);evaluated++;if(c<bestCost){bestCost=c;best=[y,p,r]}}
 }
 return {axes:best.map(v=>Math.round(v*10)/10),cost:bestCost,before,evaluated}
}
