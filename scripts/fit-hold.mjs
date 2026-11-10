// Search where a held prop sits most comfortably: sweeps the hold position of one stance key (and optionally the
// pitch of the holding hand's finger direction) over a grid, solves a few probe poses on the built-in test body at
// three sizes and ranks the candidates by how far the wrists, forearms and shoulders are from the middle of their
// ranges. It only prints a table; the author copies the chosen numbers into the spec.
// Usage: node scripts/fit-hold.mjs [specs/pump-gun.v1.json] [--key ready] [--x a:b:step] [--y a:b:step] [--z a:b:step] [--tilt a:b:step] [--top 10]
import {readFileSync} from 'node:fs'
import {Scene,Group} from 'three'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {captureBones,inspectHumanoidRigs,prepareRig,restoreBones} from '../src/vendor/render-pose.mjs'
import {ARM_LIMITS} from '../src/authoring/arm.mjs'
import {HELD_REST,applyHeld} from '../src/authoring/prop.mjs'

const args=process.argv.slice(2),opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:fallback}
const flagValues=new Set(args.flatMap((a,i)=>a.startsWith('--')?[i+1]:[]))
const path=args.find((a,i)=>!a.startsWith('--')&&!flagValues.has(i))??'specs/pump-gun.v1.json',base=JSON.parse(readFileSync(path,'utf8'))
const keyName=opt('key','ready'),hold=base.keys[keyName].hold,grip=base.prop.sockets[hold.socket??'grip']
const range=(spec,fallback)=>{const [a,b,s]=(spec??fallback).split(':').map(Number);const out=[];for(let v=a;v<=b+1e-9;v+=s||1)out.push(+v.toFixed(4));return out}
const xs=range(opt('x'),`${hold.position[0]}:${hold.position[0]}:1`),ys=range(opt('y'),'-0.28:-0.10:0.03'),zs=range(opt('z'),'0.24:0.39:0.03')
const tilts=range(opt('tilt'),`${grip.fingers[1]}:${grip.fingers[1]}:1`),top=+opt('top',10)
const PROBES=keyName==='ready'?[{},{pump:1},{pitch:40},{pitch:-35}]:[{stance:1,reach:1},{stance:1,reach:1,lift:1,turn:1}]

const bodies=[.75,1,1.3].map(scale=>{
 const scene=new Scene(),f=createDetailedPoseFixture(),root=new Group();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);f.idle(0);scene.updateMatrixWorld(true)
 return {scale,scene,f}
})
const L=ARM_LIMITS,lim=(v,pos,neg)=>v>=0?v/pos:-v/neg
const rows=[]
for(const x of xs)for(const y of ys)for(const z of zs)for(const tilt of tilts){
 const clip=structuredClone(base)
 clip.keys[keyName].hold.position=[x,y,z];clip.prop.sockets[hold.socket??'grip'].fingers=[grip.fingers[0],tilt,grip.fingers[2]]
 let cost=0,reachMm=0,back=0
 const worst={ext:0,dev:0,pron:0,rot:0,elbowMin:180,elbowMax:0,clear:Infinity}
 for(const body of bodies){
  // A fresh rig per candidate: the hold fit is cached per rig and clip.
  body.f.idle(0);body.scene.updateMatrixWorld(true)
  const rig=prepareRig(inspectHumanoidRigs(body.scene)[0]),snap=captureBones(rig.skeleton)
  for(const probe of PROBES){
   const h=applyHeld(rig,clip,{...HELD_REST,...probe})
   back=Math.max(back,h.fit.back)
   for(const side of ['left','right']){
    const a=h.metrics.arms[side];if(!a)continue
    cost+=lim(a.wristFlexDeg,L.flexion,L.extension)**2+lim(a.wristDeviationDeg,L.radial,L.ulnar)**2+.6*lim(a.requestedPronationDeg,L.pronation,L.supination)**2+.6*lim(a.humeralRotationDeg,L.externalRotation,L.internalRotation)**2
    cost+=a.elbowFlexDeg>135?((a.elbowFlexDeg-135)/15)**2:0
    reachMm=Math.max(reachMm,a.reachErrorMm)
    if(side===(hold.hand??'right')){worst.ext=Math.max(worst.ext,-a.wristFlexDeg);worst.dev=Math.max(worst.dev,Math.abs(a.wristDeviationDeg))}
    worst.pron=Math.max(worst.pron,Math.abs(a.requestedPronationDeg));worst.rot=Math.max(worst.rot,Math.abs(a.humeralRotationDeg))
    worst.elbowMin=Math.min(worst.elbowMin,a.elbowFlexDeg);worst.elbowMax=Math.max(worst.elbowMax,a.elbowFlexDeg)
    if(a.elbowClearanceMm!=null)worst.clear=Math.min(worst.clear,a.elbowClearanceMm)
   }
   restoreBones(snap);rig.skeleton.update()
  }
 }
 rows.push({x,y,z,tilt,cost:cost/(bodies.length*PROBES.length),reachMm,back,...worst})
}
rows.sort((a,b)=>a.cost-b.cost)
console.log(`${keyName}: ${rows.length} candidates, ${PROBES.length} probes × ${bodies.length} bodies. cost = mean per pose of the squared share of each joint range used`)
console.log('  x      y      z     tilt   cost  holdExt holdDev  pron  shRot  elbow     clear  reach  fitBack')
for(const r of rows.slice(0,top))console.log(`${r.x.toFixed(2).padStart(5)} ${r.y.toFixed(2).padStart(6)} ${r.z.toFixed(2).padStart(6)} ${r.tilt.toFixed(2).padStart(6)} ${r.cost.toFixed(3).padStart(6)} ${r.ext.toFixed(0).padStart(6)}° ${r.dev.toFixed(0).padStart(6)}° ${r.pron.toFixed(0).padStart(5)}° ${r.rot.toFixed(0).padStart(5)}° ${(r.elbowMin.toFixed(0)+'-'+r.elbowMax.toFixed(0)).padStart(8)}° ${r.clear.toFixed(0).padStart(5)}mm ${r.reachMm.toFixed(1).padStart(5)}mm ${(r.back*100).toFixed(1).padStart(5)}cm`)
const cur=rows.find(r=>r.x===hold.position[0]&&r.y===hold.position[1]&&r.z===hold.position[2]&&r.tilt===grip.fingers[1])
if(cur)console.log('current spec ranks',rows.indexOf(cur)+1,'of',rows.length,'cost',cur.cost.toFixed(3))
for(const b of bodies)b.f.dispose()
