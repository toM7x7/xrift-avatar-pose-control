// Hand shapes: finger curl/spread and two-hand contact presets.
// Finger joints are posed relative to the hand's REST frame (never the host
// animation), so a hand looks the same on every avatar that has finger bones.
import {Matrix4,Quaternion,Vector3} from 'three'
import {DEG,clamp,setWorldRotation} from './math.mjs'

const NAMES=['thumb','index','middle','ring','little']
// Share of the total curl taken by proximal / intermediate / distal joints.
const SHARE={thumb:[.25,.4,.35],default:[.42,.36,.22]}
const SPREAD_DIR={thumb:1.6,index:1,middle:0,ring:-1,little:-1.9}

/**
 * fingers: {thumb:{curl,spread}, index:{...}, ...} in degrees. curl is the total over the
 * three joints (positive bends toward the palm); spread fans away from the middle finger.
 * A plain number {curl:60} for every finger is accepted via fingers.all.
 */
export function poseFingers(rig,info,side,fingers){
 if(!fingers)return {posed:0}
 const hand=rig.bones[side+'Hand'],h=info.hands[side]
 if(!h.fingers.length)return {posed:0,reason:'no-finger-bones'}
 const handW=hand.getWorldQuaternion(new Quaternion())
 // World ← bind delta of the hand: bind-space directions map through it.
 const delta=handW.clone().multiply(rig.restRotations.get(hand).clone().invert())
 const toWorld=v=>v.clone().applyQuaternion(rig.restBasis).applyQuaternion(delta)
 const palm=toWorld(h.palm).normalize()
 // +rotation about the palm normal moves fingers toward the thumb side for this hand?
 const thumbward=Math.sign(new Vector3().crossVectors(h.palm,h.fingerDir).dot(h.thumbSide))||1
 let posed=0
 for(const f of h.fingers){
  const spec={...(fingers.all??{}),...(fingers[f.name]??{})}
  const curl=(spec.curl??0)*DEG,spread=(spec.spread??0)*DEG*(SPREAD_DIR[f.name]??0)*thumbward
  const share=SHARE[f.name]??SHARE.default
  const dir=toWorld(f.dir).normalize()
  // Spread fans the whole finger about the palm normal; curl bends toward the palm.
  const spreadQ=new Quaternion().setFromAxisAngle(palm,spread)
  const axis=new Vector3().crossVectors(dir,palm).normalize().applyQuaternion(spreadQ)
  let total=0
  f.bones.forEach((bone,i)=>{
   total+=curl*(share[i]??0)
   const q=new Quaternion().setFromAxisAngle(axis,total).multiply(spreadQ).multiply(delta).multiply(rig.restRotations.get(bone))
   setWorldRotation(bone,q);posed++
  })
 }
 return {posed}
}

/** Rotation whose columns are (y×z, y=fingers, z=palm normal), from two directions in the body's anatomical frame. */
export function handFrame(fingers,palm){
 const y=fingers.clone().normalize(),z=palm.clone().addScaledVector(y,-palm.dot(y)).normalize(),x=new Vector3().crossVectors(y,z)
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z))
}

/**
 * Two-hand presets in a "pair frame": origin = contact centre, F = forward (where the
 * hands open / push), U = up, L = U×F = the body's left when F points forward.
 * They return per-hand targets in that frame: point name on the hand, its position,
 * the finger direction and palm normal. Sizes in body metres (1.65 m reference body).
 *
 * clam: a ball of `radius` held between an upper and a lower palm; the heels meet
 *       behind the ball, the palms are tangent to it, the fingers wrap around it.
 * push: both palms face forward, fingers fanned up and out. With palms forward and fingers up the
 *       thumbs point toward the midline (as when pushing a wall), so the THUMB-side heels meet;
 *       fanning the fingers outward is ulnar deviation.
 */
export function pairTargets(preset,hands,unit=1){
 const out={}
 if(preset.type==='clam'){
  const r=preset.radius??.07,upper=preset.upper??'left',lower=upper==='left'?'right':'left'
  for(const [side,dirSign] of [[upper,1],[lower,-1]]){
   // palmCenter is already the palm's skin point; `skin` is only the visual gap to the ball.
   const h=hands[side],pcd=h.palmLength*unit*.55,skin=preset.skin??.006
   // Tangent geometry: palm centre touches the ball; heel hinge behind it.
   const theta=Math.atan2(r+skin,pcd)+(preset.open??0)*DEG
   const f=new Vector3(Math.cos(theta),dirSign*Math.sin(theta),0) // (F, U, L) coordinates
   const n=new Vector3(Math.sin(theta),-dirSign*Math.cos(theta),0) // palm faces the ball
   // Palm centre sits on the ball surface (plus skin) along -n from the centre.
   const palmCenter=new Vector3().addScaledVector(n,-(r+skin))
   const twist=(preset.twist??0)*DEG*dirSign
   const tq=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),twist)
   out[side]={point:'palmCenter',position:palmCenter,fingers:f.applyQuaternion(tq),palm:n.applyQuaternion(tq),wrapRadius:r+skin}
  }
 }else if(preset.type==='push'){
  const fan=(preset.fan??18)*DEG,tilt=(preset.tilt??0)*DEG,gap=preset.gap??0
  for(const [side,s] of [['left',1],['right',-1]]){
   // Fingers point up (+U) fanned outward toward the hand's own side (+L for left).
   const f=new Vector3(Math.sin(tilt),Math.cos(fan)*Math.cos(tilt),s*Math.sin(fan)).normalize()
   const n=new Vector3(1,0,0).addScaledVector(f,-f.x).normalize() // palm faces forward
   out[side]={point:'thumbHeel',position:new Vector3(0,0,s*gap/2),fingers:f,palm:n}
  }
 }else throw new TypeError('Unknown hand pair preset')
 return out
}

/** Total finger curl (deg) that wraps a ball of radius r with a finger of the given length. */
export function wrapCurl(length,r,max=160){return clamp((length/Math.max(r,1e-3))/DEG*.92,0,max)}
export {NAMES as FINGER_NAMES}
