// Cost of one posed avatar per render, on the self-made fixture: time, matrix multiplications and heap allocated.
// No private VRM, browser or upload. Desktop Node numbers; a headset is several times slower.
//   node --expose-gc scripts/bench-pose.mjs [--root <other checkout>] [--json]
// --root measures another checkout of this repository with the same scenarios (before/after comparisons).
// Paths: N02 ride through attachPoseDriver, the authored charge-wave and the held pump-gun as the items drive them
// (sample, capture, solve, skin update, restore), and the rig scan. "+N" adds N hair/skirt-like bones no solver uses.
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {PerformanceObserver,performance} from 'node:perf_hooks'
import {Bone,Group,Matrix4,Quaternion,Scene,Skeleton,Vector3} from 'three'

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]}
const root=pathToFileURL(path.resolve(option('--root')??path.join(import.meta.dirname,'..'))+path.sep).href
const load=file=>import(root+file)
const [{createPoseFixture},{createDetailedPoseFixture},{inspectHumanoidRigs,prepareRig,captureBones,restoreBones},engine,prop]=await Promise.all(['src/vendor/fixture.mjs','src/vendor/detailed-fixture.mjs','src/vendor/render-pose.mjs','src/index.mjs','src/authoring/prop.mjs'].map(load))
const clip=name=>JSON.parse(readFileSync(new URL(`specs/${name}.v1.json`,root),'utf8')),wave=clip('charge-wave'),gun=clip('pump-gun')
if(typeof global.gc!=='function')throw new Error('Run with --expose-gc')

let multiplies=0,counting=false,collections=0
const multiply=Matrix4.prototype.multiplyMatrices
Matrix4.prototype.multiplyMatrices=function(a,b){if(counting)multiplies++;return multiply.call(this,a,b)}
new PerformanceObserver(list=>{collections+=list.getEntries().length}).observe({entryTypes:['gc']})

function dress(f,count){
 const bones=[...f.skeleton.bones],hosts=[[f.bones.head,[0,-.06,-.02],6],[f.bones.hips,[0,-.1,.03],5],[f.bones.chest,[.02,-.05,.02],4]]
 for(let k=0,left=count;left>0;k++){const [host,dir,n]=hosts[k%3],take=Math.min(n,left);let p=host;for(let i=0;i<take;i++){const b=new Bone();b.name='extra_'+bones.length;b.position.set(dir[0]*.05*(k%2?1:-1),dir[1]*.05,dir[2]*.05);p.add(b);bones.push(b);p=b}left-=take}
 f.mesh.updateMatrixWorld(true);const skeleton=new Skeleton(bones);f.mesh.bind(skeleton);f.skeleton=skeleton
}
// An avatar sits under several groups in a host scene; each is one more matrix on every parent walk.
function stage(kind,extra){
 const scene=new Scene(),f=kind==='simple'?createPoseFixture():createDetailedPoseFixture(),avatar=new Group();let parent=scene
 for(let i=0;i<6;i++){const g=new Group();g.position.set(.1*i,0,.05*i);g.rotation.y=.1*i;parent.add(g);parent=g}
 avatar.add(f.mesh);parent.add(avatar);if(extra)dress(f,extra)
 ;(f.idle??f.seated).call(f,0);scene.updateMatrixWorld(true)
 const rigs=inspectHumanoidRigs(scene),rig=prepareRig(rigs.find(r=>r.skeleton===f.mesh.skeleton))
 return {scene,f,rig,related:[...new Set(rigs.map(r=>r.skeleton))],bones:f.mesh.skeleton.bones.length}
}
function measure(label,bones,frame,frames=900){
 for(let i=0;i<200;i++)frame(i)
 let ms=Infinity
 for(let pass=0;pass<5;pass++){const t=performance.now();for(let i=0;i<frames;i++)frame(i);ms=Math.min(ms,(performance.now()-t)/frames)}
 multiplies=0;counting=true;for(let i=0;i<60;i++)frame(i);counting=false
 // Heap growth over a few frames right after a forced collection, skipping samples a collection interrupted.
 const samples=[]
 for(let n=0;n<60;n++){global.gc();const before=collections,start=process.memoryUsage().heapUsed;for(let i=0;i<4;i++)frame(i);const end=process.memoryUsage().heapUsed;if(collections===before)samples.push((end-start)/4)}
 samples.sort((a,b)=>a-b)
 return {label,bones,msPerFrame:+ms.toFixed(4),matrixMultipliesPerFrame:Math.round(multiplies/60),kBPerFrame:samples.length?+(samples[samples.length>>1]/1024).toFixed(1):null}
}

function n02(kind,extra){
 const s=stage(kind,extra),profile=engine.N02_NORMAL_FLIGHT_PROFILE
 let ride=engine.createRideDynamics(engine.createN02RideOptions()),options={...profile.pose,heading:0,preserveHands:false}
 const driver=engine.attachPoseDriver({scene:s.scene,rig:s.rig,relatedSkeletons:s.related,getOptions:()=>options})
 driver.apply();const ankles=['leftFoot','rightFoot'].map(r=>s.rig.bones[r].getWorldPosition(new Vector3()));driver.restore()
 const out=measure(`N02 ride (${kind}${extra?' +'+extra:''})`,s.bones,i=>{
  ride=engine.stepRideDynamics(ride,{throttle:1,steer:Math.sin(i/40)*.5,lift:Math.cos(i/55)*.4,brake:0},1/60)
  const p=ride.pose,q=new Quaternion().fromArray(ride.supportQuaternion),origin=new Vector3().fromArray(ride.position)
  options={...profile.pose,heading:ride.heading,preserveHands:false,supportSoleOffsetM:.06,supportFrame:{position:origin.toArray(),quaternion:[...ride.supportQuaternion]},footTargetsWorld:ankles.map(a=>a.clone().applyQuaternion(q).add(origin).toArray()),
   balance:{leanForward:p.balanceLeanForward,leanSide:p.balanceLeanSide,crouch:Math.min(1,profile.pose.crouch+p.crouch-.45),centerOfMassOffset:p.centerOfMassOffset,loadRatio:p.loadRatio,forwardAcceleration:p.tangentForwardAcceleration??p.forwardAcceleration,lateralAcceleration:p.tangentLateralAcceleration??p.lateralAcceleration,verticalAcceleration:p.verticalAcceleration,normalLoadRatio:p.normalLoadRatio,effectiveGravityMps2:p.effectiveGravityMps2,supportState:p.supportState,zmpValid:p.zmpValid,zmpInvalidReason:p.zmpInvalidReason,verticalCompression:p.verticalCompression}}
  if(!driver.apply())throw new Error(driver.error??'apply refused')
  driver.restore()
 })
 driver.dispose();s.f.dispose?.();return out
}
// The item bridges keep one snapshot per avatar and overwrite it (captureBones(skeleton, reuse)); older checkouts ignore the argument.
function authored(extra){
 const s=stage('detailed',extra),state={};let snap=null
 const out=measure(`authored charge-wave (detailed${extra?' +'+extra:''})`,s.bones,i=>{
  const t=(i%240)/60,frame=engine.sampleAction(wave,engine.authoringRig(s.rig),t<2.2?{heldFor:t,releasedFor:null}:{heldFor:2.2,releasedFor:t-2.2,charge:.8,beamFor:1})
  snap=captureBones(s.rig.skeleton,snap);engine.applyAuthoredPose(s.rig,frame,{heading:.4,headMode:'host',state})
  s.rig.skeleton.update();s.related.forEach(k=>k.update());restoreBones(snap);s.related.forEach(k=>k.update())
 })
 s.f.dispose?.();return out
}
function held(extra){
 const s=stage('detailed',extra),total=prop.timelineDuration(gun)||1;let snap=null
 const out=measure(`held pump-gun (detailed${extra?' +'+extra:''})`,s.bones,i=>{
  snap=captureBones(s.rig.skeleton,snap);prop.applyHeld(s.rig,gun,prop.timelineParams(gun,(i%200)/200*total),{heading:.3})
  s.rig.skeleton.update();s.related.forEach(k=>k.update());restoreBones(snap);s.related.forEach(k=>k.update())
 })
 s.f.dispose?.();return out
}
function scan(avatars,extra){
 const scene=new Scene()
 for(let i=0;i<avatars;i++){const f=createDetailedPoseFixture(),avatar=new Group();avatar.position.set(i*2,0,0);avatar.add(f.mesh);scene.add(avatar);dress(f,extra)}
 scene.updateMatrixWorld(true)
 return measure(`inspectHumanoidRigs (${avatars} avatar${avatars>1?'s':''} +${extra})`,avatars*(62+extra),()=>inspectHumanoidRigs(scene),300)
}

const rows=[n02('simple',0),n02('detailed',0),n02('detailed',120),n02('detailed',300),authored(0),authored(120),authored(300),held(0),held(120),scan(1,120),scan(12,120)]
if(args.includes('--json'))console.log(JSON.stringify({root,node:process.version,rows},null,1))
else{console.log(root);console.table(rows)}
