// Candidate intents for comparison, not adopted posture specifications. Each
// case.options is the base options merged with one named variant; condition
// values must be applied by the host to its support/input, not passed as pose
// solver options. This is a coverage set, not a full Cartesian product.
const rad=degrees=>degrees*Math.PI/180
function deepFreeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value)}return value}
const clone=value=>structuredClone(value)
function merge(base,delta){const result=clone(base);for(const [key,value]of Object.entries(delta??{}))result[key]=value&&typeof value==='object'&&!Array.isArray(value)?merge(result[key]??{},value):clone(value);return result}
const candidate=(id,title,family,description,options)=>({id,title,family,description:'未採用候補。'+description,options:{preserveHands:false,...options}})

export const POSE_PATTERN_CATALOG=deepFreeze([
 candidate('nimbus-surf','筋斗雲・基本サーフ','nimbus','前後に足を開き、胸・腰を分担する姿勢。採用済み飛行profileを変更するものではない。',{preset:'nimbus',anchorMode:'support',stanceWidth:1,crouch:.45,maxKneeDegrees:100}),
 candidate('nimbus-low','筋斗雲・低い踏ん張り','nimbus','腰を低く構える比較。足到達や膝の限界を観察する。',{preset:'nimbus',anchorMode:'support',stanceWidth:1.1,crouch:.65,maxKneeDegrees:100}),
 candidate('standing-hover','浮遊足場・軽い立ち姿勢','standing','膝を軽く緩め、手を空ける立ち乗り。',{preset:'hover',kneeBend:.09,pitch:0,roll:0}),
 candidate('standing-braced','動く足場・立って構える','standing','膝と上体の傾きで構える立ち乗り。足接触は別の観測対象。',{preset:'upright',kneeBend:.22,pitch:.08,roll:0}),
 candidate('prone-glider','グライダー・腹ばい飛行','prone','胸を預け、膝を少し曲げて飛ぶ。グリップや支持面はhostで用意する。',{preset:'glider',legs:{kneeBendDegrees:8,legSplayDegrees:2,anklePointDegrees:45}}),
 candidate('prone-manta','巨大マンタ・広い背へ伏せる','prone','脚を少し開き、背へ寝そべる姿勢の比較。動物モデルを制作する契約ではない。',{preset:'glider',legs:{kneeBendDegrees:5,legSplayDegrees:4,anklePointDegrees:35}}),
 candidate('prone-streamlined','長い飛行体・脚をまとめて伏せる','prone','膝の緩みと足首の伸ばし方を比較する。',{preset:'glider',legs:{kneeBendDegrees:14,legSplayDegrees:1,anklePointDegrees:50}}),
 candidate('chair-car','自動車・前のグリップへ座る','chair','座面から脚を前へ出し、両手を操縦位置へ。',{family:'chair',seatHeightRatio:.62,widthRatio:.16,leanRadians:.08,handMode:'grip',gripReachRatio:.7}),
 candidate('chair-edge','乗り物の縁・上体を起こす','chair','縁に腰掛けて脚を下ろす。腰支持と足の位置の両立を見る。',{family:'chair',seatHeightRatio:.70,widthRatio:.13,leanRadians:0,handMode:'relaxed',gripReachRatio:.65}),
 candidate('chair-reclined','カート・背を倒して座る','chair','後傾した胴と前方の脚・手の関係を観察する。',{family:'chair',seatHeightRatio:.42,widthRatio:.16,leanRadians:-.4,handMode:'grip',gripReachRatio:.75}),
 candidate('straddle-horse','馬・上体を起こしてまたがる','straddle','脚を左右へ下ろし、腰を支持点へ合わせる。',{family:'straddle',seatHeightRatio:.65,widthRatio:.32,leanRadians:.05,handMode:'relaxed',gripReachRatio:.65}),
 candidate('straddle-motorcycle','バイク・前傾してまたがる','straddle','胸を前へ、手をグリップへ向ける比較。',{family:'straddle',seatHeightRatio:.55,widthRatio:.26,leanRadians:.35,handMode:'grip',gripReachRatio:.72}),
 candidate('straddle-wide-beast','幅広の幻獣・大きくまたがる','straddle','太い胴に対応する脚の開きと到達限界を観察する。',{family:'straddle',seatHeightRatio:.6,widthRatio:.52,leanRadians:.05,handMode:'relaxed',gripReachRatio:.65}),
 candidate('straddle-dragon','ドラゴン・低く前へ構える','straddle','前傾と遠いグリップを組み合わせた候補。',{family:'straddle',seatHeightRatio:.45,widthRatio:.4,leanRadians:.5,handMode:'grip',gripReachRatio:.9}),
 candidate('side-broom','魔法のほうき・左へ横座り','side-sit','両脚を左へ出す非対称な座り方。',{family:'side-sit',seatHeightRatio:.6,widthRatio:.1,leanRadians:.05,side:'left',handMode:'relaxed',gripReachRatio:.65}),
 candidate('side-edge','浮遊する縁・右へ横座り','side-sit','両脚を右へ出して少し後ろへ預ける。',{family:'side-sit',seatHeightRatio:.5,widthRatio:.16,leanRadians:-.12,side:'right',handMode:'relaxed',gripReachRatio:.65}),
 candidate('shoulder-upright','肩車・基本の肩支持','shoulder','運ぶ側をfixtureで用意し、頭・胴・脚の近接を別に観察する。',{preset:'shoulder',anchorMode:'support',seatLift:.1,seatBack:.2,spread:1}),
 candidate('shoulder-back-offset','肩車・後ろへ余裕を取る','shoulder','腰の後方余裕と脚の開きを変えた肩車。成立保証はしない。',{preset:'shoulder',anchorMode:'support',seatLift:.06,seatBack:.27,spread:1.15})
])

export const POSE_PATTERN_CATALOG_NOTES=deepFreeze({status:'candidate',angleUnit:'radian',coordinates:'support +Z forward, +X right, +Y up; positive support pitch nose-up, positive roll right-bank',caseMeaning:'case.options is a deep merged base+variant; case.condition is a host-applied input/support change',standard:'18 patterns x 18 selected conditions = 324 per unchanged rider; not a Cartesian product',stress:'standard coverage plus 12 boundary/combined conditions per pattern = 540; success is not guaranteed',bodySize:'Never scale or modify a real rider VRM. Use separate real models or a separate fixture suite for rider size differences.',carrierScale:'Shoulder conditions may scale the carrier fixture only; the rider model stays unchanged.',adoptedNimbusProfile:'This candidate catalog does not alter specs/n02-normal-flight.v1.json or its adopted baseline.'})

const variant=(id,title,optionDelta={},conditionDelta={},kind='single-axis')=>({id,title,optionDelta,conditionDelta,kind})
const tracked=pattern=>['chair','straddle','side-sit'].includes(pattern.family)?{preserveHands:true,handMode:'tracked'}:{preserveHands:true}
function familyVariants(pattern){
 switch(pattern.family){
 case 'nimbus':return [variant('crouch-shallow','浅いしゃがみ',{crouch:.25}),variant('crouch-deep','深いしゃがみ',{crouch:.75}),variant('stance-narrow','狭い足幅',{stanceWidth:.8}),variant('stance-wide','広い足幅',{stanceWidth:1.25}),variant('body-back','上体を後ろへ',{pitch:-.12}),variant('body-forward','上体を前へ',{pitch:.16})]
 case 'standing':return [variant('knee-straight','膝を伸ばす',{kneeBend:0}),variant('knee-soft','膝を深く緩める',{kneeBend:.24}),variant('body-roll-negative','上体の横傾き・負方向',{roll:-.1}),variant('body-roll-positive','上体の横傾き・正方向',{roll:.1}),variant('body-back','上体を後ろへ',{pitch:-.12}),variant('body-forward','上体を前へ',{pitch:.16})]
 case 'prone':return [variant('knee-low','小さい膝曲げ',{legs:{kneeBendDegrees:4}}),variant('knee-high','大きい膝曲げ',{legs:{kneeBendDegrees:18}}),variant('legs-together','脚をそろえる',{legs:{legSplayDegrees:0}}),variant('legs-open','脚を開く',{legs:{legSplayDegrees:6}}),variant('ankle-soft','足首を緩める',{legs:{anklePointDegrees:20}}),variant('ankle-point','足首を伸ばす',{legs:{anklePointDegrees:55}})]
 case 'chair':case 'straddle':case 'side-sit':return [variant('seat-low','脚を前へ曲げる支持高',{seatHeightRatio:.4}),variant('seat-high','脚を下ろす支持高',{seatHeightRatio:.85}),variant('feet-narrow','足ターゲットを狭く',{widthRatio:.08}),variant('feet-wide','足ターゲットを広く',{widthRatio:.58}),variant('grip-near','近いグリップ',{handMode:'grip',gripReachRatio:.45}),variant('grip-far','遠いグリップ',{handMode:'grip',gripReachRatio:1.1})]
 case 'shoulder':return [variant('seat-near','腰を肩の近くへ',{seatBack:.16}),variant('seat-far','腰を後ろへ',{seatBack:.34}),variant('legs-narrow','脚の開きを小さく',{spread:.75}),variant('legs-wide','脚の開きを大きく',{spread:1.6}),variant('carrier-small','運ぶ側fixtureを小さく',{}, {carrierScale:.8}),variant('carrier-large','運ぶ側fixtureを大きく',{}, {carrierScale:1.2})]
 default:throw new TypeError('Unknown pattern family')
 }
}
function standardVariants(pattern){
 const family=familyVariants(pattern)
 return [variant('base','基本',{}, {},'base'),...family.slice(0,2),variant('support-up','支持面を上向き',{}, {supportPitchRadians:rad(10)}),variant('support-down','支持面を下向き',{}, {supportPitchRadians:rad(-10)}),variant('support-left','支持面を左へ傾ける',{}, {supportRollRadians:rad(-10)}),variant('support-right','支持面を右へ傾ける',{}, {supportRollRadians:rad(10)}),variant('look-left','左を見回す',{}, {headYaw:-.6}),variant('look-right','右を見回す',{}, {headYaw:.6}),variant('look-up','上を見る',{}, {headPitch:-.3}),variant('look-down','下を見る',{}, {headPitch:.3}),variant('tracked-hands','模擬追跡手を保持',tracked(pattern)),...family.slice(2),variant('combined-up-right','傾斜と右の見回し',{}, {supportPitchRadians:rad(8),supportRollRadians:rad(6),headYaw:.35},'combined'),variant('combined-down-left','逆傾斜と左の見回し',{}, {supportPitchRadians:rad(-8),supportRollRadians:rad(-6),headYaw:-.35},'combined')]
}
function boundaries(pattern){
 switch(pattern.family){
 case 'nimbus':return [variant('family-boundary-a','最小足幅・浅い膝',{stanceWidth:.6,crouch:.05},{},'boundary'),variant('family-boundary-b','広い足幅・深い膝',{stanceWidth:1.4,crouch:.95},{},'boundary')]
 case 'standing':return [variant('family-boundary-a','最大膝と前傾',{kneeBend:.25,pitch:.3},{},'boundary'),variant('family-boundary-b','後傾と横の釣り合い',{pitch:-.3,roll:.25},{},'boundary')]
 case 'prone':return [variant('family-boundary-a','脚の広がりと膝曲げ上限',{legs:{kneeBendDegrees:20,legSplayDegrees:6,anklePointDegrees:55}},{},'boundary'),variant('family-boundary-b','脚を細く伸ばす境界',{legs:{kneeBendDegrees:3,legSplayDegrees:0,anklePointDegrees:20}},{},'boundary')]
 case 'chair':case 'straddle':case 'side-sit':return [variant('family-boundary-a','高い支持・狭い足・後傾',{seatHeightRatio:1.05,widthRatio:.04,leanRadians:-.55,handMode:'grip',gripReachRatio:.25},{},'boundary'),variant('family-boundary-b','低い支持・広い足・遠い手',{seatHeightRatio:.25,widthRatio:.85,leanRadians:.65,handMode:'grip',gripReachRatio:1.4},{},'boundary')]
 case 'shoulder':return [variant('family-boundary-a','小さいcarrierと狭い脚',{seatBack:.1,spread:.45},{carrierScale:.65},'boundary'),variant('family-boundary-b','大きいcarrierと広い脚',{seatBack:.4,spread:1.8},{carrierScale:1.35},'boundary')]
 default:throw new TypeError('Unknown pattern family')
 }
}
function stressVariants(pattern){return [variant('stress-support-up','大きい上向き支持',{}, {supportPitchRadians:rad(25)},'boundary'),variant('stress-support-down','大きい下向き支持',{}, {supportPitchRadians:rad(-25)},'boundary'),variant('stress-support-left','大きい左傾斜',{}, {supportRollRadians:rad(-25)},'boundary'),variant('stress-support-right','大きい右傾斜',{}, {supportRollRadians:rad(25)},'boundary'),variant('stress-look-left','強い左見回し',{}, {headYaw:-1.15},'boundary'),variant('stress-look-right','強い右見回し',{}, {headYaw:1.15},'boundary'),variant('stress-look-up','強い見上げ',{}, {headPitch:-.7},'boundary'),variant('stress-look-down','強い見下げ',{}, {headPitch:.7},'boundary'),variant('stress-tracked-look','追跡手と強い見回し',tracked(pattern),{headYaw:.9,headPitch:-.4},'combined'),variant('stress-combined','大きい複合傾斜と見回し',{}, {supportPitchRadians:rad(25),supportRollRadians:rad(-20),headYaw:-.9},'combined'),...boundaries(pattern)]}

/** Deterministic selected coverage per unchanged rider. Consumers apply frame
 * pitch/roll and head look from condition; only shoulder cases have carrierScale.
 * Returned objects are independent mutable copies for host-specific anchors.
 */
export function createPatternCases({intensity='standard'}={}){
 if(!['standard','stress'].includes(intensity))throw new TypeError('Unknown pattern sweep intensity')
 return POSE_PATTERN_CATALOG.flatMap(pattern=>{
  const standard=standardVariants(pattern),variants=intensity==='stress'?[...standard,...stressVariants(pattern)]:standard
  return variants.map((v,index)=>({id:pattern.id+'__'+v.id,patternId:pattern.id,title:pattern.title+' / '+v.title,family:pattern.family,options:merge(pattern.options,v.optionDelta),condition:{intensity,variantId:v.id,variantTitle:v.title,variantKind:v.kind,status:'candidate',stressOnly:index>=standard.length,supportPitchRadians:0,supportRollRadians:0,headYaw:0,headPitch:0,...(pattern.family==='shoulder'?{carrierScale:1}:{}),...clone(v.conditionDelta)}}))
 })
}
