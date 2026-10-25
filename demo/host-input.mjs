import {Quaternion,Vector3} from 'three'

const point=b=>b.getWorldPosition(new Vector3())
function rotateWorld(bone,axis,angle){
 if(!bone||!angle)return
 const target=new Quaternion().setFromAxisAngle(axis,angle).multiply(bone.getWorldQuaternion(new Quaternion())),parent=bone.parent?.getWorldQuaternion(new Quaternion())??new Quaternion()
 bone.quaternion.copy(parent.invert().multiply(target));bone.updateWorldMatrix(true,true)
}
const finite=value=>Number.isFinite(value)?value:0

/** Apply authored demo input AFTER the caller restores its neutral transforms.
 * Anatomical world axes make the same synthetic seat work for authored bone
 * axes and rotated roots. This is not live tracking or a host camera adapter.
 * Bone positions/scales and unrelated objects are never changed.
 */
export function applyDemoHostPose(bones,{seated=false,headYaw=0,headPitch=0}={}){
 const required=['hips','head','leftUpperArm','rightUpperArm']
 if(required.some(role=>!bones?.[role]))throw new TypeError('Missing demo host anatomical anchors')
 const up=point(bones.head).sub(point(bones.hips)),lateral=point(bones.leftUpperArm).sub(point(bones.rightUpperArm))
 if(up.lengthSq()<1e-12||lateral.lengthSq()<1e-12)throw new TypeError('Degenerate demo host anatomical axes')
 up.normalize();lateral.addScaledVector(up,-lateral.dot(up))
 if(lateral.lengthSq()<1e-12)throw new TypeError('Parallel demo host anatomical axes')
 lateral.normalize();const forward=new Vector3().crossVectors(lateral,up).normalize()
 if(seated){
  for(const side of ['left','right']){rotateWorld(bones[side+'UpperLeg'],lateral,-Math.PI/2);rotateWorld(bones[side+'LowerLeg'],lateral,Math.PI/2)}
  rotateWorld(bones.leftUpperArm,forward,-Math.PI/2);rotateWorld(bones.rightUpperArm,forward,Math.PI/2)
 }
 const yaw=finite(headYaw),pitch=finite(headPitch),yawQ=new Quaternion().setFromAxisAngle(up,yaw)
 rotateWorld(bones.head,up,yaw);rotateWorld(bones.head,lateral.clone().applyQuaternion(yawQ),pitch)
 return {seated,lateral:lateral.toArray(),up:up.toArray(),forward:forward.toArray(),headYaw:yaw,headPitch:pitch}
}
