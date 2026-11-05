// Synthetic skeletons for role inference: one humanoid body, renamed and re-parented the way each exporter does it.
// Left side is written at +X and mirrored; the body faces +Z (left = +X). Not a test file itself.
export const P={
 root:[0,0,0],hips:[0,.95,0],spine:[0,1.05,0],chest:[0,1.17,0],upperChest:[0,1.29,0],neck:[0,1.42,.01],head:[0,1.5,.01],headTop:[0,1.68,.01],
 shoulder:[.03,1.38,0],upperArm:[.12,1.38,0],upperArmMid:[.25,1.38,0],lowerArm:[.38,1.38,0],lowerArmMid:[.5,1.38,0],hand:[.62,1.38,0],
 thumb1:[.64,1.36,.03],thumb2:[.67,1.35,.05],index1:[.7,1.38,.025],index2:[.74,1.38,.025],middle1:[.7,1.38,0],middle2:[.745,1.38,0],middleEnd:[.8,1.38,0],ring1:[.7,1.38,-.02],ring2:[.74,1.38,-.02],
 upperLeg:[.09,.9,0],upperLegMid:[.09,.7,0],lowerLeg:[.09,.5,0],lowerLegMid:[.09,.29,0],foot:[.09,.08,0],toe:[.09,.02,.12],toeEnd:[.09,.01,.18],
 skirt1:[.12,.92,.08],skirt2:[.16,.7,.11],skirt3:[.19,.45,.13],
 tail1:[.06,1.62,-.06],tail2:[.12,1.35,-.1],tail3:[.15,1.05,-.12],tail4:[.16,.8,-.12],tail5:[.17,.05,-.12],
 wing1:[.06,1.2,-.1],wing2:[.3,1.45,-.25],wing3:[.6,1.6,-.35],wing4:[.85,1.7,-.4],
 cape1:[.1,1.3,-.1],cape2:[.14,1,-.14],cape3:[.16,.7,-.16],cape4:[.17,.4,-.17],
 ribbon1:[.1,.9,-.1],ribbon2:[.12,.6,-.12],ribbon3:[.13,.3,-.13],ribbon4:[.13,.02,-.13],
 longSkirt1:[.12,.92,.08],longSkirt2:[.18,.6,.12],longSkirt3:[.22,.3,.15],longSkirt4:[.24,.1,.16],
}
const ZERO=new Set(['headTop','middleEnd','toeEnd','root'])
export const ARM=new Set(['shoulder','upperArm','upperArmMid','lowerArm','lowerArmMid','hand','thumb1','thumb2','index1','index2','middle1','middle2','middleEnd','ring1','ring2','armTwist','foreTwist'])

/**
 * nameOf(key,side) names a bone (side 'L'/'R'/''; null skips the bone). layout: thighParent, clavicleParent ('neck'), inChainMid,
 * sideTwists, hipAbove (CC Hip / DAZ hip above a legs-only pelvis), mmd (waist cancel, D bones, IK chain), skirt, tails ('floor'),
 * wings, cape, ribbons, longSkirt, toes (false), fingers (false), root.
 */
export function humanoid(nameOf,layout={}){
 const bones=[],nameFor=(key,side)=>/^(wing|cape|ribbon|longSkirt|tail)\d/.test(key)?`${key}_${side}`:nameOf(key,side)
 const add=(key,side,parent,pos=P[key],weight)=>{
  const name=nameFor(key,side);if(name===null)return parent
  bones.push({key,side,name,parent,pos:side==='R'?[-pos[0],pos[1],pos[2]]:pos,weight:weight??(key==='head'?2000:ZERO.has(key)||key.startsWith('ik')?0:100)});return name
 }
 const root=layout.root?add('root','',null):null,hipTop=layout.hipAbove?add('hipAbove','',root,[0,.97,0]):root
 const hips=add('hips','',hipTop),spine=add('spine','',layout.hipAbove?hipTop:hips),chest=add('chest','',spine),upper=add('upperChest','',chest),neck=add('neck','',upper),head=add('head','',neck)
 add('headTop','',head)
 const hang=(keys,from)=>{for(const s of ['L','R']){let p=from;for(const k of keys)p=add(k,s,p,P[k],50)}}
 if(layout.tails)hang(['tail1','tail2','tail3','tail4',...(layout.tails==='floor'?['tail5']:[])],head)
 if(layout.wings)hang(['wing1','wing2','wing3','wing4'],chest)
 if(layout.cape)hang(['cape1','cape2','cape3','cape4'],upper)
 if(layout.ribbons)hang(['ribbon1','ribbon2','ribbon3','ribbon4'],hips)
 if(layout.longSkirt)hang(['longSkirt1','longSkirt2','longSkirt3','longSkirt4'],hips)
 const lowerBody=layout.mmd?add('lowerBody','',hips,P.hips):hips
 for(const s of ['L','R']){
  let p=add('shoulder',s,layout.clavicleParent==='neck'?neck:upper)
  const upperArm=p=add('upperArm',s,p);if(layout.inChainMid)p=add('upperArmMid',s,p)
  const lowerArm=p=add('lowerArm',s,p);if(layout.inChainMid)p=add('lowerArmMid',s,p)
  const hand=add('hand',s,p)
  if(layout.sideTwists){add('armTwist',s,upperArm,P.upperArmMid,10);add('foreTwist',s,lowerArm,P.lowerArmMid,10)}
  if(layout.fingers!==false){add('thumb2',s,add('thumb1',s,hand));add('index2',s,add('index1',s,hand));add('middleEnd',s,add('middle2',s,add('middle1',s,hand)));add('ring2',s,add('ring1',s,hand))}
  let legRoot=layout.thighParent==='spine'?spine:lowerBody
  if(layout.mmd)legRoot=add('waistCancel',s,legRoot,P.upperLeg,0)
  const upperLeg=p=add('upperLeg',s,legRoot,P.upperLeg,layout.mmd?0:undefined);if(layout.inChainMid)p=add('upperLegMid',s,p)
  p=add('lowerLeg',s,p,P.lowerLeg,layout.mmd?0:undefined)
  if(layout.sideTwists)add('legTwist',s,upperLeg,P.upperLegMid,10)
  p=add('foot',s,p,P.foot,layout.mmd?0:undefined)
  if(layout.toes!==false)add('toeEnd',s,add('toe',s,p))
  // MMD deform (D) bones overlap the leg; IK bones hang from the root.
  if(layout.mmd){let d=add('upperLegD',s,legRoot,P.upperLeg);d=add('lowerLegD',s,d,P.lowerLeg);add('footD',s,d,P.foot);add('ikToe',s,add('ikFoot',s,add('ikParent',s,root??hips,[.09,.08,0]),P.foot),P.toe)}
  if(layout.skirt){let q=hips;for(const k of ['skirt1','skirt2','skirt3'])q=add(k,s,q)}
 }
 return bones
}

/** facing -1 turns the body 180 degrees about Y; aPose lowers the arms 40 degrees; transform maps every position. */
export function toInput(bones,{facing=1,aPose=false,centroids=true,rename=null,transform=null}={}){
 const index=new Map(bones.map((b,i)=>[b.name,i])),positions=bones.map(b=>[...b.pos])
 if(aPose)for(const b of bones){
  if(!ARM.has(b.key)||b.key==='shoulder')continue
  const j=bones.find(x=>x.key==='upperArm'&&x.side===b.side).pos,a=(b.side==='L'?-1:1)*40*Math.PI/180,i=index.get(b.name),dx=positions[i][0]-j[0],dy=positions[i][1]-j[1]
  positions[i]=[j[0]+dx*Math.cos(a)-dy*Math.sin(a),j[1]+dx*Math.sin(a)+dy*Math.cos(a),positions[i][2]]
 }
 if(facing<0)for(const p of positions){p[0]=-p[0];p[2]=-p[2]}
 // Shoe vertices sit forward of the ankle.
 const cs=bones.map((b,i)=>centroids&&b.key==='foot'?[positions[i][0],positions[i][1]-.03,positions[i][2]+.06*(facing<0?-1:1)]:null)
 if(transform){positions.forEach((p,i)=>positions[i]=transform(p));cs.forEach((c,i)=>{if(c)cs[i]=transform(c)})}
 return {names:bones.map((b,i)=>rename?rename(b,i):b.name),parent:bones.map(b=>b.parent===null?-1:index.get(b.parent)),positions,weights:bones.map(b=>b.weight),centroids:cs}
}

export function truthOf(bones,hipsKey='hips'){
 const at=(key,side='')=>bones.findIndex(b=>b.key===key&&b.side===side),t={hips:at(hipsKey),head:at('head')}
 for(const [s,side] of [['L','left'],['R','right']])for(const [k,role] of [['upperArm','UpperArm'],['lowerArm','LowerArm'],['hand','Hand'],['upperLeg','UpperLeg'],['lowerLeg','LowerLeg'],['foot','Foot']])t[side+role]=at(k,s)
 return t
}

const LR={L:'Left',R:'Right'}
export const CONVENTIONS={
 unity:{names:(k,s)=>({hips:'Hips',spine:'Spine',chest:'Chest',upperChest:'UpperChest',neck:'Neck',head:'Head',headTop:'HeadTop_End'}[k]??`${LR[s]??''}${{toe:'Toes',toeEnd:'Toes_End'}[k]??k[0].toUpperCase()+k.slice(1)}`)},
 vroid:{layout:{skirt:true},names:(k,s)=>({hips:'J_Bip_C_Hips',spine:'J_Bip_C_Spine',chest:'J_Bip_C_Chest',upperChest:'J_Bip_C_UpperChest',neck:'J_Bip_C_Neck',head:'J_Bip_C_Head',headTop:'J_Bip_C_HeadTop_End',skirt1:`J_Sec_${s}_Skirt_01`,skirt2:`J_Sec_${s}_Skirt_02`,skirt3:`J_Sec_${s}_Skirt_03`}[k]??`J_Bip_${s}_${{toe:'ToeBase',toeEnd:'ToeBase_end'}[k]??k[0].toUpperCase()+k.slice(1)}`)},
 mixamo:{names:(k,s)=>'mixamorig:'+({hips:'Hips',spine:'Spine',chest:'Spine1',upperChest:'Spine2',neck:'Neck',head:'Head',headTop:'HeadTop_End'}[k]??`${LR[s]}${{shoulder:'Shoulder',upperArm:'Arm',lowerArm:'ForeArm',hand:'Hand',upperLeg:'UpLeg',lowerLeg:'Leg',foot:'Foot',toe:'ToeBase',toeEnd:'Toe_End',thumb1:'HandThumb1',thumb2:'HandThumb2',index1:'HandIndex1',index2:'HandIndex2',middle1:'HandMiddle1',middle2:'HandMiddle2',middleEnd:'HandMiddle4',ring1:'HandRing1',ring2:'HandRing2'}[k]}`)},
 // VRChat after Cats: "leg" is the thigh.
 cats:{layout:{tails:true},names:(k,s)=>({hips:'Hips',spine:'Spine',chest:'Chest',upperChest:'Upper Chest',neck:'Neck',head:'Head',headTop:'Head_end'}[k]??`${LR[s]} ${{shoulder:'shoulder',upperArm:'arm',lowerArm:'elbow',hand:'wrist',upperLeg:'leg',lowerLeg:'knee',foot:'ankle',toe:'toe',toeEnd:'toe_end'}[k]??k}`)},
 unreal:{layout:{sideTwists:true,root:true},names:(k,s)=>({root:'root',hips:'pelvis',spine:'spine_01',chest:'spine_02',upperChest:'spine_03',neck:'neck_01',head:'head',headTop:null}[k]??`${{shoulder:'clavicle',upperArm:'upperarm',lowerArm:'lowerarm',hand:'hand',upperLeg:'thigh',lowerLeg:'calf',foot:'foot',toe:'ball',toeEnd:null,armTwist:'upperarm_twist_01',foreTwist:'lowerarm_twist_01',legTwist:'thigh_twist_01',thumb1:'thumb_01',thumb2:'thumb_02',index1:'index_01',index2:'index_02',middle1:'middle_01',middle2:'middle_02',middleEnd:'middle_03',ring1:'ring_01',ring2:'ring_02'}[k]}_${s.toLowerCase()}`)},
 // Rigify DEF: split upper arm/forearm/thigh (.001), no hips or head word.
 rigify:{layout:{inChainMid:true},names:(k,s)=>({hips:'DEF-spine',spine:'DEF-spine.001',chest:'DEF-spine.002',upperChest:'DEF-spine.003',neck:'DEF-spine.004',head:'DEF-spine.006',headTop:null}[k]??`DEF-${{shoulder:'shoulder',upperArm:'upper_arm',upperArmMid:'upper_arm',lowerArm:'forearm',lowerArmMid:'forearm',hand:'hand',upperLeg:'thigh',upperLegMid:'thigh',lowerLeg:'shin',foot:'foot',toe:'toe',toeEnd:null,thumb1:'thumb.01',thumb2:'thumb.02',index1:'f_index.01',index2:'f_index.02',middle1:'f_middle.01',middle2:'f_middle.02',middleEnd:'f_middle.03',ring1:'f_ring.01',ring2:'f_ring.02'}[k]}.${s}${k.endsWith('Mid')?'.001':''}`)},
 // 3ds Max Biped: thighs under Spine, clavicles under Neck.
 biped:{layout:{thighParent:'spine',clavicleParent:'neck',root:true},names:(k,s)=>({root:'Bip001',hips:'Bip001 Pelvis',spine:'Bip001 Spine',chest:'Bip001 Spine1',upperChest:null,neck:'Bip001 Neck',head:'Bip001 Head',headTop:'Bip001 HeadNub'}[k]??`Bip001 ${s} ${{shoulder:'Clavicle',upperArm:'UpperArm',lowerArm:'Forearm',hand:'Hand',upperLeg:'Thigh',lowerLeg:'Calf',foot:'Foot',toe:'Toe0',toeEnd:'Toe0Nub',thumb1:'Finger0',thumb2:'Finger01',index1:'Finger1',index2:'Finger11',middle1:'Finger2',middle2:'Finger21',middleEnd:'Finger2Nub',ring1:'Finger3',ring2:'Finger31'}[k]}`)},
 // Character Creator: Hip above a legs-only Pelvis and the Waist.
 cc:{layout:{hipAbove:true,sideTwists:true,root:true},hips:'hipAbove',names:(k,s)=>({root:'CC_Base_BoneRoot',hipAbove:'CC_Base_Hip',hips:'CC_Base_Pelvis',spine:'CC_Base_Waist',chest:'CC_Base_Spine01',upperChest:'CC_Base_Spine02',neck:'CC_Base_NeckTwist01',head:'CC_Base_Head',headTop:null}[k]??`CC_Base_${s}_${{shoulder:'Clavicle',upperArm:'Upperarm',lowerArm:'Forearm',hand:'Hand',upperLeg:'Thigh',lowerLeg:'Calf',foot:'Foot',toe:'ToeBase',toeEnd:null,armTwist:'UpperarmTwist01',foreTwist:'ForearmTwist01',legTwist:'ThighTwist01',thumb1:'Thumb1',thumb2:'Thumb2',index1:'Index1',index2:'Index2',middle1:'Mid1',middle2:'Mid2',middleEnd:'Mid3',ring1:'Ring1',ring2:'Ring2'}[k]}`)},
 // DAZ Genesis: hip above a legs-only pelvis, twist bones inside the chains.
 daz:{layout:{hipAbove:true,inChainMid:true},hips:'hipAbove',names:(k,s)=>({hipAbove:'hip',hips:'pelvis',spine:'abdomenLower',chest:'abdomenUpper',upperChest:'chestUpper',neck:'neckLower',head:'head',headTop:null}[k]??`${s.toLowerCase()}${{shoulder:'Collar',upperArm:'ShldrBend',upperArmMid:'ShldrTwist',lowerArm:'ForearmBend',lowerArmMid:'ForearmTwist',hand:'Hand',upperLeg:'ThighBend',upperLegMid:'ThighTwist',lowerLeg:'Shin',foot:'Foot',toe:'Toe',toeEnd:null,thumb1:'Thumb1',thumb2:'Thumb2',index1:'Index1',index2:'Index2',middle1:'Mid1',middle2:'Mid2',middleEnd:'Mid3',ring1:'Ring1',ring2:'Ring2'}[k]}`)},
 // MMD: upper and lower body under 腰, waist cancel, overlapping 足D, IK from the root.
 mmd:{layout:{mmd:true,root:true},names:(k,s)=>({root:'全ての親',hips:'腰',lowerBody:'下半身',spine:'上半身',chest:'上半身2',upperChest:null,neck:'首',head:'頭',headTop:'頭先'}[k]??`${s==='L'?'左':'右'}${{shoulder:'肩',upperArm:'腕',lowerArm:'ひじ',hand:'手首',upperLeg:'足',lowerLeg:'ひざ',foot:'足首',toe:'つま先',toeEnd:'つま先先',waistCancel:'腰キャンセル',upperLegD:'足D',lowerLegD:'ひざD',footD:'足首D',ikParent:'足IK親',ikFoot:'足ＩＫ',ikToe:'つま先ＩＫ',thumb1:'親指０',thumb2:'親指１',index1:'人指１',index2:'人指２',middle1:'中指１',middle2:'中指２',middleEnd:'中指３',ring1:'薬指１',ring2:'薬指２'}[k]}`)},
}
export const scrambledNames=()=>{let n=0;return ()=>`Bone.${String(++n).padStart(3,'0')}`}
export const sideMarksOnly=()=>{let n=0;return (k,s)=>`bone_${s||'C'}_${++n}`}

// Horizontal spine with front and hind legs: never a humanoid.
export function quadruped(){
 const b=[],add=(name,parent,pos,weight=100)=>b.push({key:name,side:'',name,parent,pos,weight})
 add('pelvis',null,[0,.6,-.4]);add('spine','pelvis',[0,.62,0]);add('chest','spine',[0,.64,.35]);add('neck','chest',[0,.8,.5]);add('head','neck',[0,.9,.65],2000)
 for(const [x,s] of [[.12,'L'],[-.12,'R']]){
  add(`hind_${s}1`,'pelvis',[x,.55,-.4]);add(`hind_${s}2`,`hind_${s}1`,[x,.3,-.45]);add(`hind_${s}3`,`hind_${s}2`,[x,.05,-.4]);add(`hind_${s}4`,`hind_${s}3`,[x,0,-.32],0)
  add(`fore_${s}1`,'chest',[x,.58,.35]);add(`fore_${s}2`,`fore_${s}1`,[x,.3,.35]);add(`fore_${s}3`,`fore_${s}2`,[x,.05,.36]);add(`fore_${s}4`,`fore_${s}3`,[x,0,.44],0)
 }
 add('tail1','pelvis',[0,.62,-.5]);add('tail2','tail1',[0,.7,-.8])
 return b
}
