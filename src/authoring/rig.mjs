// Extra anatomy the authored-pose solver needs on top of prepareRig():
// torso chain, clavicles, toes, finger chains (by name hint or by shape),
// rest frames for limbs/hands, palm geometry and skin cross-section radii.
// Everything is measured once from inverse bind matrices (never from the
// host's current animation) and cached per rig.
import {Quaternion,Vector3} from 'three'
import {frameYZ,restPoint} from './math.mjs'

const cache=new WeakMap()
const SIDES=[['left',1],['right',-1]]
const FINGER_NAMES=['thumb','index','middle','ring','little']
const fingerHint=name=>{const n=name.toLowerCase();if(/thumb|oyayubi/.test(n))return 'thumb';if(/index|hitosashi|point/.test(n))return 'index';if(/middle|naka/.test(n))return 'middle';if(/ring|kusuri/.test(n))return 'ring';if(/little|pinky|pinkie|koyubi/.test(n))return 'little';return null}
const boneChildren=(rig,bone)=>bone.children.filter(c=>c.isBone&&rig.restWorld.has(c))
const isAncestor=(a,b)=>{for(let n=b.parent;n;n=n.parent)if(n===a)return true;return false}

export function authoringRig(rig){
 let info=cache.get(rig)
 if(!info){info=measure(rig);cache.set(rig,info)}
 return info
}

function measure(rig){
 const b=rig.bones,basisInv=rig.restBasis.clone().invert()
 const anat=v=>v.clone().applyQuaternion(basisInv)
 const rp=bone=>restPoint(rig,bone)
 const hipsRest=rp(b.hips)
 const local=bone=>anat(rp(bone).sub(hipsRest)) // anatomical rest position relative to hips, bind units

 // Torso chain from hips (exclusive) to the neck (exclusive): spine, chest, upperChest...
 const torso=[]
 const top=b.neck??b.head
 for(let n=top.parent;n&&n!==b.hips;n=n.parent)if(n.isBone&&rig.restWorld.has(n))torso.unshift(n)
 // Clavicles: the joint between the torso chain and the upper arm.
 const shoulders={}
 for(const [side] of SIDES){const p=b[side+'UpperArm'].parent;shoulders[side]=p&&p.isBone&&rig.restWorld.has(p)&&!torso.includes(p)&&p!==b.hips&&torso.includes(p.parent)?p:null}
 // Toes: first child of the foot that points forward.
 const toes={}
 for(const [side] of SIDES){const kids=boneChildren(rig,b[side+'Foot']);toes[side]=kids.sort((p,q)=>local(q).z-local(p).z)[0]??null}

 // Sole height in bind space. VRM exports stand on y=0; otherwise estimate from the ankle.
 const legLength=rp(b.leftUpperLeg).distanceTo(rp(b.leftLowerLeg))+rp(b.leftLowerLeg).distanceTo(rp(b.leftFoot))
 const lowest=Math.min(...SIDES.flatMap(([s])=>[rp(b[s+'Foot']).y,toes[s]?rp(toes[s]).y:Infinity]))
 const soleY=lowest>=-1e-4&&lowest<legLength*.25?0:rp(b.leftFoot).y-legLength*.09
 const ankleHeight=Math.max(.01*legLength,Math.min(rp(b.leftFoot).y,rp(b.rightFoot).y)-soleY)
 const hipHeight=hipsRest.y-soleY

 const limbs={},hands={},legs={}
 for(const [side,sign] of SIDES){
  const sh=rp(b[side+'UpperArm']),el=rp(b[side+'LowerArm']),wr=rp(b[side+'Hand'])
  const upperDir=anat(el.clone().sub(sh)).normalize(),foreDir=anat(wr.clone().sub(el)).normalize()
  const forward=new Vector3(0,0,1)
  // Elbow flexion moves the forearm toward the anatomical front in a T/A pose.
  const upperRest=frameYZ(upperDir,forward)
  const hinge=new Vector3(1,0,0).applyQuaternion(upperRest)
  const foreRest=frameYZ(foreDir,new Vector3().crossVectors(hinge,foreDir))
  // Hand: finger chains, palm normal, palm/heel geometry.
  const chains=boneChildren(rig,b[side+'Hand']).map(root=>{const list=[root];let n=root;for(let i=0;i<4;i++){const k=boneChildren(rig,n);if(!k.length)break;n=k.sort((p,q)=>rp(q).distanceTo(rp(n))-rp(p).distanceTo(rp(n)))[0];list.push(n)}return list}).filter(c=>c.length>=2)
  const named=new Map()
  for(const c of chains){const hint=fingerHint(c[0].name);if(hint&&!named.has(hint))named.set(hint,c)}
  let fingers=[]
  const handLocal=bone=>anat(rp(bone).sub(wr))
  if(named.size>=4){fingers=FINGER_NAMES.filter(n=>named.has(n)).map(n=>({name:n,bones:named.get(n)}))}
  else if(chains.length>=4){
   // Shape: the thumb root is the one whose direction deviates most from the mean finger direction.
   const dirs=chains.map(c=>handLocal(c[Math.min(1,c.length-1)]).sub(handLocal(c[0])).normalize())
   const mean=dirs.reduce((s,d)=>s.add(d),new Vector3()).normalize()
   const thumbIndex=dirs.map(d=>d.dot(mean)).reduce((best,v,i,arr)=>v<arr[best]?i:best,0)
   const thumb=chains[thumbIndex],rest=chains.filter((_,i)=>i!==thumbIndex)
   const thumbSide=handLocal(thumb[0]).addScaledVector(mean,-handLocal(thumb[0]).dot(mean))
   rest.sort((p,q)=>handLocal(q[0]).dot(thumbSide)-handLocal(p[0]).dot(thumbSide))
   fingers=[{name:'thumb',bones:thumb},...rest.slice(0,4).map((c,i)=>({name:FINGER_NAMES[i+1],bones:c}))]
  }
  const nonThumb=fingers.filter(f=>f.name!=='thumb')
  const roots=nonThumb.map(f=>handLocal(f.bones[0]))
  let fingerDir=roots.length?roots.reduce((s,p)=>s.add(p),new Vector3()).normalize():foreDir.clone()
  let palm=new Vector3(0,-1,0)
  if(roots.length>=2){
   const across=roots[0].clone().sub(roots[roots.length-1]),n=new Vector3().crossVectors(fingerDir,across).normalize()
   palm=n.dot(new Vector3(0,-1,0))<0?n.negate():n
  }
  palm.addScaledVector(fingerDir,-palm.dot(fingerDir)).normalize()
  const handRest=frameYZ(fingerDir,palm)
  const palmLength=roots.length?roots.reduce((s,p)=>s+p.length(),0)/roots.length:wr.distanceTo(el)*.35
  const palmWidth=roots.length>=2?roots[0].distanceTo(roots[roots.length-1])*1.18+palmLength*.12:palmLength*.9
  const thumbDir=fingers.find(f=>f.name==='thumb')?handLocal(fingers.find(f=>f.name==='thumb').bones[0]):new Vector3(0,0,1)
  const thumbSide=thumbDir.clone().addScaledVector(fingerDir,-thumbDir.dot(fingerDir)).addScaledVector(palm,-thumbDir.dot(palm))
  if(thumbSide.lengthSq()<1e-10)thumbSide.set(0,0,1);thumbSide.normalize()
  // Finger lengths (to the last known joint, plus a distal pad estimate).
  const fingerInfo=fingers.map(f=>{
   const pts=f.bones.map(handLocal),length=pts.slice(1).reduce((s,p,i)=>s+p.distanceTo(pts[i]),0)
   const seg=pts.length>1?length/(pts.length-1):palmLength*.3,tip=f.bones.length>=4?0:seg*.8
   const dir=(pts.length>1?pts[pts.length-1].clone().sub(pts[0]):pts[0].clone()).normalize()
   return {name:f.name,bones:f.bones.slice(0,3),length:length+tip,dir,root:pts[0]}
  })
  // Points on the hand in the hand's rest frame coordinates (x = y×z, y = fingers, z = palm normal).
  const toHand=v=>v.clone().applyQuaternion(handRest.clone().invert())
  const thickness=palmLength*.30
  const palmCenter=toHand(fingerDir.clone().multiplyScalar(palmLength*.55).addScaledVector(palm,thickness*.5))
  const heel=toHand(fingerDir.clone().multiplyScalar(palmLength*.14).addScaledVector(palm,thickness*.55))
  const pinkyHeel=toHand(fingerDir.clone().multiplyScalar(palmLength*.16).addScaledVector(palm,thickness*.45).addScaledVector(thumbSide,-palmWidth*.40))
  const thumbHeel=toHand(fingerDir.clone().multiplyScalar(palmLength*.18).addScaledVector(palm,thickness*.45).addScaledVector(thumbSide,palmWidth*.38))
  hands[side]={fingers:fingerInfo,rest:handRest,fingerDir,palm,thumbSide,palmLength,palmWidth,thickness,points:{palmCenter,heel,pinkyHeel,thumbHeel},toForearm:foreRest.clone().invert().multiply(handRest)}
  limbs[side]={upperRest,foreRest,hinge,upperLength:sh.distanceTo(el),foreLength:el.distanceTo(wr),shoulderLocal:local(b[side+'UpperArm']),clavicleRest:shoulders[side]?{local:local(shoulders[side])}:null}
  // Legs: knee flexes the shank backward; the thigh's anterior (z) is the anatomical front.
  const hp=rp(b[side+'UpperLeg']),kn=rp(b[side+'LowerLeg']),an=rp(b[side+'Foot'])
  const thighDir=anat(kn.clone().sub(hp)).normalize(),shinDir=anat(an.clone().sub(kn)).normalize()
  const thighRest=frameYZ(thighDir,new Vector3(0,0,1)),legHinge=new Vector3(1,0,0).applyQuaternion(thighRest)
  const shinRest=frameYZ(shinDir,new Vector3().crossVectors(legHinge,shinDir))
  const toeLocal=toes[side]?anat(rp(toes[side]).sub(an)):new Vector3(0,-ankleHeight*.7,legLength*.14)
  legs[side]={thighRest,shinRest,thighLength:hp.distanceTo(kn),shinLength:kn.distanceTo(an),hipLocal:local(b[side+'UpperLeg']),toeLocal,footLength:Math.hypot(toeLocal.x,toeLocal.z)+legLength*.07}
 }
 const shoulderWidth=rp(b.leftUpperArm).distanceTo(rp(b.rightUpperArm)),hipWidth=rp(b.leftUpperLeg).distanceTo(rp(b.rightUpperLeg))
 const radii=measureRadii(rig,{torso,shoulderWidth,hipWidth,legLength,anat,rp})
 return {torso,shoulders,toes,limbs,hands,legs,radii,soleY,ankleHeight,hipHeight,legLength,shoulderWidth,hipWidth,
  armLength:limbs.left.upperLength+limbs.left.foreLength,
  torsoLength:rp(top).distanceTo(hipsRest),
  restHeadLocal:local(b.head),
  basisInv,rig}
}

/** Elliptic cross-section of torso/thigh skin around each segment axis (bind units). */
function measureRadii(rig,{torso,shoulderWidth,hipWidth,legLength,anat,rp}){
 const b=rig.bones,segments={}
 const add=(key,bone,end,fallback)=>{segments[key]={bone,end,fallback,lateral:[],front:[],back:[]}}
 add('pelvis',b.hips,torso[0]??b.neck,{lateral:hipWidth*.85,front:hipWidth*.55,back:hipWidth*.6})
 torso.forEach((bone,i)=>add('torso'+i,bone,torso[i+1]??b.neck??b.head,{lateral:shoulderWidth*.42,front:shoulderWidth*.33,back:shoulderWidth*.3}))
 for(const s of ['left','right'])add(s+'Thigh',b[s+'UpperLeg'],b[s+'LowerLeg'],{lateral:legLength*.09,front:legLength*.09,back:legLength*.1})
 const byBone=new Map(Object.entries(segments).map(([k,v])=>[v.bone,k]))
 let scope=rig.mesh
 while(scope.parent&&!isAncestor(scope,b.hips)&&scope!==b.hips.parent)scope=scope.parent
 const meshes=[];scope.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.includes(b.hips))meshes.push(o)})
 const seen=new Set()
 for(const mesh of meshes){
  const g=mesh.geometry,pos=g.getAttribute('position'),idx=g.getAttribute('skinIndex'),wt=g.getAttribute('skinWeight')
  if(!pos||!idx||!wt||seen.has(g.uuid))continue
  seen.add(g.uuid)
  const step=Math.max(1,Math.floor(pos.count/12000)),v=new Vector3()
  for(let i=0;i<pos.count;i+=step){
   let best=-1,bw=0
   for(let j=0;j<4;j++){const w=wt.getComponent(i,j);if(w>bw){bw=w;best=idx.getComponent(i,j)}}
   if(bw<.6)continue
   const key=byBone.get(mesh.skeleton.bones[best]);if(!key)continue
   const seg=segments[key],a=rp(seg.bone),z=rp(seg.end)
   v.fromBufferAttribute(pos,i).applyMatrix4(mesh.bindMatrix)
   const axis=z.clone().sub(a),len=axis.length();if(len<1e-6)continue;axis.divideScalar(len)
   const t=v.clone().sub(a).dot(axis),below=key==='pelvis'?1.6:.25;if(t<-len*below||t>len*1.25)continue
   const radial=anat(v.clone().sub(a).addScaledVector(axis,-t))
   seg.lateral.push(Math.abs(radial.x));(radial.z>=0?seg.front:seg.back).push(Math.abs(radial.z))
  }
 }
 const pct=(list,q)=>{if(list.length<8)return null;const s=[...list].sort((p,q2)=>p-q2);return s[Math.min(s.length-1,Math.floor(q*s.length))]}
 const out={}
 for(const [key,seg] of Object.entries(segments)){
  const measured={lateral:pct(seg.lateral,.92),front:pct(seg.front,.92),back:pct(seg.back,.92)}
  const lateral=measured.lateral??seg.fallback.lateral,front=measured.front??seg.fallback.front,back=measured.back??seg.fallback.back
  // The hip "segment" spans to the waist; for the thighs the skin can include the buttocks.
  out[key]={bone:seg.bone,end:seg.end,lateral:Math.max(lateral,1e-3),front:Math.max(front,1e-3),back:Math.max(back,1e-3),source:measured.lateral?'skin':'proportion'}
 }
 return out
}
