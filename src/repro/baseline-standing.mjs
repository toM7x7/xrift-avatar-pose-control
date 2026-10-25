import {Quaternion,Vector3} from 'three'
import {captureBones,restoreBones} from './baseline-rig.mjs'

const point=b=>b.getWorldPosition(new Vector3())
function worldRotation(b,q){const parent=b.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();b.quaternion.copy(parent.invert().multiply(q));b.updateWorldMatrix(true,true)}
function aim(b,child,target){const start=point(b),from=point(child).sub(start).normalize(),to=target.clone().sub(start).normalize();worldRotation(b,new Quaternion().setFromUnitVectors(from,to).multiply(b.getWorldQuaternion(new Quaternion())))}
function arm(upper,lower,hand,target,pole){
 const start=point(upper),l1=start.distanceTo(point(lower)),l2=point(lower).distanceTo(point(hand)),dir=target.clone().sub(start)
 const d=Math.max(Math.abs(l1-l2)+1e-5,Math.min(dir.length(),l1+l2-1e-5));if(dir.lengthSq()<1e-12)dir.set(0,-1,0);else dir.normalize()
 const along=(l1*l1+d*d-l2*l2)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),side=pole.clone().sub(start);side.addScaledVector(dir,-side.dot(dir));if(side.lengthSq()<1e-10){side.set(0,0,1);side.addScaledVector(dir,-side.dot(dir));if(side.lengthSq()<1e-10)side.set(1,0,0)}side.normalize()
 aim(upper,lower,start.clone().addScaledVector(dir,along).addScaledVector(side,height));aim(lower,hand,start.clone().addScaledVector(dir,d))
}
/** Head and tracked hands remain host-owned; only the rendered body is changed. */
export function applyStandingPose(rig,{heading=0,preserveHands=false}={}){
 const b=rig.bones,head=point(b.head),headQ=b.head.getWorldQuaternion(new Quaternion())
 const hands=preserveHands?Object.fromEntries(['left','right'].map(s=>[s,{p:point(b[s+'Hand']),q:b[s+'Hand'].getWorldQuaternion(new Quaternion()),pole:point(b[s+'LowerArm'])}])):null
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),heading)
 const preserved=bone=>{for(let p=bone.parent;p;p=p.parent)if(p===b.head||preserveHands&&(p===b.leftHand||p===b.rightHand))return true;return false}
 for(const [bone,rest] of rig.restLocal){if(preserved(bone))continue;if(bone!==b.hips)bone.position.copy(rest.position);bone.quaternion.copy(rest.quaternion);bone.scale.copy(rest.scale)}
 b.hips.updateWorldMatrix(true,true)
 worldRotation(b.hips,q.clone().multiply(rig.restBasis.clone().invert()).multiply(rig.hipsRest))
 worldRotation(b.head,headQ)
 const hips=point(b.hips).add(head.clone().sub(point(b.head)));b.hips.position.copy(b.hips.parent?b.hips.parent.worldToLocal(hips):hips);b.hips.updateWorldMatrix(true,true)
 for(const [sign,s] of [[1,'left'],[-1,'right']]){
  const shoulder=point(b[s+'UpperArm']),length=shoulder.distanceTo(point(b[s+'LowerArm']))+point(b[s+'LowerArm']).distanceTo(point(b[s+'Hand']))
  const target=hands?.[s].p??shoulder.clone().add(new Vector3(sign*.11,-length*.94,.04).applyQuaternion(q))
  const pole=hands?.[s].pole??shoulder.clone().add(new Vector3(sign*.3,-.2,.2).applyQuaternion(q))
  arm(b[s+'UpperArm'],b[s+'LowerArm'],b[s+'Hand'],target,pole)
  if(hands)worldRotation(b[s+'Hand'],hands[s].q)
 }
 rig.skeleton.update()
 const knee=s=>180-point(b[s+'UpperLeg']).sub(point(b[s+'LowerLeg'])).angleTo(point(b[s+'Foot']).sub(point(b[s+'LowerLeg'])))*180/Math.PI
 return {headDriftMm:point(b.head).distanceTo(head)*1000,headRotationErrorDegrees:b.head.getWorldQuaternion(new Quaternion()).angleTo(headQ)*180/Math.PI,handPositionErrorMm:hands?Math.max(...['left','right'].map(s=>point(b[s+'Hand']).distanceTo(hands[s].p)*1000)):null,handRotationErrorDegrees:hands?Math.max(...['left','right'].map(s=>b[s+'Hand'].getWorldQuaternion(new Quaternion()).angleTo(hands[s].q)*180/Math.PI)):null,knees:['left','right'].map(knee),upright:point(b.head).sub(point(b.hips)).normalize().dot(new Vector3(0,1,0))}
}
const scenes=new WeakMap()
export function installStandingPose(scene,rig,getOptions,related=[]){
 let manager=scenes.get(scene)
 if(!manager){
  const entries=new Set(),before=scene.onBeforeRender,after=scene.onAfterRender
  const restore=()=>[...entries].reverse().forEach(e=>e.restore())
  function onBefore(...args){restore();before.call(this,...args);const used=new Set();for(const e of entries){if(used.has(e.skeleton))continue;if(e.apply())used.add(e.skeleton)}}
  function onAfter(...args){try{after.call(this,...args)}finally{restore()}}
  manager={entries,dispose(){restore();if(scene.onBeforeRender===onBefore)scene.onBeforeRender=before;if(scene.onAfterRender===onAfter)scene.onAfterRender=after;scenes.delete(scene)}}
  scene.onBeforeRender=onBefore;scene.onAfterRender=onAfter;scenes.set(scene,manager)
 }
 let disposed=false,snapshot=null
 const api={last:null,frames:0,restored:true,error:null,skeleton:rig.skeleton,
  restore(){if(snapshot){restoreBones(snapshot);rig.skeleton.update();related.forEach(s=>s.update());snapshot=null}api.restored=true},
  apply(){const opts=getOptions();if(disposed||!opts.enabled||api.error)return false;snapshot=captureBones(rig.skeleton);api.restored=false;try{api.last=applyStandingPose(rig,opts);related.forEach(s=>s.update());api.frames++;return true}catch(e){api.error=String(e);api.restore();return false}},
  dispose(){api.restore();disposed=true;manager.entries.delete(api);if(!manager.entries.size)manager.dispose()},
 }
 manager.entries.add(api);return api
}
