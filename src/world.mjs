// World-matrix reads for the solvers. three's getWorldPosition/getWorldQuaternion/worldToLocal/localToWorld rebuild the
// whole parent chain on every call, and updateWorldMatrix(true,true) rebuilds a bone's whole subtree (hair, skirt,
// fingers). A solve reads a few hundred times, so most of its time went into rebuilding matrices nobody had changed.
//
// While a solve is running (`solving(rig, fn)`), everything under the rig's hips is read lazily instead:
// - on entry the hips' ancestors and subtree are refreshed once, so every matrix matches its local transform;
// - a read walks hips -> node and rebuilds only the links whose local transform, or whose parent, changed since their
//   matrix was built (compared by value, so it does not depend on the solver announcing its writes);
// - `settle` (the old updateWorldMatrix after a write) does nothing under the hips, `skinUpdate` refreshes the subtree
//   before the skeleton reads it, and on exit the subtree is refreshed once more.
// The matrices are produced by the same compose/multiply as three's, from the same inputs, so results are bit-identical;
// tests/world-reads.test.mjs holds every solver to that against `referenceWorldReads(true)` (plain three calls).
// Outside a solve, and for anything not under the hips (a support object, another avatar), these are plain three calls.
// Contract for solvers: nothing above the hips is moved by direct assignment during a solve; move it, then `settle` it.
import {Matrix4,Quaternion,Vector3} from 'three'

let scope=null,epoch=0,clock=0,reference=false
const records=new WeakMap(),chain=[],_position=new Vector3(),_scale=new Vector3(),_inverse=new Matrix4(),_composed=new Matrix4()

/** Tests only: true makes every helper a plain three call and `solving` a plain call. */
export function referenceWorldReads(on){if(scope)throw new Error('Cannot switch world reads during a solve');reference=on===true}

function recordOf(o){
 let r=records.get(o)
 if(!r){r={epoch:-1,px:0,py:0,pz:0,qx:0,qy:0,qz:0,qw:0,sx:0,sy:0,sz:0,stamp:0,against:0};records.set(o,r)}
 if(r.epoch!==epoch){
  // First look in this solve. The matrix was built when the solve began (or at the last flush): if the local transform
  // still composes to it, continue from it; otherwise remember a transform nothing equals, so the read rebuilds it.
  const p=o.position,q=o.quaternion,s=o.scale
  r.epoch=epoch;r.stamp=scope.base;r.against=scope.base
  let same=true
  if(o.matrixAutoUpdate){const a=_composed.compose(p,q,s).elements,b=o.matrix.elements;for(let i=0;i<16;i++)if(a[i]!==b[i]){same=false;break}}
  if(same){r.px=p.x;r.py=p.y;r.pz=p.z;r.qx=q.x;r.qy=q.y;r.qz=q.z;r.qw=q.w;r.sx=s.x;r.sy=s.y;r.sz=s.z}else r.px=NaN
 }
 return r
}
/** Make node.matrixWorld current. False when the node is not under the solved hips (the caller uses three's own call). */
function ensure(node){
 if(scope===null)return false
 const top=scope.top;let n=0
 for(let o=node;;o=o.parent){if(o===null)return false;chain[n++]=o;if(o===top)break}
 let parentStamp=scope.base
 for(let i=n-1;i>=0;i--){
  const o=chain[i],r=recordOf(o),p=o.position,q=o.quaternion,s=o.scale
  // Same steps as Object3D.updateWorldMatrix: recompose when the local transform changed, then parent x local.
  let rebuilt=!o.matrixAutoUpdate
  if(!rebuilt&&(p.x!==r.px||p.y!==r.py||p.z!==r.pz||q.x!==r.qx||q.y!==r.qy||q.z!==r.qz||q.w!==r.qw||s.x!==r.sx||s.y!==r.sy||s.z!==r.sz)){
   rebuilt=true;r.px=p.x;r.py=p.y;r.pz=p.z;r.qx=q.x;r.qy=q.y;r.qz=q.z;r.qw=q.w;r.sx=s.x;r.sy=s.y;r.sz=s.z
   o.updateMatrix()
  }
  if(rebuilt||r.against!==parentStamp){
   if(o.matrixWorldAutoUpdate===true){if(o.parent===null)o.matrixWorld.copy(o.matrix);else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld,o.matrix)}
   r.stamp=++clock;r.against=parentStamp
  }
  parentStamp=r.stamp
 }
 return true
}
function inScope(node){if(scope===null)return false;for(let o=node;o;o=o.parent)if(o===scope.top)return true;return false}
function above(node,top){for(let o=top.parent;o;o=o.parent)if(o===node)return true;return false}
// Everything under the hips current again, and the lazy state restarted from it.
function flush(){scope.top.updateWorldMatrix(false,true);scope.base=++clock;epoch++}

/** node.getWorldPosition(out) */
export function worldPositionOf(node,out=new Vector3()){return ensure(node)?out.setFromMatrixPosition(node.matrixWorld):node.getWorldPosition(out)}
/** node.getWorldQuaternion(out) */
export function worldQuaternionOf(node,out=new Quaternion()){if(!ensure(node))return node.getWorldQuaternion(out);node.matrixWorld.decompose(_position,out,_scale);return out}
/** node.worldToLocal(vector) */
export function intoLocal(node,vector){return ensure(node)?vector.applyMatrix4(_inverse.copy(node.matrixWorld).invert()):node.worldToLocal(vector)}
/** node.localToWorld(vector) */
export function intoWorld(node,vector){return ensure(node)?vector.applyMatrix4(node.matrixWorld):node.localToWorld(vector)}
/** node.updateWorldMatrix(parents,children) after a write. Under the solved hips the next read picks the change up. */
export function settle(node,parents=true,children=true){
 if(inScope(node))return
 node.updateWorldMatrix(parents,children)
 // Something above the hips moved: every lazy matrix below it is out of date.
 if(scope!==null&&above(node,scope.top))flush()
}
/** Before anything that reads bone.matrixWorld directly (SkinnedMesh.applyBoneTransform, Skeleton.update). */
export function settleSolved(){if(scope!==null)flush()}
/** skeleton.update(), which reads every bone's matrixWorld directly. */
export function skinUpdate(skeleton){settleSolved();skeleton.update()}

/** Run a solver with the rig's hips subtree read lazily. Nested calls for the same rig share one solve. */
export function solving(rig,fn){
 const top=rig?.bones?.hips
 if(reference||!top?.isObject3D)return fn()
 if(scope!==null&&scope.top===top)return fn()
 const outer=scope
 // A solve for another avatar inside this one (a carrier): leave this avatar fully current first.
 if(outer!==null)flush()
 top.updateWorldMatrix(true,true)
 scope={top,base:++clock};epoch++
 try{return fn()}
 finally{
  top.updateWorldMatrix(false,true)
  scope=outer;chain.length=0
  if(outer!==null){outer.top.updateWorldMatrix(true,true);outer.base=++clock;epoch++}
 }
}
