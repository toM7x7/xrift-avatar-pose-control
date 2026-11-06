// What the arms actually do on a body, measured from the bones (not from the solver's own report):
//  - rest hand geometry: is the thumb in front (palms down, thumbs forward in a T/A pose) on both sides?
//  - per key: wrist twist (hand vs forearm about the forearm axis; skin without twist bones wrings here),
//    forearm roll about the elbow hinge (pronation +/supination -), wrist flex/deviation, upper-arm twist.
// Usage (Pose Studio on 5228): node scripts/arm-anatomy.mjs [--vrm path ...] [--keys gather,charge,thrust,follow] [--read host|vrm]
import {chromium} from 'playwright'
import {existsSync} from 'node:fs'
import {join,resolve} from 'node:path'

const args=process.argv.slice(2),opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1]}
const vrms=[];for(let i=0;i<args.length;i++)if(args[i]==='--vrm')vrms.push(resolve(args[i+1]))
const keys=opt('keys','ready,gather,charge,thrust,follow').split(',').filter(Boolean)
const exe=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1243','chrome-win64','chrome.exe')
const browser=await chromium.launch({executablePath:existsSync(exe)?exe:undefined,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu']})
const page=await browser.newPage({viewport:{width:1200,height:800}})
await page.goto('http://127.0.0.1:5228/studio.html?read='+opt('read','host'))
await page.waitForFunction(()=>!!window.__studio?.result,null,{timeout:30000})

function measure(keys){
 const S=window.__studio,rig=S.rig,info=S.rigInfo,b=rig.bones
 const Q=b.hips.quaternion.constructor,V=b.hips.position.constructor
 const deg=r=>+(r*180/Math.PI).toFixed(1)
 const anat=bone=>bone.getWorldQuaternion(new Q()).multiply(rig.restRotations.get(bone).clone().invert()).multiply(rig.restBasis)
 const twist=(q,axis)=>{let a=2*Math.atan2(q.x*axis.x+q.y*axis.y+q.z*axis.z,q.w);return Math.atan2(Math.sin(a),Math.cos(a))}
 const Y=new V(0,1,0)
 const frameYZ=(y,zh)=>{const yy=y.clone().normalize(),z=zh.clone().addScaledVector(yy,-zh.dot(yy)).normalize(),x=new V().crossVectors(yy,z);const m=new b.hips.matrix.constructor().makeBasis(x,yy,z);return new Q().setFromRotationMatrix(m)}
 const restHands={}
 for(const s of ['left','right']){
  const h=info.hands[s],thumb=h.thumbSide,palm=h.palm,f=h.fingerDir
  restHands[s]={finger:f.toArray().map(v=>+v.toFixed(2)),palm:palm.toArray().map(v=>+v.toFixed(2)),thumb:thumb.toArray().map(v=>+v.toFixed(2)),
   thumbForward:+thumb.z.toFixed(2),handedness:+new V().crossVectors(f,palm).dot(thumb).toFixed(2),fingers:h.fingers.map(x=>x.name+':'+x.bones[0].name)}
 }
 const out={restHands,keys:{}}
 for(const key of keys){
  S.setStatic(key)
  // one synchronous solve is not exposed; the caller waits for a frame between keys
  out.keys[key]=null
 }
 return out
}
function measureNow(key){
 const S=window.__studio,rig=S.rig,info=S.rigInfo,b=rig.bones
 S.applyKey(key)
 const Q=b.hips.quaternion.constructor,V=b.hips.position.constructor
 const deg=r=>+(r*180/Math.PI).toFixed(1)
 const anat=bone=>bone.getWorldQuaternion(new Q()).multiply(rig.restRotations.get(bone).clone().invert()).multiply(rig.restBasis)
 const twist=(q,axis)=>{let a=2*Math.atan2(q.x*axis.x+q.y*axis.y+q.z*axis.z,q.w);return Math.atan2(Math.sin(a),Math.cos(a))}
 const Y=new V(0,1,0)
 const frameYZ=(y,zh)=>{const yy=y.clone().normalize(),z=zh.clone().addScaledVector(yy,-zh.dot(yy)).normalize(),x=new V().crossVectors(yy,z);const m=new b.hips.matrix.constructor().makeBasis(x,yy,z);return new Q().setFromRotationMatrix(m)}
 const res={}
 for(const s of ['left','right']){
  const limb=info.limbs[s],hand=info.hands[s]
  const Fu=anat(b[s+'UpperArm']).multiply(limb.upperRest),Ff=anat(b[s+'LowerArm']).multiply(limb.foreRest),Hn=anat(b[s+'Hand']).multiply(hand.rest)
  // 1. Wrist twist: hand relative to forearm, compared with rest, twist about the forearm axis.
  const rel=Ff.clone().invert().multiply(Hn).multiply(hand.toForearm.clone().invert())
  const wristTwist=twist(rel,Y)
  // Wrist flex/deviation in the forearm frame (palm normal / thumb side of the hand at rest roll).
  const pN=new V(0,0,1).applyQuaternion(hand.toForearm),fN=new V(0,1,0).applyQuaternion(hand.toForearm),tN=hand.thumbSide.clone().applyQuaternion(limb.foreRest.clone().invert())
  const fl=new V(0,1,0).applyQuaternion(rel.clone().multiply(hand.toForearm))
  const flex=Math.atan2(fl.dot(pN),fl.dot(fN)),dev=Math.atan2(fl.dot(tN),fl.dot(fN))
  // 2. Forearm roll about the elbow hinge (sign: + = pronation, thumb side toward the palm).
  const hinge=new V(1,0,0).applyQuaternion(Fu),a=new V(0,1,0).applyQuaternion(Ff)
  const Ff0=frameYZ(a,new V().crossVectors(hinge,a)),roll=twist(Ff0.clone().invert().multiply(Ff),Y)
  const pronSign=Math.sign(new V().crossVectors(Y,tN).dot(pN))||1
  // Total palm roll the arm shows = forearm roll + wrist twist.
  // 3. Upper-arm twist from rest about its own axis (after the shortest swing).
  const qa=anat(b[s+'UpperArm']),rd=new V(0,1,0).applyQuaternion(limb.upperRest),cd=rd.clone().applyQuaternion(qa)
  const swing=new Q().setFromUnitVectors(rd,cd),tw=swing.clone().invert().multiply(qa),upperTwist=twist(tw,rd)
  const elbow=Math.acos(Math.max(-1,Math.min(1,new V(0,1,0).applyQuaternion(Fu).dot(a))))
  // Palm and thumb direction in the body frame (x left, y up, z forward).
  const toBody=rig.restBasis.clone().invert().multiply(b.hips.getWorldQuaternion(new Q()).invert())
  const bodyHeading=new Q() // hips may yaw; keep world for readability
  const palmW=new V(0,0,1).applyQuaternion(Hn),thumbW=hand.thumbSide.clone().applyQuaternion(anat(b[s+'Hand'])),fingW=new V(0,1,0).applyQuaternion(Hn)
  res[s]={wristTwist:deg(wristTwist),forearmRoll:deg(roll*pronSign),totalRoll:deg((roll+wristTwist)*pronSign),flex:deg(flex),dev:deg(dev),elbow:deg(elbow),upperTwist:deg(upperTwist),
   palm:palmW.toArray().map(v=>+v.toFixed(2)),thumb:thumbW.toArray().map(v=>+v.toFixed(2)),finger:fingW.toArray().map(v=>+v.toFixed(2))}
 }
 return res
}

const bodies=[{label:'fixture',load:null},...vrms.map((p,i)=>({label:'V'+(i+1),load:p}))]
for(const body of bodies){
 if(body.load){await page.setInputFiles('#vrm',body.load);await page.waitForFunction(()=>/\.vrm/.test(window.__studio.info().label),null,{timeout:60000});await page.waitForTimeout(400)}
 await page.evaluate(()=>window.__studio.pause())
 const base=await page.evaluate(measure,[])
 console.log(`\n== ${body.label} ${await page.evaluate(()=>window.__studio.info().label)}`)
 for(const s of ['left','right'])console.log(`rest ${s.padEnd(5)} finger ${base.restHands[s].finger} palm ${base.restHands[s].palm} thumb ${base.restHands[s].thumb} thumbForward ${base.restHands[s].thumbForward} handedness ${base.restHands[s].handedness}`)
 const plan=await page.evaluate(()=>window.__studio.plan())
 for(const key of keys){
  const m=await page.evaluate(measureNow,key)
  for(const s of ['left','right']){const r=m[s],p=plan[key]?.[s];console.log(`${key.padEnd(7)} ${s.padEnd(5)} wristTwist ${String(r.wristTwist).padStart(6)} forearmRoll ${String(r.forearmRoll).padStart(6)} total ${String(r.totalRoll).padStart(6)} flex ${String(r.flex).padStart(6)} dev ${String(r.dev).padStart(6)} elbow ${String(r.elbow).padStart(5)} upperTwist ${String(r.upperTwist).padStart(6)} | plan pron ${p?.pronation} flex ${p?.flex} dev ${p?.dev} | palm ${r.palm} thumb ${r.thumb}`)}
 }
}
await browser.close()
