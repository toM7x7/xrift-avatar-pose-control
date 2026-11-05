// Humanoid role inference from bone names and skeleton shape. Pure arithmetic, no three.js.
// Input: bind-time joint positions (one shared space), parents, and how much geometry each bone moves.
// - Names: a word table per segment (Unity/VRM, Mixamo, VRChat/Cats, Unreal, Rigify, Biped, CC, DAZ, MMD).
//   Sides from L/R, Left/Right, 左/右. "leg" is the shin for Mixamo but the thigh for VRChat/Cats, so both readings are tried.
// - Shape: two mirrored chains going down (legs), two mirrored chains above them (arms), one chain rising between the arms (neck/head).
//   Knee/ankle and elbow/wrist come from length ratios, the toe bend and the finger fan; the head is the heaviest bone above the arms.
//   Left/right comes from name marks, toe direction and foot geometry; with none of them, or when they disagree, nothing is decided.
// - Combined: names and shape pointing at different limbs, undecided sides, or failed checks all refuse (the caller keeps the host pose).
export const INFERENCE_REQUIRED_ROLES=Object.freeze(['hips','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'])
const REQUIRED=INFERENCE_REQUIRED_ROLES,SIDES=['left','right']

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s]
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.hypot(a[0],a[1],a[2]),dist=(a,b)=>len(sub(a,b))
const norm=a=>{const l=len(a);return l>1e-12?scale(a,1/l):[0,0,0]},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const flat=(a,up)=>sub(a,scale(up,dot(a,up))),angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(norm(a),norm(b)))))
function argmax(items,score){let best=null,top=-Infinity;for(const item of items){const s=score(item);if(s>top){top=s;best=item}}return best}

function buildTree(input){
 const n=input.names.length,children=Array.from({length:n},()=>[]),depth=new Array(n).fill(0),sub=Array.from({length:n},()=>[])
 input.parent.forEach((p,i)=>{if(p>=0&&p<n&&p!==i)children[p].push(i)})
 const visit=(i,d)=>{depth[i]=d;const list=[i];for(const c of children[i])list.push(...visit(c,d+1));return sub[i]=list}
 input.parent.forEach((p,i)=>{if(p<0)visit(i,0)})
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity]
 for(const q of input.positions)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],q[k]);hi[k]=Math.max(hi[k],q[k])}
 return {n,names:input.names,parent:input.parent,children,depth,sub,p:input.positions,w:input.weights,centroid:input.centroids??new Array(n).fill(null),extent:n?Math.hypot(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]):0}
}
function isAncestor(t,a,b){for(let i=t.parent[b];i>=0;i=t.parent[i])if(i===a)return true;return false}
function pathDown(t,top,bottom){const path=[bottom];for(let i=bottom;i!==top;){i=t.parent[i];if(i<0)return [];path.push(i)}return path.reverse()}
function lca(t,a,b){const seen=new Set();for(let i=a;i>=0;i=t.parent[i])seen.add(i);for(let i=b;i>=0;i=t.parent[i])if(seen.has(i))return i;return -1}

// ---- names ----
const LEFT=new Set(['left','l','lft']),RIGHT=new Set(['right','r','rt'])
// Prefix words carry no meaning; a number right after one belongs to the prefix (Bip001, Character1).
const NEUTRAL=new Set(['j','bip','biped','valve','c','mixamorig','character','def','cc','base','bend','jnt','joint','bone','b'])
// Twist, helper, IK, end and secondary bones are never the main human joint.
const SKIP=new Set(['twist','roll','end','tip','nub','null','ik','fk','pole','target','ctrl','control','mch','org','helper','tweak','share','adj','sec','d','ex','sub','dummy','socket','ref','corrective','offset','top','aux','proxy','jiggle','phys'])
const LIMB={upperleg:'UpperLeg',upleg:'UpperLeg',thigh:'UpperLeg',hip:'UpperLeg',lowerleg:'LowerLeg',calf:'LowerLeg',shin:'LowerLeg',knee:'LowerLeg',foot:'Foot',ankle:'Foot',upperarm:'UpperArm',arm:'UpperArm',uparm:'UpperArm',shldr:'UpperArm',lowerarm:'LowerArm',forearm:'LowerArm',elbow:'LowerArm',hand:'Hand',wrist:'Hand'}
const LEG={mixamo:'LowerLeg',vrchat:'UpperLeg'}
const CENTER={hips:'hips',hip:'hips',pelvis:'hips',head:'head',neck:'neck',spine:'spine',chest:'chest'}
// MMD: sides are the leading 左/右; 足D, 足IK, つま先 do not match exactly and drop out.
const MMD_LIMB={'足':'UpperLeg','ひざ':'LowerLeg','膝':'LowerLeg','足首':'Foot','腕':'UpperArm','ひじ':'LowerArm','肘':'LowerArm','手首':'Hand'}
const MMD_CENTER={'頭':'head','首':'neck','上半身':'spine','上半身2':'chest'}

export function parseBoneName(name){
 const text=String(name).normalize('NFKC').trim(),mmd=/^[左右]?[぀-ヿ一-鿿]/.test(text)
 if(mmd){const side=text.startsWith('左')?1:text.startsWith('右')?-1:0;return {side,base:side?text.slice(1):text,numbered:false,skip:false,mmd}}
 const tokens=text.replace(/^.*[:|]/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').replace(/([A-Za-z])(\d)/g,'$1 $2').replace(/(\d)([A-Za-z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
 let side=0,numbered=false,skip=false;const words=[]
 tokens.forEach((token,i)=>{
  if(/^\d+$/.test(token)){if(!NEUTRAL.has(tokens[i-1]??''))numbered=true;return}
  if(LEFT.has(token)){side=side===-1?0:1;return}
  if(RIGHT.has(token)){side=side===1?0:-1;return}
  if(NEUTRAL.has(token))return
  if(SKIP.has(token))skip=true
  words.push(token)
 })
 return {side,base:words.join(''),numbered,skip,mmd}
}
function roleFromName(parsed,dialect){
 if(parsed.skip)return null
 const sided=segment=>segment?(parsed.side>0?'left':'right')+segment:null
 if(parsed.mmd)return parsed.side?sided(MMD_LIMB[parsed.base]):MMD_CENTER[parsed.base]??null
 if(parsed.side)return sided(LIMB[parsed.base]??(parsed.base==='leg'?LEG[dialect]:null))
 const center=CENTER[parsed.base];return center==='spine'?'spine*':center??null
}
function nameLayer(t,parsed){
 const read=dialect=>{
  const candidates=new Map(),roles={},ambiguous=[]
  parsed.forEach((p,i)=>{const role=roleFromName(p,dialect);if(role)candidates.set(role,[...(candidates.get(role)??[]),i])})
  for(const [role,list] of candidates){
   if(role==='spine*')continue
   const plain=list.filter(i=>!parsed[i].numbered)
   // Nested hips (CC Hip above Pelvis) take the outermost; nested necks take the one nearest the chest.
   const pick=list.length===1?list[0]:plain.length===1?plain[0]:role==='hips'||role==='neck'?list.find(a=>list.every(b=>a===b||isAncestor(t,a,b))):undefined
   if(pick===undefined)ambiguous.push(role);else roles[role]=pick
  }
  // spine, spine1, spine_01 ... go shallow to deep as spine then chest, unless a chest is named.
  const spines=(candidates.get('spine*')??[]).sort((a,b)=>t.depth[a]-t.depth[b])
  if(spines.length)roles.spine=spines[0]
  if(roles.chest===undefined&&spines.length>1)roles.chest=spines[1]
  return {roles,dialect,ambiguous,found:REQUIRED.filter(r=>roles[r]!==undefined).length}
 }
 const legViolations=layer=>SIDES.filter(s=>{const u=layer.roles[s+'UpperLeg'],l=layer.roles[s+'LowerLeg'],f=layer.roles[s+'Foot'];return (u!==undefined&&l!==undefined&&!isAncestor(t,u,l))||(l!==undefined&&f!==undefined&&!isAncestor(t,l,f))}).length
 if(!parsed.some(p=>!p.skip&&!p.mmd&&p.side!==0&&p.base==='leg'))return {...read('mixamo'),dialect:null}
 const a=read('mixamo'),b=read('vrchat')
 return b.found>a.found||(b.found===a.found&&legViolations(b)<legViolations(a))?b:a
}

// ---- left / right evidence ----
const marksOf=(t,parsed,root)=>t.sub[root].reduce((s,i)=>s+parsed[i].side,0)
// Forward from toes or foot geometry; feet pointing opposite ways give no evidence.
function forwardFrom(t,feet,up){
 const evidence=[]
 const combine=(kind,vectors)=>{const found=vectors.filter(Boolean);if(!found.length||(found.length===2&&dot(found[0],found[1])<=0))return;evidence.push({kind,forward:norm(found.reduce(add))})}
 combine('toes',feet.map(({foot,shin})=>{
  const tip=argmax(t.sub[foot].slice(1),d=>len(flat(sub(t.p[d],t.p[foot]),up)));if(tip===null)return null
  const v=flat(sub(t.p[tip],t.p[foot]),up);return len(v)>=.1*shin?v:null
 }))
 // Shoes reach further forward of the ankle than behind it.
 combine('feet',feet.map(({foot,shin})=>{
  let total=0,acc=[0,0,0]
  for(const d of t.sub[foot]){const c=t.centroid[d],w=t.w[d];if(c&&w>0){total+=w;acc=add(acc,scale(c,w))}}
  if(total<=0)return null
  const v=flat(sub(scale(acc,1/total),t.p[foot]),up);return len(v)>=.05*shin?v:null
 }))
 return evidence
}

// ---- checks shared by every way of deciding ----
export function validateRoles(input,roles){return validate(buildTree(input),roles)}
function validate(t,r){
 const missing=REQUIRED.filter(role=>r[role]===undefined)
 if(missing.length)return ['missing '+missing.join(', ')]
 const used=REQUIRED.map(role=>r[role])
 if(new Set(used).size!==used.length)return ['the same bone is used for two roles']
 const problems=[]
 const chain=names=>{for(let i=1;i<names.length;i++)if(!isAncestor(t,r[names[i-1]],r[names[i]]))problems.push(`${names[i]} is not below ${names[i-1]}`)}
 chain(['hips','head'])
 for(const s of SIDES){chain(['hips',s+'UpperLeg',s+'LowerLeg',s+'Foot']);chain(['hips',s+'UpperArm',s+'LowerArm',s+'Hand'])}
 const tops=['head','leftUpperArm','rightUpperArm','leftUpperLeg','rightUpperLeg']
 for(const a of tops)for(const b of tops)if(a!==b&&isAncestor(t,r[a],r[b]))problems.push(`${b} is inside ${a}`)
 if(problems.length)return problems
 const P=role=>t.p[r[role]],torso=dist(P('head'),P('hips'))
 if(torso<1e-6)return ['head and hips are at the same place']
 const up=norm(sub(P('head'),P('hips'))),h=role=>dot(sub(P(role),P('hips')),up)
 for(const s of SIDES){
  if(!(h(s+'UpperLeg')>h(s+'LowerLeg')&&h(s+'LowerLeg')>h(s+'Foot')&&h(s+'Foot')<0))problems.push(`${s} leg does not go down from the hips`)
  if(!(h(s+'UpperArm')>0&&h(s+'UpperArm')<=h('head')+.1*torso))problems.push(`${s} shoulder is not between the hips and the head`)
 }
 const lateral=flat(sub(P('leftUpperLeg'),P('rightUpperLeg')),up)
 if(len(lateral)<1e-4)problems.push('the legs start at the same place')
 else{
  if(dot(sub(P('leftUpperArm'),P('rightUpperArm')),lateral)<=0)problems.push('left arm is not on the left leg side')
  if(dot(sub(P('leftHand'),P('rightHand')),lateral)<=0)problems.push('left hand is not on the left leg side')
 }
 const seg=(a,b)=>dist(P(a),P(b))
 for(const [name,a,b] of [['thigh','leftUpperLeg','leftLowerLeg','rightUpperLeg','rightLowerLeg'],['shin','leftLowerLeg','leftFoot','rightLowerLeg','rightFoot'],['upper arm','leftUpperArm','leftLowerArm','rightUpperArm','rightLowerArm'],['forearm','leftLowerArm','leftHand','rightLowerArm','rightHand']].map(([name,a,b,c,d])=>[name,seg(a,b),seg(c,d)])){
  if(Math.abs(a-b)>.15*Math.max(a,b))problems.push(`left and right ${name} lengths differ`)
  if(Math.max(a,b)<1e-4)problems.push(`${name} has no length`)
 }
 for(const s of SIDES){
  const legRatio=seg(s+'UpperLeg',s+'LowerLeg')/seg(s+'LowerLeg',s+'Foot'),armRatio=seg(s+'UpperArm',s+'LowerArm')/seg(s+'LowerArm',s+'Hand')
  if(!(legRatio>=.5&&legRatio<=2))problems.push(`${s} thigh/shin ratio ${legRatio.toFixed(2)}`)
  if(!(armRatio>=.5&&armRatio<=2))problems.push(`${s} upper arm/forearm ratio ${armRatio.toFixed(2)}`)
 }
 // Right-handed: left = up x forward. A known foot direction must agree with the left/right labels.
 if(len(lateral)>=1e-4)for(const e of forwardFrom(t,SIDES.map(s=>({foot:r[s+'Foot'],shin:seg(s+'LowerLeg',s+'Foot')})),up))if(dot(cross(up,e.forward),lateral)<=0)problems.push(`left/right contradicts the ${e.kind} direction`)
 if(t.w.some(w=>w>0)&&t.w[r.head]<=0)problems.push('head moves no geometry')
 return problems
}

// ---- shape ----
function significantPairs(t){
 const pairs=[]
 for(let node=0;node<t.n;node++){
  const branches=[]
  for(const child of t.children[node]){const far=argmax(t.sub[child],d=>dist(t.p[d],t.p[node])),reach=dist(t.p[far],t.p[node]);if(reach>=.15*t.extent)branches.push({node,child,reach,far})}
  for(let i=0;i<branches.length;i++)for(let j=i+1;j<branches.length;j++){
   const a=branches[i],b=branches[j],rootA=dist(t.p[a.child],t.p[node]),rootB=dist(t.p[b.child],t.p[node])
   if(Math.abs(a.reach-b.reach)>.2*Math.max(a.reach,b.reach))continue
   if(Math.abs(rootA-rootB)>.25*Math.max(rootA,rootB)+.02*t.extent)continue
   // Overlapping chains (an MMD leg and its D bones) are not a mirrored pair.
   if(dist(t.p[a.far],t.p[b.far])<.1*Math.min(a.reach,b.reach))continue
   pairs.push({node,a,b})
  }
 }
 return pairs
}
// Hip, knee, ankle: thigh about as long as the shin, the ankle where the chain bends to the toes.
function parseLeg(t,path,low){
 let best=null
 for(let i=0;i<path.length;i++)for(let j=i+1;j<path.length;j++)for(let k=j+1;k<path.length;k++){
  const thigh=dist(t.p[path[i]],t.p[path[j]]),shin=dist(t.p[path[j]],t.p[path[k]]);if(shin<1e-6)continue
  const ratio=thigh/shin;if(ratio<.5||ratio>2)continue
  const last=k===path.length-1,turned=!last&&angle(sub(t.p[path[k]],t.p[path[k-1]]),sub(t.p[path[k+1]],t.p[path[k]]))>35*Math.PI/180
  const cost=Math.abs(Math.log(ratio))+(last?.3:turned?0:.6)+(dist(t.p[low],t.p[path[k]])>.8*shin?1:0)-i*1e-6+(t.w[path[i]]>0?0:1e-6)
  if(!best||cost<best.cost)best={upper:path[i],lower:path[j],end:path[k],cost}
 }
 return best
}
// Shoulder, elbow, wrist: the wrist is the finger fan (3+ short branches) when there is one, upper arm about as long as the forearm.
// Clavicles near the body axis are not upper arms; chains far shorter than the legs (finger joints) are avoided.
function parseArm(t,path,axis,hipWidth,legLength){
 const lateral=i=>len(flat(sub(t.p[i],axis.origin),axis.up)),tip=path[path.length-1]
 const wrist=path.findIndex((b,k)=>{if(k<2||t.children[b].length<3)return false;const incoming=dist(t.p[b],t.p[path[k-1]]);return t.children[b].every(c=>Math.max(...t.sub[c].map(d=>dist(t.p[d],t.p[b])))<incoming)})
 let best=null
 for(let i=0;i<path.length;i++)for(let j=i+1;j<path.length;j++)for(let k=j+1;k<path.length;k++){
  if(wrist>=0&&k!==wrist)continue
  const upper=dist(t.p[path[i]],t.p[path[j]]),fore=dist(t.p[path[j]],t.p[path[k]]);if(fore<1e-6)continue
  const ratio=upper/fore;if(ratio<.5||ratio>2)continue
  const cost=Math.abs(Math.log(ratio))+(lateral(path[i])<.6*hipWidth?1:0)+(dist(t.p[tip],t.p[path[k]])/fore>1.2?1:0)+(upper+fore<.5*legLength?1:0)-i*1e-6
  if(!best||cost<best.cost)best={upper:path[i],lower:path[j],end:path[k],cost,wrist:wrist>=0}
 }
 return best
}
function structureLayer(t,parsed){
 if(t.n<14||t.extent<1e-6)return {shape:null,reason:'too few bones'}
 const pairs=significantPairs(t),candidates=[],inside=(node,pair)=>t.sub[pair.a.child].includes(node)||t.sub[pair.b.child].includes(node)
 for(const legs of pairs)for(const arms of pairs){
  if(legs===arms||legs.node===arms.node)continue
  const hips=lca(t,legs.node,arms.node)
  if(hips<0||hips===arms.node||inside(arms.node,legs)||inside(legs.node,arms))continue
  const rise=sub(t.p[arms.node],t.p[hips]);if(len(rise)<.05*t.extent)continue
  const up=norm(rise),lowest=child=>argmax(t.sub[child],d=>-dot(sub(t.p[d],t.p[hips]),up))
  // Legs go down from the hips.
  const legEnds=[legs.a,legs.b].map(b=>lowest(b.child)),downs=legEnds.map(d=>-dot(sub(t.p[d],t.p[hips]),up))
  const spans=[legs.a,legs.b].map(b=>Math.max(...t.sub[b.child].map(d=>dist(t.p[d],t.p[hips]))))
  if(downs.some((d,i)=>d<.5*spans[i]))continue
  if(Math.min(arms.a.reach,arms.b.reach)<.35*Math.min(legs.a.reach,legs.b.reach))continue
  const [limbA,limbB]=[legs.a,legs.b].map((b,i)=>parseLeg(t,pathDown(t,b.child,legEnds[i]),legEnds[i]));if(!limbA||!limbB)continue
  const lateral=flat(sub(t.p[limbA.upper],t.p[limbB.upper]),up);if(len(lateral)<1e-4)continue
  // The arm on leg A's side is arm A.
  const armBranches=dot(sub(t.p[arms.a.far],t.p[arms.b.far]),lateral)>0?[arms.a,arms.b]:[arms.b,arms.a]
  const hipWidth=(len(flat(sub(t.p[limbA.upper],t.p[hips]),up))+len(flat(sub(t.p[limbB.upper],t.p[hips]),up)))/2
  const legLength=[limbA,limbB].reduce((s,l)=>s+dist(t.p[l.upper],t.p[l.lower])+dist(t.p[l.lower],t.p[l.end]),0)/2
  const [armA,armB]=armBranches.map(b=>parseArm(t,pathDown(t,b.child,b.far),{origin:t.p[hips],up},hipWidth,legLength));if(!armA||!armB)continue
  // Neck and head: the branch of the arm node that rises furthest; the head is its heaviest bone.
  const others=t.children[arms.node].filter(c=>c!==arms.a.child&&c!==arms.b.child),rising=c=>Math.max(...t.sub[c].map(d=>dot(sub(t.p[d],t.p[arms.node]),up)))
  const headChild=argmax(others,rising);if(headChild===null||rising(headChild)<.03*t.extent)continue
  const headPath=pathDown(t,headChild,argmax(t.sub[headChild],d=>dot(sub(t.p[d],t.p[arms.node]),up))),head=argmax(headPath,i=>t.w[i])
  if(!(t.w[head]>0))continue
  // A wrist with fingers is strong evidence.
  candidates.push({hips,up,lateral,down:Math.min(...downs),head,headPath,armsNode:arms.node,legs:[legs.a,legs.b],legLimbs:[limbA,limbB],arms:armBranches,armLimbs:[armA,armB],
   cost:limbA.cost+limbB.cost+armA.cost+armB.cost-(armA.wrist?.3:0)-(armB.wrist?.3:0),key:[legs.a.child,legs.b.child,arms.a.child,arms.b.child].sort().join()})
 }
 if(!candidates.length)return {shape:null,reason:'no pair of legs and pair of arms with a head between them'}
 // A head clearly lighter than another candidate's (twin tails read as arms) is penalized.
 const heaviest=Math.max(...candidates.map(c=>t.w[c.head]))
 for(const c of candidates)if(t.w[c.head]<.5*heaviest)c.cost+=1
 // Among the legs reaching lowest, the best fit wins; a close rival with other limbs means undecided.
 const lowestDown=Math.max(...candidates.map(c=>c.down)),ranked=candidates.filter(c=>c.down>=.97*lowestDown).sort((a,b)=>a.cost-b.cost),c=ranked[0],rival=ranked.find(r=>r.key!==c.key)
 if(rival&&rival.cost-c.cost<.25)return {shape:null,reason:'more than one possible pair of arms or legs'}
 const {hips,up,lateral,head,headPath}=c,[legA,legB]=c.legs,[limbA,limbB]=c.legLimbs,[armA,armB]=c.arms,torso=pathDown(t,hips,c.armsNode).slice(1,-1)
 // Left/right from name marks, toes and foot geometry; nothing, or disagreement, leaves it undecided.
 const votes=[],legMarks=[marksOf(t,parsed,legA.child),marksOf(t,parsed,legB.child)],armMarks=[marksOf(t,parsed,armA.child),marksOf(t,parsed,armB.child)]
 const sameSign=m=>(m[0]>0&&m[1]>0)||(m[0]<0&&m[1]<0)
 if(sameSign(legMarks)||sameSign(armMarks))return {shape:null,reason:'left/right marks in the names point the same way on both sides'}
 const marks=legMarks[0]+armMarks[0]-legMarks[1]-armMarks[1]
 if(marks!==0)votes.push({kind:'names',aIsLeft:marks>0})
 for(const e of forwardFrom(t,[limbA,limbB].map(l=>({foot:l.end,shin:dist(t.p[l.lower],t.p[l.end])})),up))votes.push({kind:e.kind,aIsLeft:dot(cross(up,e.forward),lateral)>0})
 if(!votes.length)return {shape:null,reason:'cannot tell left from right (no L/R in the names, no toes, no foot geometry)'}
 if(votes.some(v=>v.aIsLeft!==votes[0].aIsLeft))return {shape:null,reason:`left/right evidence disagrees (${votes.map(v=>`${v.kind}: ${v.aIsLeft?'A':'B'} is left`).join(', ')})`}
 const aIsLeft=votes[0].aIsLeft,[leftLeg,rightLeg]=aIsLeft?[limbA,limbB]:[limbB,limbA],[leftArm,rightArm]=aIsLeft?c.armLimbs:[c.armLimbs[1],c.armLimbs[0]]
 const roles={hips,head,leftUpperLeg:leftLeg.upper,leftLowerLeg:leftLeg.lower,leftFoot:leftLeg.end,rightUpperLeg:rightLeg.upper,rightLowerLeg:rightLeg.lower,rightFoot:rightLeg.end,leftUpperArm:leftArm.upper,leftLowerArm:leftArm.lower,leftHand:leftArm.end,rightUpperArm:rightArm.upper,rightLowerArm:rightArm.lower,rightHand:rightArm.end}
 const neckIndex=headPath.indexOf(head)-1
 if(neckIndex>=0)roles.neck=headPath[neckIndex]
 if(torso.length)roles.spine=torso[0]
 roles.chest=torso.length>=2?torso[torso.length-1]:c.armsNode
 return {shape:{roles,side:votes.map(v=>v.kind),hips,headPath,torso,legBranches:aIsLeft?[legA.child,legB.child]:[legB.child,legA.child],armBranches:aIsLeft?[armA.child,armB.child]:[armB.child,armA.child]},reason:null}
}

// ---- combined ----
// A named bone must sit on the same limb, head path or torso the shape found; where along it is left to the names.
function sameChain(t,shape,role,bone){
 const r=shape.roles
 // Biped's Pelvis right above the shape's hips (its Spine) is the same hips.
 if(role==='hips')return (bone===r.hips||isAncestor(t,bone,r.hips)||isAncestor(t,r.hips,bone))&&dist(t.p[bone],t.p[r.hips])<=.35*dist(t.p[r.hips],t.p[r.head])
 if(role==='head'||role==='neck')return shape.headPath.includes(bone)||bone===t.parent[shape.headPath[0]]
 if(role==='spine'||role==='chest')return shape.torso.includes(bone)||bone===t.parent[shape.headPath[0]]
 const side=role.startsWith('left')?0:1
 return t.sub[role.endsWith('Leg')||role.endsWith('Foot')?shape.legBranches[side]:shape.armBranches[side]].includes(bone)
}
// spine, chest and neck stay only when they lie between hips and head, in that order, on bones no other role uses.
function tidyOptional(t,roles){
 const out={...roles};if(out.hips===undefined||out.head===undefined)return out
 const path=pathDown(t,out.hips,out.head).slice(1,-1),used=new Set(REQUIRED.map(r=>out[r]));let after=-1
 for(const role of ['spine','chest','neck']){const bone=out[role];if(bone===undefined)continue;const at=path.indexOf(bone);if(at<=after||used.has(bone))delete out[role];else{after=at;used.add(bone)}}
 return out
}
/** Decide humanoid roles (bone indices) or refuse with a reason. Never guesses past disagreement. */
export function resolveRoles(input){
 const t=buildTree(input),parsed=t.names.map(parseBoneName),named=nameLayer(t,parsed),{shape,reason:structureReason}=structureLayer(t,parsed)
 const base={dialect:named.found?named.dialect:null,namesFound:named.found,structureReason}
 const refuse=(reason,conflicts=[],side=[])=>({ok:false,method:null,roles:{},side,reason,conflicts,...base})
 if(shape){
  const required=new Set(REQUIRED),disagree=Object.entries(named.roles).filter(([role,bone])=>!sameChain(t,shape,role,bone))
  const conflicts=disagree.filter(([role])=>required.has(role)).map(([role,bone])=>`${role}: names "${t.names[bone]}" / shape "${shape.roles[role]!==undefined?t.names[shape.roles[role]]:'-'}"`)
  if(conflicts.length)return refuse('bone names and skeleton shape disagree',conflicts,shape.side)
  // Named roles win, the shape fills the rest; a disagreeing named spine/chest/neck is dropped.
  const kept=Object.fromEntries(Object.entries(named.roles).filter(([role])=>!disagree.some(([r])=>r===role))),roles=tidyOptional(t,{...shape.roles,...kept}),problems=validate(t,roles)
  if(problems.length)return refuse('checks failed: '+problems.join('; '),[],shape.side)
  return {ok:true,method:named.found?'names+structure':'structure',roles,side:shape.side,reason:null,conflicts:[],...base}
 }
 if(named.found===REQUIRED.length){
  const roles=tidyOptional(t,named.roles),problems=validate(t,roles)
  return problems.length?refuse('checks failed: '+problems.join('; ')):{ok:true,method:'names',roles,side:['names'],reason:null,conflicts:[],...base}
 }
 return refuse(`skeleton shape: ${structureReason}; names: ${named.found}/14 roles${named.ambiguous.length?'; names matched more than one bone for '+named.ambiguous.join(', '):''}`)
}
