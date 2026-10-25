import {Quaternion,Vector3} from 'three'
import {captureBones,restoreBones} from './vendor/render-pose.mjs'

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
export function applyStandingPose(rig,{heading=0,preserveHands=false,pitch=0,roll=0,kneeBend=0,armSwing=0}={}){
 const b=rig.bones,head=point(b.head),headQ=b.head.getWorldQuaternion(new Quaternion())
 const hands=preserveHands?Object.fromEntries(['left','right'].map(s=>[s,{p:point(b[s+'Hand']),q:b[s+'Hand'].getWorldQuaternion(new Quaternion()),pole:point(b[s+'LowerArm'])}])):null
 const safe=(value,limit)=>Number.isFinite(value)?Math.max(-limit,Math.min(limit,value)):0
 const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),heading)
 const q=yaw.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),safe(roll,.25))).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),safe(pitch,.3)))
 // Skin joint palettes can omit non-deforming parents. A bind WORLD matrix
 // then cannot be copied into a bone's LOCAL transform. Only pose identified
 // human joints, in world space; leave clothing/physics/face/fingers alone.
 const roles=['hips','spine','chest','neck','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand']
 const depth=bone=>{let n=0;for(let p=bone.parent;p;p=p.parent)n++;return n}
 const human=[...new Set(roles.map(role=>b[role]).filter(Boolean))].sort((a,z)=>depth(a)-depth(z))
 const bodyQ=q.clone().multiply(rig.restBasis.clone().invert())
 for(const bone of human){
  // Local bind translation is trustworthy only when the immediate parent's
  // bind matrix is also present. Otherwise preserve the authored pivot.
  if(bone!==b.hips&&rig.restWorld.has(bone.parent))bone.position.copy(rig.restLocal.get(bone).position)
  worldRotation(bone,bodyQ.clone().multiply(rig.restRotations.get(bone)))
 }
 const bend=safe(kneeBend,.25),lateral=new Vector3(1,0,0).applyQuaternion(q)
 if(bend)for(const side of ['left','right']){
  const upper=b[side+'UpperLeg'],lower=b[side+'LowerLeg']
  worldRotation(upper,new Quaternion().setFromAxisAngle(lateral,-bend*.35).multiply(upper.getWorldQuaternion(new Quaternion())))
  worldRotation(lower,new Quaternion().setFromAxisAngle(lateral,bend).multiply(lower.getWorldQuaternion(new Quaternion())))
 }
 worldRotation(b.head,headQ)
 const hips=point(b.hips).add(head.clone().sub(point(b.head)));b.hips.position.copy(b.hips.parent?b.hips.parent.worldToLocal(hips):hips);b.hips.updateWorldMatrix(true,true)
 for(const [sign,s] of [[1,'left'],[-1,'right']]){
  const shoulder=point(b[s+'UpperArm']),length=shoulder.distanceTo(point(b[s+'LowerArm']))+point(b[s+'LowerArm']).distanceTo(point(b[s+'Hand']))
  const target=hands?.[s].p??shoulder.clone().add(new Vector3(sign*(.11+Math.abs(safe(roll,.25))*.15),-length*.94,.04+safe(armSwing,.02)*sign).applyQuaternion(q))
  const pole=hands?.[s].pole??shoulder.clone().add(new Vector3(sign*.3,-.2,.2).applyQuaternion(q))
  arm(b[s+'UpperArm'],b[s+'LowerArm'],b[s+'Hand'],target,pole)
  if(hands)worldRotation(b[s+'Hand'],hands[s].q)
 }
 rig.skeleton.update()
 const knee=s=>180-point(b[s+'UpperLeg']).sub(point(b[s+'LowerLeg'])).angleTo(point(b[s+'Foot']).sub(point(b[s+'LowerLeg'])))*180/Math.PI
 return {headWorld:point(b.head).toArray(),feetWorld:['left','right'].map(s=>point(b[s+'Foot']).toArray()),headDriftMm:point(b.head).distanceTo(head)*1000,headRotationErrorDegrees:b.head.getWorldQuaternion(new Quaternion()).angleTo(headQ)*180/Math.PI,handPositionErrorMm:hands?Math.max(...['left','right'].map(s=>point(b[s+'Hand']).distanceTo(hands[s].p)*1000)):null,handRotationErrorDegrees:hands?Math.max(...['left','right'].map(s=>b[s+'Hand'].getWorldQuaternion(new Quaternion()).angleTo(hands[s].q)*180/Math.PI)):null,knees:['left','right'].map(knee),upright:point(b.head).sub(point(b.hips)).normalize().dot(new Vector3(0,1,0))}
}
const scenes=new WeakMap()
export function installStandingPose(scene,rig,getOptions,related=[]){
 let manager=scenes.get(scene)
 if(!manager){
  const entries=new Set(),before=scene.onBeforeRender,after=scene.onAfterRender
  let depth=0
  const restore=()=>[...entries].reverse().forEach(e=>e.restore())
  // A photo/mirror pass can recursively render this scene between two body
  // meshes. Keep one pose transaction until the OUTERMOST render finishes.
  // Restoring at the end of the inner pass mixes seated and upright copies.
  function onBefore(...args){
   if(depth===0)restore()
   depth++
   try{before.call(this,...args);if(depth===1){const used=new Set();for(const e of entries){if(used.has(e.hips))continue;if(e.apply())used.add(e.hips)}}}
   catch(error){depth--;if(depth===0)restore();throw error}
  }
  function onAfter(...args){try{after.call(this,...args)}finally{depth=Math.max(0,depth-1);if(depth===0)restore()}}
  manager={entries,dispose(){restore();if(scene.onBeforeRender===onBefore)scene.onBeforeRender=before;if(scene.onAfterRender===onAfter)scene.onAfterRender=after;scenes.delete(scene)}}
  scene.onBeforeRender=onBefore;scene.onAfterRender=onAfter;scenes.set(scene,manager)
 }
 let disposed=false,snapshot=null
 const api={last:null,frames:0,restored:true,error:null,skeleton:rig.skeleton,hips:rig.bones.hips,
  restore(){if(snapshot){restoreBones(snapshot);rig.skeleton.update();related.forEach(s=>s.update());snapshot=null}api.restored=true},
  apply(){const opts=getOptions();if(disposed||!opts.enabled||api.error)return false;snapshot=captureBones(rig.skeleton);api.restored=false;try{api.last=applyStandingPose(rig,opts);related.forEach(s=>s.update());api.frames++;return true}catch(e){api.error=String(e);api.restore();return false}},
  dispose(){api.restore();disposed=true;manager.entries.delete(api);if(!manager.entries.size)manager.dispose()},
 }
 manager.entries.add(api);return api
}
