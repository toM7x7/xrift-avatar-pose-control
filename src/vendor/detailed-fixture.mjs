// Original, deliberately simple skinned test body WITH fingers, clavicles,
// upper chest and toes. It is not a user's avatar. T-pose bind, palms down,
// thumbs pointing forward (+Z), soles at y=0, like typical VRM exports.
//
// Options rebuild the same body the way other exporters make avatars, for compatibility tests:
// bone names (FIXTURE_NAMINGS, sanitized like GLTFLoader does), missing fingers / neck / upper chest /
// clavicles / toes, twist bones in or beside the arm chain, a bind facing -Z, and rolled bone axes.
// The defaults build exactly the original body.
import {Bone,Skeleton,SkinnedMesh,BoxGeometry,MeshStandardMaterial,Matrix4,Color,Float32BufferAttribute,Uint16BufferAttribute,Quaternion,Vector3,Euler,PropertyBinding} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'

const FINGERS=[
 // name, root offset from wrist (x along arm, z across palm), segment lengths, direction (x,z) in the palm plane
 ['Thumb',[.022,-.012,.030],[.034,.030,.026],[.62,-.10,.78]],
 ['Index',[.088,0,.028],[.040,.025,.020],[1,0,.04]],
 ['Middle',[.092,0,.008],[.045,.028,.022],[1,0,0]],
 ['Ring',[.088,0,-.012],[.042,.026,.020],[1,0,-.04]],
 ['Little',[.080,-.002,-.031],[.032,.021,.018],[1,0,-.10]],
]
const SEGMENTS=['Proximal','Intermediate','Distal']
const SIDES=[[1,'left'],[-1,'right']]

// ---- exporter naming conventions (role -> bone name before GLTFLoader sanitizing) ----
const SEG={Proximal:1,Intermediate:2,Distal:3,Tip:4}
function partsOf(role){
 const m=/^(left|right)(.+)$/.exec(role);if(!m)return {side:null,part:role}
 const f=/^(Thumb|Index|Middle|Ring|Little)(Proximal|Intermediate|Distal|Tip)$/.exec(m[2])
 return {side:m[1],part:m[2],finger:f?f[1]:null,seg:f?SEG[f[2]]:null}
}
const named=(center,limb,finger)=>role=>{const p=partsOf(role);return p.side===null?center[p.part]:p.finger?finger(p):limb(p)}
const ZEN='０１２３４'
export const FIXTURE_NAMINGS=Object.freeze({
 vrm:role=>role,
 vroid:named({hips:'J_Bip_C_Hips',spine:'J_Bip_C_Spine',chest:'J_Bip_C_Chest',upperChest:'J_Bip_C_UpperChest',neck:'J_Bip_C_Neck',head:'J_Bip_C_Head'},
  ({side,part})=>`J_Bip_${side==='left'?'L':'R'}_${part==='Toes'?'ToeBase':part}`,
  ({side,finger,seg})=>`J_Bip_${side==='left'?'L':'R'}_${finger}${Math.min(seg,3)}${seg===4?'_end':''}`),
 // Blender metarig names as on a VRM exported from Blender (e.g. upper_arm.L, f_index.01.L).
 blender:named({hips:'hips',spine:'spine',chest:'chest.001',upperChest:'upper_chest',neck:'neck',head:'head'},
  ({side,part})=>({Shoulder:'shoulder',UpperArm:'upper_arm',LowerArm:'forearm',Hand:'hand',UpperLeg:'upper_leg',LowerLeg:'lower_leg',Foot:'foot',Toes:'toe',UpperArmTwist:'upper_arm_twist',LowerArmTwist:'forearm_twist'})[part]+(side==='left'?'.L':'.R'),
  ({side,finger,seg})=>`${{Thumb:'thumb',Index:'f_index',Middle:'f_middle',Ring:'f_ring',Little:'f_pinky'}[finger]}.0${Math.min(seg,3)}${side==='left'?'.L':'.R'}${seg===4?'_end':''}`),
 // Rigify deform bones: the torso is DEF-spine, DEF-spine.001 ...; twist segments are .001 copies of the limb.
 rigify:named({hips:'DEF-spine',spine:'DEF-spine.001',chest:'DEF-spine.002',upperChest:'DEF-spine.003',neck:'DEF-spine.004',head:'DEF-spine.006'},
  ({side,part})=>{const s=side==='left'?'.L':'.R';return ({Shoulder:'DEF-shoulder'+s,UpperArm:'DEF-upper_arm'+s,LowerArm:'DEF-forearm'+s,Hand:'DEF-hand'+s,UpperLeg:'DEF-thigh'+s,LowerLeg:'DEF-shin'+s,Foot:'DEF-foot'+s,Toes:'DEF-toe'+s,UpperArmTwist:'DEF-upper_arm'+s+'.001',LowerArmTwist:'DEF-forearm'+s+'.001'})[part]},
  ({side,finger,seg})=>`DEF-${{Thumb:'thumb',Index:'f_index',Middle:'f_middle',Ring:'f_ring',Little:'f_pinky'}[finger]}.0${Math.min(seg,3)}${side==='left'?'.L':'.R'}${seg===4?'_end':''}`),
 mixamo:named({hips:'mixamorig:Hips',spine:'mixamorig:Spine',chest:'mixamorig:Spine1',upperChest:'mixamorig:Spine2',neck:'mixamorig:Neck',head:'mixamorig:Head'},
  ({side,part})=>'mixamorig:'+(side==='left'?'Left':'Right')+({Shoulder:'Shoulder',UpperArm:'Arm',LowerArm:'ForeArm',Hand:'Hand',UpperLeg:'UpLeg',LowerLeg:'Leg',Foot:'Foot',Toes:'ToeBase',UpperArmTwist:'ArmTwist',LowerArmTwist:'ForeArmTwist'})[part],
  ({side,finger,seg})=>`mixamorig:${side==='left'?'Left':'Right'}Hand${finger==='Little'?'Pinky':finger}${seg}`),
 unreal:named({hips:'pelvis',spine:'spine_01',chest:'spine_02',upperChest:'spine_03',neck:'neck_01',head:'head'},
  ({side,part})=>({Shoulder:'clavicle',UpperArm:'upperarm',LowerArm:'lowerarm',Hand:'hand',UpperLeg:'thigh',LowerLeg:'calf',Foot:'foot',Toes:'ball',UpperArmTwist:'upperarm_twist_01',LowerArmTwist:'lowerarm_twist_01'})[part]+(side==='left'?'_l':'_r'),
  ({side,finger,seg})=>`${finger==='Little'?'pinky':finger.toLowerCase()}_0${seg}_${side==='left'?'l':'r'}`),
 // VRChat after the Cats plugin ("Left arm", "Left elbow", ...).
 cats:named({hips:'Hips',spine:'Spine',chest:'Chest',upperChest:'Upper Chest',neck:'Neck',head:'Head'},
  ({side,part})=>(side==='left'?'Left ':'Right ')+({Shoulder:'shoulder',UpperArm:'arm',LowerArm:'elbow',Hand:'wrist',UpperLeg:'leg',LowerLeg:'knee',Foot:'ankle',Toes:'toe',UpperArmTwist:'arm twist',LowerArmTwist:'elbow twist'})[part],
  ({side,finger,seg})=>`${finger==='Thumb'?'Thumb':finger+'Finger'}${finger==='Thumb'?Math.min(seg,3)-1:Math.min(seg,3)}_${side==='left'?'L':'R'}${seg===4?'_end':''}`),
 mmd:named({hips:'下半身',spine:'上半身',chest:'上半身2',upperChest:'上半身3',neck:'首',head:'頭'},
  ({side,part})=>(side==='left'?'左':'右')+({Shoulder:'肩',UpperArm:'腕',LowerArm:'ひじ',Hand:'手首',UpperLeg:'足',LowerLeg:'ひざ',Foot:'足首',Toes:'つま先',UpperArmTwist:'腕捩',LowerArmTwist:'手捩'})[part],
  ({side,finger,seg})=>(side==='left'?'左':'右')+({Thumb:'親指',Index:'人指',Middle:'中指',Ring:'薬指',Little:'小指'})[finger]+(seg===4?'先':ZEN[finger==='Thumb'?seg-1:seg])),
 nameless:(role,index)=>`Bone.${String(index).padStart(3,'0')}`,
})

// A deterministic, well-spread rest orientation per bone (rolled bone axes, as in FBX/Blender exports).
function rolled(index,amount){
 const axis=new Vector3(Math.sin(index*1.7+.3),Math.cos(index*2.3+.1),Math.sin(index*.9+1)).normalize()
 return new Quaternion().setFromAxisAngle(axis,amount*(.35+.65*((index*.6180339887)%1)))
}

/**
 * options: naming (key of FIXTURE_NAMINGS or (role,index)=>name), fingers, clavicles, upperChest, neck, toes (booleans, default true),
 * twist ('chain' = twist bones between upper arm/forearm/hand, 'side' = twist bones beside the chain), facing (1 = +Z, -1 = -Z),
 * roll (radians, rolls every bone's rest axes; 0 = identity rest like VRM).
 */
export function createDetailedPoseFixture(options={}){
 const {naming=null,fingers:withFingers=true,clavicles=true,upperChest:withUpperChest=true,neck:withNeck=true,toes:withToes=true,twist=null,facing=1,roll=0}=options
 const F=v=>facing<0?[-v[0],v[1],-v[2]]:v
 const bones=[],byName={}
 const bone=(name,position,parent)=>{const b=new Bone();b.name=name;b.position.fromArray(F(position));if(parent)parent.add(b);bones.push(b);byName[name]=b;return b}
 const hips=bone('hips',[0,.95,0]),spine=bone('spine',[0,.10,0],hips),chest=bone('chest',[0,.13,0],spine)
 const upperChest=withUpperChest?bone('upperChest',[0,.12,0],chest):null,top=upperChest??chest,lift=withUpperChest?0:.12
 const neck=withNeck?bone('neck',[0,.12+lift,0],top):null,head=bone('head',withNeck?[0,.09,0]:[0,.21+lift,0],neck??top)
 const shoulderAt=sign=>[sign*.03,.075+lift,-.01]
 for(const [sign,side] of SIDES){
  const shoulder=clavicles?bone(side+'Shoulder',shoulderAt(sign),top):null
  const upper=bone(side+'UpperArm',clavicles?[sign*.14,0,0]:[sign*.17,.075+lift,-.01],shoulder??top)
  let hand
  if(twist==='chain'){const t1=bone(side+'UpperArmTwist',[sign*.14,0,0],upper),lower=bone(side+'LowerArm',[sign*.14,0,0],t1),t2=bone(side+'LowerArmTwist',[sign*.125,0,0],lower);hand=bone(side+'Hand',[sign*.125,0,0],t2)}
  else{const lower=bone(side+'LowerArm',[sign*.28,0,0],upper);hand=bone(side+'Hand',[sign*.25,0,0],lower);if(twist==='side'){bone(side+'UpperArmTwist',[sign*.14,0,0],upper);bone(side+'LowerArmTwist',[sign*.125,0,0],lower)}}
  if(withFingers)for(const [name,root,lengths,dir] of FINGERS){
   let parent=hand,position=[sign*root[0],root[1],root[2]]
   for(let i=0;i<3;i++){const b=bone(side+name+SEGMENTS[i],position,parent);const n=Math.hypot(...dir);position=[sign*dir[0]/n*lengths[i],dir[1]/n*lengths[i],dir[2]/n*lengths[i]];parent=b}
   bone(side+name+'Tip',position,parent)
  }
  const thigh=bone(side+'UpperLeg',[sign*.09,-.06,0],hips),shin=bone(side+'LowerLeg',[0,-.42,0],thigh),foot=bone(side+'Foot',[0,-.40,0],shin);if(withToes)bone(side+'Toes',[0,-.05,.12],foot)
 }
 hips.updateMatrixWorld(true)
 const pieces=[],headPieces=[]
 const box=(b,size,offset,color)=>{
  const g=new BoxGeometry(...size);g.translate(...F(offset));g.applyMatrix4(b.matrixWorld)
  const count=g.attributes.position.count,index=bones.indexOf(b),indices=[],weights=[],colors=[],c=new Color(color)
  for(let i=0;i<count;i++){indices.push(index,0,0,0);weights.push(1,0,0,0);colors.push(c.r,c.g,c.b)}
  g.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));g.setAttribute('color',new Float32BufferAttribute(colors,3));(b===head?headPieces:pieces).push(g)
 }
 box(hips,[.30,.16,.19],[0,0,0],'#425d70');box(spine,[.27,.14,.17],[0,.06,0],'#347f91');box(chest,[.30,.14,.19],[0,.06,0],'#347f91')
 box(top,[.34,.13,.20],[0,.05+lift,0],'#347f91')
 if(neck)box(neck,[.09,.11,.09],[0,.04,0],'#cead87');else box(head,[.09,.11,.09],[0,-.05,0],'#cead87')
 box(head,[.18,.23,.20],[0,.095,.015],'#dfbd96');box(head,[.14,.035,.018],[0,.11,.12],'#374852')
 for(const [sign,side] of SIDES){
  const shoulderBox=[.13,.08,.10],at=shoulderAt(sign)
  if(byName[side+'Shoulder'])box(byName[side+'Shoulder'],shoulderBox,[sign*.075,0,0],'#347f91');else box(top,shoulderBox,[at[0]+sign*.075,at[1],at[2]],'#347f91')
  box(byName[side+'UpperArm'],[.28,.095,.10],[sign*.14,0,0],'#347f91');box(byName[side+'LowerArm'],[.25,.07,.075],[sign*.125,0,0],'#dfbd96')
  box(byName[side+'Hand'],[.092,.028,.082],[sign*.047,0,0],'#dfbd96')
  if(withFingers)for(const [name] of FINGERS)for(let i=0;i<3;i++){const b=byName[side+name+SEGMENTS[i]],tip=b.children[0].position.toArray(),t=F(tip);box(b,[Math.abs(t[0])+.004,.016,Math.abs(t[2])+.016],[t[0]/2,t[1]/2,t[2]/2],'#e8c9a4')}
  box(byName[side+'UpperLeg'],[.14,.42,.15],[0,-.21,0],'#425d70');box(byName[side+'LowerLeg'],[.10,.40,.11],[0,-.20,0],'#425d70');box(byName[side+'Foot'],[.10,.07,.17],[0,-.035,.05],'#283b45')
  if(byName[side+'Toes'])box(byName[side+'Toes'],[.10,.04,.07],[0,-.0,.035],'#283b45')
 }
 // Rolled axes: same joint positions, every bone's rest frame turned (the geometry is already in place).
 const restWorld=new Map(),I=new Quaternion()
 if(roll){
  const at=new Map(bones.map(b=>[b,b.getWorldPosition(new Vector3())]))
  bones.forEach((b,i)=>restWorld.set(b,rolled(i,roll)))
  for(const b of bones){const pq=b.parent?.isBone?restWorld.get(b.parent):I,pp=b.parent?.isBone?at.get(b.parent):new Vector3(),inv=pq.clone().invert();b.quaternion.copy(inv.clone().multiply(restWorld.get(b)));b.position.copy(at.get(b).clone().sub(pp).applyQuaternion(inv))}
  hips.updateMatrixWorld(true)
 }
 // Names last: byName keeps role keys; bone.name is what an exporter + GLTFLoader would give.
 const namer=typeof naming==='function'?naming:naming?FIXTURE_NAMINGS[naming]:null
 if(naming&&!namer)throw Error('unknown fixture naming '+naming)
 if(namer)bones.forEach((b,i)=>{b.name=PropertyBinding.sanitizeNodeName(namer(b.name,i))})
 const geometry=mergeGeometries(pieces),headGeometry=mergeGeometries(headPieces),material=new MeshStandardMaterial({vertexColors:true,roughness:.9}),mesh=new SkinnedMesh(geometry,material)
 ;[...pieces,...headPieces].forEach(p=>p.dispose());mesh.name='authored-detailed-test-body';mesh.frustumCulled=false;mesh.userData.poseLabFixture=true;mesh.add(hips)
 const skeleton=new Skeleton(bones);mesh.bind(skeleton)
 const headMesh=new SkinnedMesh(headGeometry,material);headMesh.name='authored-detailed-test-head';headMesh.frustumCulled=false;headMesh.layers.set(10);mesh.add(headMesh);headMesh.bind(skeleton,new Matrix4())
 const rest=bones.map(b=>b.quaternion.clone())
 // A rotation written for the identity-rest +Z body, applied to this body's own rest frames and facing.
 const QF=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),facing<0?Math.PI:0),QFi=QF.clone().invert()
 const turn=(b,euler)=>{if(!b)return;const q=new Quaternion().setFromEuler(euler);if(facing<0)q.premultiply(QF).multiply(QFi);if(roll){const pr=b.parent?.isBone?restWorld.get(b.parent):I;q.premultiply(pr.clone().invert()).multiply(restWorld.get(b))}b.quaternion.copy(q)}
 /** Host-like idle: arms hang down with soft elbows, legs straight, head may look around. */
 function idle(time=0){
  bones.forEach((b,i)=>b.quaternion.copy(rest[i]))
  for(const [sign,side] of SIDES){turn(byName[side+'UpperArm'],new Euler(0,0,-sign*1.2));turn(byName[side+'LowerArm'],new Euler(0,sign*.25,0));if(withFingers)for(const name of ['Index','Middle','Ring','Little'])turn(byName[side+name+'Proximal'],new Euler(0,sign*.25,0))}
  turn(head,new Euler(0,Math.sin(time*.6)*.1,0));hips.updateWorldMatrix(true,true);skeleton.update()
 }
 return {mesh,skeleton,bones:byName,idle,dispose(){geometry.dispose();headGeometry.dispose();material.dispose();skeleton.dispose()}}
}
