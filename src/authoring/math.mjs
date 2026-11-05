// Small, allocation-light helpers shared by the authored-pose solver.
import {Matrix4,Quaternion,Vector3} from 'three'

export const DEG=Math.PI/180
export const UP=Object.freeze(new Vector3(0,1,0))
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))
export const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback
export const point=(bone,out=new Vector3())=>bone.getWorldPosition(out)
export const worldQ=(bone,out=new Quaternion())=>bone.getWorldQuaternion(out)
export const restPoint=(rig,bone)=>new Vector3().setFromMatrixPosition(rig.restWorld.get(bone))

/** Orthonormal frame whose columns are (x, y, z); y is kept exactly, z is the hint made perpendicular. */
export function frameYZ(y,zHint,out=new Quaternion()){
 const yy=y.clone().normalize(),z=zHint.clone().addScaledVector(yy,-zHint.dot(yy))
 if(z.lengthSq()<1e-12){z.set(0,0,1).addScaledVector(yy,-yy.z);if(z.lengthSq()<1e-12)z.set(1,0,0).addScaledVector(yy,-yy.x)}
 z.normalize()
 const x=new Vector3().crossVectors(yy,z)
 return out.setFromRotationMatrix(new Matrix4().makeBasis(x,yy,z))
}
export function axes(q){return {x:new Vector3(1,0,0).applyQuaternion(q),y:new Vector3(0,1,0).applyQuaternion(q),z:new Vector3(0,0,1).applyQuaternion(q)}}

/** Set a bone's world rotation, keeping its local translation. */
export function setWorldRotation(bone,q){
 const parent=bone.parent?bone.parent.getWorldQuaternion(new Quaternion()):new Quaternion()
 bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(false,true)
}
export function setWorldPosition(bone,p){
 const local=p.clone();if(bone.parent){bone.parent.updateWorldMatrix(true,false);bone.parent.worldToLocal(local)}
 bone.position.copy(local);bone.updateWorldMatrix(false,true)
}
/** Anatomical rotation (X left, Y up, Z forward in the rest body basis) → bone world rotation. */
export function anatomicalToWorld(rig,bone,heading,anat){
 return heading.clone().multiply(anat).multiply(rig.restBasis.clone().invert()).multiply(rig.restRotations.get(bone))
}
/** World rotation of a bone whose current world frame should be `current` where its rest anatomical frame was `rest`. */
export function frameToWorld(rig,bone,current,rest){
 return current.clone().multiply(rest.clone().invert()).multiply(rig.restBasis.clone().invert()).multiply(rig.restRotations.get(bone))
}
export function eulerYXZ(yawDeg=0,pitchDeg=0,rollDeg=0){
 // yaw about +Y (positive turns toward the body's left), pitch about +X (positive bends forward), roll about +Z (positive lowers the right shoulder)
 return new Quaternion().setFromAxisAngle(UP,yawDeg*DEG).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),pitchDeg*DEG)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),rollDeg*DEG))
}
export function signedAngle(from,to,axis){
 const a=from.clone().addScaledVector(axis,-from.dot(axis)),b=to.clone().addScaledVector(axis,-to.dot(axis))
 if(a.lengthSq()<1e-12||b.lengthSq()<1e-12)return 0
 a.normalize();b.normalize()
 return Math.atan2(new Vector3().crossVectors(a,b).dot(axis),clamp(a.dot(b),-1,1))
}
export function lerp(a,b,t){return a+(b-a)*t}
export const EASE={
 linear:t=>t,
 inSine:t=>1-Math.cos(t*Math.PI/2),outSine:t=>Math.sin(t*Math.PI/2),inOutSine:t=>-(Math.cos(Math.PI*t)-1)/2,
 inCubic:t=>t*t*t,outCubic:t=>1-(1-t)**3,inOutCubic:t=>t<.5?4*t*t*t:1-(-2*t+2)**3/2,
 outQuart:t=>1-(1-t)**4,outExpo:t=>t>=1?1:1-2**(-10*t),
 outBack:t=>{const c1=1.70158,c3=c1+1;return 1+c3*(t-1)**3+c1*(t-1)**2},
 // Snappy arrival with a small overshoot, then settle: good for a thrust.
 outBackSoft:t=>{const c1=.9,c3=c1+1;return 1+c3*(t-1)**3+c1*(t-1)**2},
 step:t=>t<1?0:1,
}
export function ease(name,t){const f=EASE[name]??EASE.linear;return f(clamp(t,0,1))}
