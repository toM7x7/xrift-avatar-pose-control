// Every solver mode on several skeleton shapes and placements, recorded exactly: the local transform of every bone and
// the solver's own result after each frame. Used to hold the lazy world reads (src/world.mjs) to plain three calls bit
// for bit, and to compare two versions of the engine. `m` is the engine under test. Not a test file itself.
import {readFileSync} from 'node:fs'
import {Bone,Group,Object3D,Quaternion,Scene,Skeleton,Vector3} from 'three'

const clip=name=>JSON.parse(readFileSync(new URL(`../specs/${name}.v1.json`,import.meta.url),'utf8'))
const wave=clip('charge-wave'),gun=clip('pump-gun')

// Hair, skirt and accessory chains: bones no solver uses, but every subtree refresh has to walk.
function dress(f,count){
 const bones=[...f.skeleton.bones],hosts=[[f.bones.head,[0,-.06,-.02],6],[f.bones.hips,[0,-.1,.03],5],[f.bones.chest,[.02,-.05,.02],4]]
 for(let k=0,left=count;left>0;k++){
  const [host,dir,n]=hosts[k%3],take=Math.min(n,left);let p=host
  for(let i=0;i<take;i++){const b=new Bone();b.name='extra_'+bones.length;b.position.set(dir[0]*.05*(k%2?1:-1),dir[1]*.05,dir[2]*.05);p.add(b);bones.push(b);p=b}
  left-=take
 }
 f.mesh.updateMatrixWorld(true);const skeleton=new Skeleton(bones);f.mesh.bind(skeleton);f.skeleton=skeleton
}
/** kind: 'simple' | 'detailed'; place: 'plain' | 'moved' (scaled, turned) | 'nested' (under three turned groups). */
export function stage(m,{kind='detailed',options={},extra=0,place='plain'}={}){
 const scene=new Scene(),root=new Group(),f=kind==='simple'?m.createPoseFixture():m.createDetailedPoseFixture(options);let parent=scene
 if(place==='nested')for(let i=0;i<3;i++){const g=new Group();g.position.set(.3*i,.1*i,-.2*i);g.rotation.set(.05*i,.4*i,0);g.scale.setScalar(i===1?1.35:1);parent.add(g);parent=g}
 if(place==='moved'){root.scale.setScalar(.65);root.position.set(.4,0,-.7);root.rotation.y=.6}
 root.add(f.mesh);parent.add(root)
 if(extra)dress(f,extra)
 const host=t=>{(f.idle??f.seated).call(f,t);scene.updateMatrixWorld(true)}
 host(0)
 const rig=m.prepareRig(m.inspectHumanoidRigs(scene).find(r=>r.skeleton===f.mesh.skeleton))
 return {scene,root,f,rig,host}
}
const worldOf=(s,v)=>s.root.localToWorld(new Vector3(...v)).toArray()

function standing(m,s){return i=>()=>m.applyPose(s.rig,{preset:['upright','hover','board'][i%3],heading:.4+i*.07,preserveHands:i%2===1,pitch:.05*(i%4),roll:-.04*(i%3),kneeBend:.02*(i%5),armSwing:.1*(i%3)})}
function prone(m,s){
 const frame=new Object3D();frame.position.set(.2,.9,-.1);frame.rotation.set(-.1,.5,.03);s.root.add(frame)
 return i=>()=>{
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.6+i*.05).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.15))
  const options=[{heading:.6+i*.05},{orientation:q,rotationOnly:true},{orientation:q,preserveHands:true,legs:{kneeBendDegrees:6+i%9,legSplayDegrees:i%5,anklePointDegrees:25+i%20}},{orientation:q,preserveHands:true,support:m.gliderSupportSurface(frame,{trim:.01*(i%3)})}][i%4]
  return m.applyPose(s.rig,{preset:'glider',...options})
 }
}
function nimbus(m,s){
 const profile=m.N02_NORMAL_FLIGHT_PROFILE;let ride=m.createRideDynamics(m.createN02RideOptions()),ankles=null
 return i=>()=>{
  if(i%5===0)return m.applyPose(s.rig,{preset:'nimbus',heading:.2*i,stanceWidth:.8+.1*(i%4),crouch:.3+.05*(i%6),preserveHands:i%10===5})
  if(!ankles){const snap=m.captureBones(s.rig.skeleton);m.applyPose(s.rig,{...profile.pose,heading:0});ankles=['leftFoot','rightFoot'].map(r=>s.rig.bones[r].getWorldPosition(new Vector3()));m.restoreBones(snap)}
  ride=m.stepRideDynamics(ride,{throttle:1,steer:Math.sin(i/7)*.6,lift:Math.cos(i/9)*.5,brake:i%20>16?1:0},1/60)
  const p=ride.pose,q=new Quaternion().fromArray(ride.supportQuaternion),origin=new Vector3().fromArray(ride.position)
  return m.applyPose(s.rig,{...profile.pose,heading:ride.heading,preserveHands:i%4===3,supportSoleOffsetM:.06,supportFrame:{position:origin.toArray(),quaternion:[...ride.supportQuaternion]},footTargetsWorld:ankles.map(a=>a.clone().applyQuaternion(q).add(origin).toArray()),
   balance:{leanForward:p.balanceLeanForward,leanSide:p.balanceLeanSide,crouch:Math.min(1,profile.pose.crouch+p.crouch-.45),centerOfMassOffset:p.centerOfMassOffset,loadRatio:p.loadRatio,forwardAcceleration:p.tangentForwardAcceleration??p.forwardAcceleration,lateralAcceleration:p.tangentLateralAcceleration??p.lateralAcceleration,verticalAcceleration:p.verticalAcceleration,normalLoadRatio:p.normalLoadRatio,effectiveGravityMps2:p.effectiveGravityMps2,supportState:p.supportState,zmpValid:p.zmpValid,zmpInvalidReason:p.zmpInvalidReason,verticalCompression:p.verticalCompression}})
 }
}
function shoulder(m,s){
 const anchors={leftShoulder:worldOf(s,[.2,1.38,0]),rightShoulder:worldOf(s,[-.2,1.38,0]),head:worldOf(s,[0,1.54,0])}
 return i=>()=>i%4===3
  ?m.applyPose(s.rig,{preset:'carrierSupport',heading:.3+i*.02,shinTargets:{left:worldOf(s,[.28,1.13,.18+.01*(i%5)]),right:worldOf(s,[-.28,1.13,.18])}})
  :m.applyPose(s.rig,{preset:'shoulder',carrierAnchors:anchors,anchorMode:i%2?'head':'support',preserveHands:i%3===2,seatBack:.1+.01*(i%4),spread:.6+.1*(i%4),heading:.1*i})
}
function seat(m,s){
 return i=>()=>{
  const family=['chair','straddle','side-sit'][i%3],q=new Quaternion().setFromAxisAngle(new Vector3(1,0,.3).normalize(),.05*(i%5)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.2*i))
  return m.applyPose(s.rig,{preset:family,family,handMode:['relaxed','grip','tracked'][i%4%3],heading:.2*i,leanRadians:-.2+.1*(i%5),side:i%2?'left':'right',seatHeightRatio:.5+.03*(i%6),widthRatio:.12+.04*(i%5),...(i%2?{supportFrame:{position:worldOf(s,[.1,.6,.05]),quaternion:q.toArray()}}:{})})
 }
}
function authored(m,s){
 const info=m.authoringRig(s.rig),state={},origin=s.root.getWorldPosition(new Vector3())
 return i=>()=>{
  const t=(i*3%240)/60,frame=m.sampleAction(wave,info,t<2.2?{heldFor:t,releasedFor:null}:{heldFor:2.2,releasedFor:t-2.2,charge:.8,beamFor:1})
  return m.applyAuthoredPose(s.rig,frame,{heading:.4+.01*i,origin,groundY:origin.y,headMode:i%2?'host':'body',state})
 }
}
function held(m,s){
 const total=m.timelineDuration(gun)||1
 return i=>()=>m.applyHeld(s.rig,gun,m.timelineParams(gun,(i*7%200)/200*total),{heading:.3+.02*i})
}
// The render transaction (apply before the render, restore after it), as the items drive it.
function driven(m,s){
 const profile=m.N02_NORMAL_FLIGHT_PROFILE;let options={...profile.pose,heading:0}
 const driver=m.attachPoseDriver({scene:s.scene,rig:s.rig,relatedSkeletons:[s.f.skeleton],getOptions:()=>options})
 return i=>()=>{
  options={...profile.pose,heading:.1*i,preserveHands:i%3===1,crouch:.3+.02*(i%8)}
  if(!driver.apply())throw new Error(driver.error??'apply refused')
  return {last:driver.last,restore:()=>driver.restore()}
 }
}

const D={kind:'detailed'}
export const SCENARIOS=[
 ['standing simple moved',standing,{kind:'simple',place:'moved'}],['standing detailed nested',standing,{...D,place:'nested',extra:40}],
 ['prone simple',prone,{kind:'simple'}],['prone detailed moved',prone,{...D,place:'moved'}],['prone rolled bones',prone,{...D,options:{roll:.6}}],
 ['nimbus simple',nimbus,{kind:'simple'}],['nimbus detailed dressed',nimbus,{...D,extra:120,place:'nested'}],['nimbus facing -z',nimbus,{...D,options:{facing:-1},place:'moved'}],['nimbus twist chain',nimbus,{...D,options:{twist:'chain',roll:.4}}],
 ['shoulder simple',shoulder,{kind:'simple'}],['shoulder detailed moved',shoulder,{...D,place:'moved'}],
 ['seat simple',seat,{kind:'simple'}],['seat detailed nested',seat,{...D,place:'nested',extra:30}],
 ['authored detailed',authored,D],['authored dressed nested',authored,{...D,extra:120,place:'nested'}],['authored twist side rolled',authored,{...D,options:{twist:'side',roll:.6},place:'moved'}],['authored facing -z',authored,{...D,options:{facing:-1}}],['authored bare',authored,{...D,options:{clavicles:false,upperChest:false,neck:false,toes:false}}],
 ['held detailed',held,D],['held twist chain moved',held,{...D,options:{twist:'chain'},place:'moved',extra:60}],
 ['driver detailed dressed',driven,{...D,extra:60}],
]

const bonesOf=skeleton=>{const out=new Float64Array(skeleton.bones.length*10);skeleton.bones.forEach((b,i)=>out.set([b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w,b.scale.x,b.scale.y,b.scale.z],i*10));return out}
/** Run one scenario: per frame the posed bones, the solver's result as JSON, and the bones after the host pose is restored. */
export function record(m,[name,build,spec],frames=36){
 const s=stage(m,spec),prepare=build(m,s),out=[]
 for(let i=0;i<frames;i++){
  s.host(i/30)
  const snapshot=m.captureBones(s.f.skeleton),result=prepare(i)(),posed=bonesOf(s.f.skeleton)
  if(result?.restore){result.restore();out.push({posed,result:JSON.stringify(result.last),restored:bonesOf(s.f.skeleton)})}
  else{m.restoreBones(snapshot);out.push({posed,result:JSON.stringify(result),restored:bonesOf(s.f.skeleton)})}
 }
 s.f.dispose?.()
 return out
}
const sameBits=(a,b)=>{if(a.length!==b.length)return false;const x=new BigUint64Array(a.buffer),y=new BigUint64Array(b.buffer);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true}
/** First frame where two recordings differ, or null. */
export function firstDifference(a,b){
 if(a.length!==b.length)return {frame:-1,what:'frame count'}
 for(let i=0;i<a.length;i++){
  if(!sameBits(a[i].posed,b[i].posed))return {frame:i,what:'posed bones'}
  if(a[i].result!==b[i].result)return {frame:i,what:'solver result'}
  if(!sameBits(a[i].restored,b[i].restored))return {frame:i,what:'restored bones'}
 }
 return null
}
