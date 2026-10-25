import {Quaternion,Vector3} from 'three'
const up=new Vector3(0,1,0)
/** Flight yaw uses -Z as forward. The display/photo camera is never an input. */
export function resolveRiderHeading({rig=null,seatQuaternion=new Quaternion(),lookYaw=0,previous}={}){
 if(rig){
  // Convert the authored anatomical face axis to the animated head's world axis.
  const face=new Vector3(0,0,1).applyQuaternion(rig.restBasis).applyQuaternion(rig.headRest.clone().invert()).applyQuaternion(rig.bones.head.getWorldQuaternion(new Quaternion()))
  if(Number.isFinite(face.x)&&Number.isFinite(face.z)&&Math.hypot(face.x,face.z)>.1)return {heading:Math.atan2(-face.x,-face.z),source:'head'}
  if(Number.isFinite(previous))return {heading:previous,source:'head-vertical-hold'}
 }
 // Native seated look yaw is relative to the seat. Use its world orientation,
 // never the position/orientation of the separate third-person photo camera.
 const face=new Vector3(0,0,-1).applyAxisAngle(up,Number.isFinite(lookYaw)?lookYaw:0).applyQuaternion(seatQuaternion)
 if(Number.isFinite(face.x)&&Number.isFinite(face.z)&&Math.hypot(face.x,face.z)>.1)return {heading:Math.atan2(-face.x,-face.z),source:'seat-look'}
 return {heading:Number.isFinite(previous)?previous:0,source:'held'}
}
