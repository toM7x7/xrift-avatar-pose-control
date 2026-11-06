// Pose Studio: author and review full-body action clips (keys + timeline)
// on the built-in test bodies or local VRMs. Four views (front/side/top
// orthographic + orbit), onion-skinned keys, contact/clearance/balance guides
// and a frame-by-frame quality screen. Nothing leaves the browser.
import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {inspectHumanoidRigs,prepareRig,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {prepareHumanoidRig} from '../src/index.mjs'
import {selectActorRig} from '../src/adapters/xrift.mjs'
import {authoringRig} from '../src/authoring/rig.mjs'
import {applyAuthoredPose,buildColliders} from '../src/authoring/solve.mjs'
import {sampleAction,sampleKey,releaseDuration,resolvedKeys} from '../src/authoring/clip.mjs'
import {evaluateAction,frameChannels,DEFAULT_THRESHOLDS} from '../src/authoring/quality.mjs'
import baseClip from '../specs/charge-wave.v1.json'
import './studio.css'

const viewport=document.querySelector('#viewport'),panel=document.querySelector('#panel')
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setScissorTest(true);viewport.append(renderer.domElement)
const scene=new THREE.Scene();scene.background=new THREE.Color('#e7ebe6')
scene.add(new THREE.HemisphereLight('#ffffff','#7d8c81',2.6));const sun=new THREE.DirectionalLight('#ffffff',2.1);sun.position.set(2.5,5,4);scene.add(sun)
const grid=new THREE.GridHelper(6,24,'#8ea093','#c9d3c9');scene.add(grid)
const persp=new THREE.PerspectiveCamera(38,1,.01,60);persp.position.set(2.4,1.7,3.2);persp.layers.enable(10)
const orbit=new OrbitControls(persp,renderer.domElement);orbit.target.set(0,.95,0);orbit.enableDamping=true
const ortho=name=>{const c=new THREE.OrthographicCamera(-1,1,1,-1,.01,40);c.name=name;c.layers.enable(10);return c}
const views=[{name:'正面',camera:ortho('front'),place:c=>{c.position.set(0,1,6);c.lookAt(0,1,0)}},{name:'右側面',camera:ortho('side'),place:c=>{c.position.set(-6,1,0);c.lookAt(0,1,0)}},{name:'上',camera:ortho('top'),place:c=>{c.position.set(0,8,.001);c.up.set(0,0,1);c.lookAt(0,0,0)}},{name:'斜め',camera:persp,place:null}]
views.forEach(v=>v.place?.(v.camera))

// --- state ---------------------------------------------------------------
let clip=structuredClone(baseClip),actor=null,rig=null,info=null,state={},result=null,lastFrame=null
const S={read:new URLSearchParams(location.search).get('read')==='vrm'?'vrm':'host',time:0,playing:true,speed:1,holdFor:2.6,beamFor:1,charge:1,mode:'timeline',key:'gather',staticKey:null,manual:null,guides:true,colliders:false,balance:true,onion:true,focus:{center:new THREE.Vector3(0,.9,0),size:1.1}}
const total=()=>S.holdFor+releaseDuration(clip,S.beamFor)+.2

// --- actors ----------------------------------------------------------------
const roles=['hips','spine','chest','upperChest','neck','head','leftShoulder','rightShoulder','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','leftToes','rightUpperLeg','rightLowerLeg','rightFoot','rightToes']
function disposeObject(root){root.traverse(o=>{o.geometry?.dispose?.();for(const m of [o.material].flat().filter(Boolean)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose()}})}
// How the solver reads the skeleton. 'host' = the way an XRift item does (selectActorRig: bone names, then
// names + skeleton shape), 'vrm' = the VRM humanoid definition. A VRM unreadable the host way falls back to its
// definition so the studio keeps working, and says that the avatar would not be posed in XRift.
function bindRig(){
 const rigs=inspectHumanoidRigs(actor.root)
 let viaVrm=null
 if(actor.vrm){const mesh=rigs.map(r=>r.mesh).find(m=>roles.slice(0,3).every(r=>!actor.bones[r]||m.skeleton.bones.includes(actor.bones[r])))??rigs[0]?.mesh;const map=Object.fromEntries(Object.entries(actor.bones).filter(([,b])=>b&&mesh.skeleton.bones.includes(b)));viaVrm={mesh,map}}
 const host=selectActorRig({scene:actor.root,rigs,userId:'studio',isLocal:true,feet:actor.root.getWorldPosition(new THREE.Vector3())})
 actor.read={mode:S.read,status:host.status,method:host.roles?.method??null,dialect:host.roles?.dialect??null,reason:host.diagnosis?.reason??null,conflicts:host.diagnosis?.conflicts??[],mismatch:[]}
 if(viaVrm&&host.rig)actor.read.mismatch=Object.entries(viaVrm.map).filter(([role,b])=>host.rig.bones[role]&&host.rig.bones[role]!==b).map(([role,b])=>`${role}: ${host.rig.bones[role].name} ≠ ${b.name}`)
 if(S.read==='host'&&host.rig){rig=prepareRig(host.rig);actor.read.used='host'}
 else if(viaVrm){rig=prepareHumanoidRig({mesh:viaVrm.mesh,bones:viaVrm.map});actor.read.used='vrm'}
 else{rig=prepareRig(rigs.find(r=>r.supported));actor.read.used='names'}
 info=authoringRig(rig);state={}
}
function setActor(next){
 if(actor){scene.remove(actor.root);actor.dispose()}
 actor=next;scene.add(actor.root);actor.root.updateWorldMatrix(true,true)
 const neutral=[];actor.root.traverse(o=>{if(o.isBone)neutral.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()})});actor.neutral=neutral
 bindRig()
 const box=new THREE.Box3().setFromObject(actor.root),size=box.getSize(new THREE.Vector3())
 S.focus={center:new THREE.Vector3(0,size.y*.5,0),size:Math.max(.6,size.y*.62)}
 orbit.target.copy(S.focus.center);persp.position.copy(S.focus.center).add(new THREE.Vector3(1.6,.55,2.3).multiplyScalar(size.y/1.6))
 buildOnion();describeRig()
}
function hostIdle(t){
 if(!actor)return
 for(const {o,p,q,s} of actor.neutral){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s)}
 actor.root.updateWorldMatrix(true,true)
 if(actor.fixture){actor.fixture.idle(t);return}
 // Local VRM: the host's idle drops the arms from the T-pose and breathes a little.
 const b=actor.bones,rotate=(bone,axis,angle)=>{if(!bone)return;const target=new THREE.Quaternion().setFromAxisAngle(axis,angle).multiply(bone.getWorldQuaternion(new THREE.Quaternion())),parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());bone.quaternion.copy(parent.invert().multiply(target));bone.updateWorldMatrix(true,true)}
 rotate(b.leftUpperArm,new THREE.Vector3(0,0,1),-1.2);rotate(b.rightUpperArm,new THREE.Vector3(0,0,1),1.2);rotate(b.head,new THREE.Vector3(0,1,0),Math.sin(t*.6)*.08)
 actor.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update()})
}
function useFixture(kind='standard'){
 const f=createDetailedPoseFixture(),root=new THREE.Group();root.add(f.mesh);root.scale.setScalar(kind==='small'?.68:kind==='tall'?1.25:1)
 setActor({root,bones:f.bones,fixture:f,label:'自作骨格（'+kind+'）',dispose(){f.dispose()}})
}
async function loadVRM(file){
 const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(/^(data:|blob:)/.test(url))return url;throw Error('Embedded local VRM assets only')})
 const loader=new GLTFLoader(manager);loader.register(p=>new VRMLoaderPlugin(p))
 const gltf=await loader.parseAsync(await file.arrayBuffer(),''),vrm=gltf.userData.vrm
 if(!vrm?.humanoid)throw Error('No VRM humanoid')
 VRMUtils.rotateVRM0(vrm);vrm.update(0)
 const bones=Object.fromEntries(roles.map(r=>[r,vrm.humanoid.getRawBoneNode(r)]).filter(([,b])=>b))
 setActor({root:vrm.scene,bones,vrm,label:file.name,dispose(){disposeObject(vrm.scene)}})
}

// --- guides ----------------------------------------------------------------
const guides=new THREE.Group();scene.add(guides)
const dot=(color,r=.018)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,16,10),new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.9}));m.renderOrder=10;guides.add(m);return m}
const targetDots={left:dot('#1f8a5b'),right:dot('#d0752c')},comDot=dot('#c0392b',.024)
const ball=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),new THREE.MeshStandardMaterial({color:'#8fe8ff',emissive:'#3ab8ff',emissiveIntensity:1.4,transparent:true,opacity:.55,depthWrite:false}));scene.add(ball)
const supportLine=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:16},()=>new THREE.Vector3())),new THREE.LineBasicMaterial({color:'#c0392b'}));guides.add(supportLine)
const comLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#c0392b'}));guides.add(comLine)
const colliderLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#6b4fa0',transparent:true,opacity:.6}));scene.add(colliderLines)
const onion=new THREE.Group();scene.add(onion)
const ONION_COLORS={ready:'#7f8c8d',join:'#16a085',gather:'#2b7bb9',charge:'#6c3fb5',thrust:'#d35400',follow:'#c0392b'}
const SEGMENTS=[['hips','spine'],['spine','chest'],['chest','neck'],['neck','head'],...['left','right'].flatMap(s=>[[s+'UpperArm',s+'LowerArm'],[s+'LowerArm',s+'Hand'],[s+'UpperLeg',s+'LowerLeg'],[s+'LowerLeg',s+'Foot'],['chest',s+'UpperArm'],['hips',s+'UpperLeg']])]
function skeletonLines(){const b=rig.bones,pts=[];for(const [a,z] of SEGMENTS){const A=b[a]??(a==='chest'?info.torso.at(-1):null),Z=b[z]??(z==='chest'?info.torso.at(-1):null);if(!A||!Z)continue;pts.push(A.getWorldPosition(new THREE.Vector3()),Z.getWorldPosition(new THREE.Vector3()))}return pts}
function buildOnion(){
 onion.clear();if(!rig)return
 for(const name of Object.keys(clip.keys)){
  hostIdle(0);const snap=captureBones(rig.skeleton)
  try{applyAuthoredPose(rig,sampleKey(clip,info,name),{heading:0,state:{}})}catch(e){console.warn(e)}
  const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(skeletonLines()),new THREE.LineBasicMaterial({color:ONION_COLORS[name]??'#555',transparent:true,opacity:.55}));line.userData.key=name;onion.add(line)
  restoreBones(snap);rig.skeleton.update()
 }
}
function updateGuides(r){
 const on=S.guides&&r
 for(const s of ['left','right']){const t=r?.handTargets?.[s];targetDots[s].visible=!!(on&&t?.point);if(t?.point)targetDots[s].position.fromArray(t.point)}
 const tl=r?.handTargets?.left?.point,tr=r?.handTargets?.right?.point
 const clam=lastFrame&&/gather|charge/.test(lastFrame.phase)
 ball.visible=!!(tl&&tr&&(clam||S.staticKey==='gather'||S.staticKey==='charge'))
 if(ball.visible){const a=new THREE.Vector3().fromArray(tl),c=new THREE.Vector3().fromArray(tr);ball.position.copy(a).add(c).multiplyScalar(.5);ball.scale.setScalar(Math.max(.02,a.distanceTo(c)*.5-.006))}
 comDot.visible=supportLine.visible=comLine.visible=!!(S.balance&&r)
 if(r&&S.balance){
  const g=r.supportPolygon,pos=supportLine.geometry.attributes.position,gy=r.groundY
  for(let i=0;i<pos.count&&g.length;i++){const p=g[Math.min(i,g.length-1)];pos.setXYZ(i,p[0],gy+.002,p[2])}
  pos.needsUpdate=true;supportLine.geometry.setDrawRange(0,g.length)
  comDot.position.set(r.com[0],gy+.004,r.com[2]);comDot.material.color.set(r.comMarginMm==null||r.comMarginMm<20?'#ff00aa':'#c0392b')
  const l=comLine.geometry.attributes.position;l.setXYZ(0,...r.com);l.setXYZ(1,r.com[0],gy,r.com[2]);l.needsUpdate=true
 }
 colliderLines.visible=S.colliders&&!!rig
 if(colliderLines.visible){
  const pts=[]
  for(const c of buildColliders(rig,info,r?.scale??1))for(const t of [0,.5,1]){const center=c.start.clone().addScaledVector(c.axis,c.length*t);for(let i=0;i<24;i++){for(const j of [i,i+1]){const a=j/24*Math.PI*2,x=Math.cos(a),z=Math.sin(a),rr=1/Math.sqrt((x/c.a)**2+(z/(z>=0?c.front_r:c.back_r))**2);pts.push(center.clone().addScaledVector(c.lateral,x*rr).addScaledVector(c.front,z*rr))}}}
  colliderLines.geometry.setFromPoints(pts)
 }
 onion.visible=S.onion
}

// --- panel -----------------------------------------------------------------
panel.innerHTML=`<p class="eyebrow">XRIFT / POSE STUDIO</p><h1>${clip.title}</h1>
<section><label>体<select id="model"><option value="standard">自作骨格・標準</option><option value="small">自作骨格・小型 0.68倍</option><option value="tall">自作骨格・大型 1.25倍</option></select></label>
<label>骨の読み取り<select id="read"><option value="host">XRiftと同じ（ボーン名→骨格の形）</option><option value="vrm">VRMの人型定義</option></select></label>
<label class="file">手元のVRM（複数可・外部送信なし）<input id="vrm" type="file" accept=".vrm" multiple></label><label id="vrmPick" hidden>VRMを切り替える<select id="vrmList"></select></label><p id="rigInfo" class="note"></p></section>
<section><div class="row"><button id="play">⏸ 一時停止</button><select id="speed"><option value="1">1倍</option><option value=".5">0.5倍</option><option value=".25">0.25倍</option><option value=".1">0.1倍</option></select><button id="step">1コマ</button></div>
<input id="time" type="range" min="0" max="1" step=".001" value="0"><div id="marks" class="marks"></div><p id="clock" class="clock"></p>
<div class="row"><label>溜める秒<input id="holdFor" type="number" min=".2" max="6" step=".1" value="2.6"></label><label>ビーム秒<input id="beamFor" type="number" min=".2" max="4" step=".1" value="1"></label></div>
<div class="row"><button id="press" class="ghost">押す（溜め）</button><button id="release" class="ghost">離す（放つ）</button></div></section>
<section><label>キー<select id="keyName"></select></label><label><input id="showKey" type="checkbox"> このキーで止める</label>
<textarea id="keyJson" rows="16" spellcheck="false"></textarea><p id="keyError" class="error"></p><div class="row"><button id="copyClip" class="ghost">クリップJSONをコピー</button><button id="resetClip" class="ghost">元に戻す</button></div></section>
<section><div class="toggles"><label><input id="tGuides" type="checkbox" checked> 手の目標・気の玉</label><label><input id="tBalance" type="checkbox" checked> 重心・支持</label><label><input id="tColliders" type="checkbox"> 胴・腿の当たり</label><label><input id="tOnion" type="checkbox" checked> キーの残像</label></div></section>
<section><h2>このフレーム</h2><table id="now" class="metrics"></table></section>
<section><h2>動き全体の検査</h2><button id="evaluate">全フレームを検査</button><p id="score" class="note"></p><table id="verdicts" class="metrics"></table><canvas id="graph" width="340" height="120"></canvas><select id="graphKey"></select></section>`
const $=id=>document.getElementById(id)
const keySelect=$('keyName');for(const name of Object.keys(clip.keys))keySelect.add(new Option(name,name));keySelect.value=S.key
function showKeyJson(){$('keyJson').value=JSON.stringify(clip.keys[S.key],null,1)}
showKeyJson()
keySelect.onchange=()=>{S.key=keySelect.value;showKeyJson();if($('showKey').checked)S.staticKey=S.key}
$('showKey').onchange=e=>{S.staticKey=e.target.checked?S.key:null}
let editTimer=0
$('keyJson').oninput=()=>{clearTimeout(editTimer);editTimer=setTimeout(()=>{try{clip.keys[S.key]=JSON.parse($('keyJson').value);invalidate();$('keyError').textContent=''}catch(e){$('keyError').textContent=String(e.message)}},250)}
function invalidate(){clip={...clip};state={};buildOnion()}
$('copyClip').onclick=()=>navigator.clipboard?.writeText(JSON.stringify(clip,null,2))
$('resetClip').onclick=()=>{clip=structuredClone(baseClip);showKeyJson();invalidate()}
$('play').onclick=()=>{S.playing=!S.playing;$('play').textContent=S.playing?'⏸ 一時停止':'▶ 再生'}
$('speed').onchange=e=>S.speed=Number(e.target.value)
$('step').onclick=()=>{S.playing=false;$('play').textContent='▶ 再生';S.time=Math.min(total(),S.time+1/60)}
$('time').oninput=e=>{S.time=Number(e.target.value)*total();S.manual=null}
$('holdFor').onchange=e=>{S.holdFor=Number(e.target.value)||2.6;drawMarks()}
$('beamFor').onchange=e=>{S.beamFor=Number(e.target.value)||1;drawMarks()}
$('press').onclick=()=>{S.manual={pressedAt:performance.now()/1000,releasedAt:null};S.staticKey=null;$('showKey').checked=false}
$('release').onclick=()=>{if(S.manual&&S.manual.releasedAt==null)S.manual.releasedAt=performance.now()/1000}
for(const [id,key] of [['tGuides','guides'],['tBalance','balance'],['tColliders','colliders'],['tOnion','onion']])$(id).onchange=e=>S[key]=e.target.checked
$('model').onchange=e=>useFixture(e.target.value)
let vrmFiles=[]
async function pickVRM(i){try{$('rigInfo').textContent='読み込み中…';await loadVRM(vrmFiles[i])}catch(e){$('rigInfo').textContent=String(e)}}
$('vrm').onchange=async e=>{vrmFiles=[...e.target.files];$('vrmList').replaceChildren(...vrmFiles.map((f,i)=>new Option(f.name,i)));$('vrmPick').hidden=vrmFiles.length<2;await pickVRM(0)}
$('vrmList').onchange=e=>pickVRM(Number(e.target.value))
$('read').value=S.read
$('read').onchange=e=>{S.read=e.target.value;if(actor){bindRig();buildOnion();describeRig()}}
function drawMarks(){const T=total(),marks=[['押す',0],['溜め完了',clip.action.enter.duration+clip.action.hold.duration],['離す',S.holdFor],['ビーム終',S.holdFor+clip.action.release[0].duration+S.beamFor]];$('marks').innerHTML=marks.map(([l,t])=>`<span style="left:${Math.min(100,t/T*100)}%">${l}</span>`).join('')}
drawMarks()
function describeRig(){
 const h=info.hands,fingers=s=>h[s].fingers.map(f=>f.name[0].toUpperCase()).join('')||'なし'
 const r=actor.read,how={names:'ボーン名',structure:'骨格の形','names+structure':'ボーン名＋骨格の形'}[r?.method]??r?.method
 const xrift=!r?'':r.status==='ready'?`XRiftでの読み取り：${how}${r.dialect?`（${r.dialect}）`:''}で読める`:`XRiftでの読み取り：読めない（${r.reason??r.status}）→ 本番では構えが出ません`
 const used=r?.used==='vrm'?'・この画面はVRMの人型定義で表示':''
 $('rigInfo').textContent=`${actor.label}：胴の鎖 ${info.torso.length} 骨・鎖骨 ${Object.values(info.shoulders).filter(Boolean).length}・指 左${fingers('left')}/右${fingers('right')}・つま先 ${Object.values(info.toes).filter(Boolean).length}・皮膚の断面 ${Object.values(info.radii).filter(r=>r.source==='skin').length}/${Object.keys(info.radii).length}。${xrift}${used}${r?.mismatch?.length?`・VRM定義との違い ${r.mismatch.join(' / ')}`:''}`
 $('rigInfo').classList.toggle('error',!!r&&r.status!=='ready')
}
const NOW=[['pelvisHeightM','骨盤の高さ m',null],['comMarginMm','重心の余裕 mm','comMarginMm','min'],['neckTwistDeg','首のひねり°','neckTwistDeg','abs'],['leftWristFlexDeg','左手首 屈(+)/伸(-)°','wristExtensionDeg','ext'],['rightWristFlexDeg','右手首 屈/伸°','wristExtensionDeg','ext'],['leftPronationDeg','左前腕 回内(+)/回外(-)°','pronationDeg','abs'],['rightPronationDeg','右前腕 回内/回外°','pronationDeg','abs'],['leftWristDeviationDeg','左手首 橈屈(+)/尺屈(-)°','wristDeviationDeg','abs'],['rightWristDeviationDeg','右手首 橈/尺°','wristDeviationDeg','abs'],['leftSkinClearanceMm','左腕と胴の隙間 mm','skinClearanceMm','min'],['rightSkinClearanceMm','右腕と胴の隙間 mm','skinClearanceMm','min'],['leftReachErrorMm','左手の未達 mm','handReachErrorMm','max'],['rightReachErrorMm','右手の未達 mm','handReachErrorMm','max'],['leftKneeFlexDeg','左膝°','kneeFlexDeg','max'],['rightKneeFlexDeg','右膝°','kneeFlexDeg','max'],['rightAnkleDorsiflexionDeg','右足首 背屈°','ankleDorsiflexionDeg','max']]
function statusOf(value,limitKey,kind){const limit={...DEFAULT_THRESHOLDS,...clip.quality}[limitKey];if(!Number.isFinite(value)||limit==null)return '';if(kind==='min')return value>=limit?'ok':'bad';if(kind==='abs')return Math.abs(value)<=limit?'ok':'bad';if(kind==='ext')return -value<=limit?'ok':'bad';return value<=limit?'ok':'bad'}
function showNow(r,frame){
 const c=frameChannels(r)
 $('now').innerHTML=`<tr><th>相</th><td>${frame.phase} / 重み ${frame.weight.toFixed(2)}</td></tr>`+NOW.map(([k,label,limit,kind])=>`<tr class="${statusOf(c[k],limit,kind)}"><th>${label}</th><td>${Number.isFinite(c[k])?c[k].toFixed(k.endsWith('M')?3:1):'-'}</td></tr>`).join('')
}
let evaluation=null
$('evaluate').onclick=()=>{
 if(!rig)return
 const t0=performance.now()
 evaluation=evaluateAction(rig,clip,{holdFor:S.holdFor,beamFor:S.beamFor,hostPose:hostIdle})
 $('score').textContent=`合格 ${evaluation.score}・${evaluation.frames.length}フレーム・${(performance.now()-t0).toFixed(0)}ms・最大の関節速度 ${evaluation.maxSpeed.value.toFixed(0)}°/s（${evaluation.maxSpeed.bone}）`
 $('verdicts').innerHTML=evaluation.verdicts.map(v=>`<tr class="${v.status==='pass'?'ok':v.status==='warn'?'warn':v.status==='fail'?'bad':''}"><th>${v.metric}</th><td>${v.value==null?'-':v.value.toFixed(1)}</td><td>${v.limit??''}</td><td>${v.at==null?'':v.at.toFixed(2)+'s'}</td></tr>`).join('')
 const keys=Object.keys(evaluation.frames.find(f=>Object.keys(f.channels).length>10)?.channels??{})
 $('graphKey').replaceChildren(...keys.map(k=>new Option(k,k)));$('graphKey').value=keys.includes('leftWristFlexDeg')?'leftWristFlexDeg':keys[0];drawGraph()
 window.__studioEvaluation=evaluation
}
$('graphKey').onchange=()=>drawGraph()
function drawGraph(){
 const g=$('graph').getContext('2d'),key=$('graphKey').value;g.clearRect(0,0,340,120);if(!evaluation)return
 const pts=evaluation.frames.map(f=>[f.t,f.channels[key]]).filter(([,v])=>Number.isFinite(v));if(!pts.length)return
 const lo=Math.min(...pts.map(p=>p[1])),hi=Math.max(...pts.map(p=>p[1])),T=evaluation.total
 g.strokeStyle='#c8d2c8';g.beginPath();g.moveTo(0,110);g.lineTo(340,110);g.stroke()
 g.strokeStyle='#2e705b';g.lineWidth=1.5;g.beginPath();pts.forEach(([t,v],i)=>{const x=t/T*340,y=110-(v-lo)/Math.max(1e-6,hi-lo)*100;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()
 g.fillStyle='#183e36';g.font='11px system-ui';g.fillText(`${key}  ${lo.toFixed(1)} … ${hi.toFixed(1)}`,4,12)
 const x=S.time/T*340;g.strokeStyle='#d35400';g.beginPath();g.moveTo(x,0);g.lineTo(x,120);g.stroke()
}

// --- frame loop -------------------------------------------------------------
function currentClock(){
 if(S.manual){const now=performance.now()/1000,held=(S.manual.releasedAt??now)-S.manual.pressedAt;return S.manual.releasedAt==null?{heldFor:held,releasedFor:null,charge:Math.min(1,held/(clip.action.enter.duration+clip.action.hold.duration))}:{heldFor:held,releasedFor:now-S.manual.releasedAt,charge:Math.min(1,held/(clip.action.enter.duration+clip.action.hold.duration)),beamFor:S.beamFor}}
 return S.time<S.holdFor?{heldFor:S.time,releasedFor:null,charge:S.charge}:{heldFor:S.holdFor,releasedFor:S.time-S.holdFor,charge:S.charge,beamFor:S.beamFor}
}
let last=performance.now(),snapshot=null
function layout(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);renderer.domElement.style.width=w+'px';renderer.domElement.style.height=h+'px';return [w,h]}
function render(){
 const [w,h]=layout(),hw=Math.floor(w/2),hh=Math.floor(h/2)
 const rects=[[0,hh,hw,h-hh],[hw,hh,w-hw,h-hh],[0,0,hw,hh],[hw,0,w-hw,hh]]
 views.forEach((v,i)=>{
  const [x,y,vw,vh]=rects[i],cam=v.camera,aspect=vw/vh,size=S.focus.size
  if(cam.isOrthographicCamera){cam.left=-size*aspect;cam.right=size*aspect;cam.top=size;cam.bottom=-size;const c=S.focus.center;if(cam.name==='front'){cam.position.set(c.x,c.y,c.z+6);cam.lookAt(c)}else if(cam.name==='side'){cam.position.set(c.x-6,c.y,c.z);cam.lookAt(c)}else{cam.position.set(c.x,8,c.z+.001);cam.lookAt(c.x,0,c.z)}cam.updateProjectionMatrix()}
  else{cam.aspect=aspect;cam.updateProjectionMatrix()}
  renderer.setViewport(x,y,vw,vh);renderer.setScissor(x,y,vw,vh);renderer.render(scene,cam)
 })
}
function frame(now){
 const dt=Math.min(.05,(now-last)/1000);last=now
 if(S.playing&&!S.manual&&!S.staticKey){S.time+=dt*S.speed;if(S.time>total())S.time=0}
 $('time').value=String(S.time/total())
 orbit.update()
 if(rig){
  hostIdle(now/1000)
  snapshot=captureBones(rig.skeleton)
  try{
   lastFrame=S.staticKey?sampleKey(clip,info,S.staticKey):sampleAction(clip,info,currentClock())
   result=applyAuthoredPose(rig,lastFrame,{heading:0,state})
   showNowThrottled(result,lastFrame)
  }catch(e){console.error(e);$('keyError').textContent=String(e.message)}
  updateGuides(result)
 }
 const c=currentClock();$('clock').textContent=S.staticKey?`キー「${S.staticKey}」を静止表示`:`${S.manual?'手動':'再生'}  押してから ${c.heldFor.toFixed(2)}s ${c.releasedFor==null?'溜め中':'・離してから '+c.releasedFor.toFixed(2)+'s'}  相 ${lastFrame?.phase??'-'}`
 render()
 if(rig&&snapshot){restoreBones(snapshot);rig.skeleton.update()}
 if(evaluation)drawGraph()
 requestAnimationFrame(frame)
}
let nowTimer=0
function showNowThrottled(r,f){const t=performance.now();if(t-nowTimer<120)return;nowTimer=t;showNow(r,f)}
useFixture('standard')
requestAnimationFrame(frame)

// Automation hooks for captures and experiments (local only).
window.__studio={
 get result(){return result},get frame(){return lastFrame},get clip(){return clip},
 /** The bound body and its measured anatomy (diagnostics: scripts/arm-anatomy.mjs). */
 get rig(){return rig},get rigInfo(){return info},
 /** Pose the body at a key and leave the bones posed until the next frame (measure in the same task). */
 applyKey(name,probeState={}){hostIdle(performance.now()/1000);return applyAuthoredPose(rig,sampleKey(clip,info,name),{heading:0,state:probeState})},
 setTime(t){S.time=t;S.manual=null;S.staticKey=null},setStatic(name){S.staticKey=name},pause(){S.playing=false},play(){S.playing=true},
 setClip(next){clip=structuredClone(next);invalidate();showKeyJson()},setKey(name,key){clip.keys[name]=key;invalidate();if(S.key===name)showKeyJson()},
 setOverlay(o){Object.assign(S,o)},evaluate(opts={}){const e=evaluateAction(rig,clip,{holdFor:S.holdFor,beamFor:S.beamFor,hostPose:hostIdle,...opts});return {score:e.score,verdicts:e.verdicts,maxSpeed:e.maxSpeed,maxJump:e.maxJump,frames:e.frames.length}},
 /** Every elbow candidate the arm solver scored for one key (diagnostics). */
 traceKey(name,side,withPlan=true){hostIdle(performance.now()/1000);const trace={left:[],right:[]},f=sampleKey(clip,info,name);applyAuthoredPose(rig,withPlan?f:{...f,armPlan:undefined},{heading:0,state:{},traceArms:trace});return trace[side].map(t=>({phi:t.phi*180/Math.PI,cost:t.cost,pron:t.r.pron0*180/Math.PI,hum:t.r.humeral,flex:t.r.flex*180/Math.PI,dev:t.r.dev*180/Math.PI,elbowFlex:t.r.elbowFlex*180/Math.PI,o:t.r.o.toArray(),clearMm:t.clearance?t.clearance.distance*1000:null,clearKey:t.clearance?.key??null}))},
 /** Per-frame channels of a full evaluation between t0 and t1 (diagnostics). */
 framesBetween(t0,t1,opts={}){const e=evaluateAction(rig,clip,{holdFor:S.holdFor,beamFor:S.beamFor,hostPose:hostIdle,...opts});return e.frames.filter(f=>f.t>=t0&&f.t<=t1)},
 /** Joint-space plan per key (forearm roll, elbow swivel, wrist) on the current body, in degrees. */
 plan:()=>Object.fromEntries(Object.entries(resolvedKeys(clip,info)).map(([k,v])=>[k,Object.fromEntries(Object.entries(v.armPlan??{}).map(([s,p])=>[s,{pronation:+(p.pronation/Math.PI*180).toFixed(1),swivel:+(p.swivel/Math.PI*180).toFixed(1),flex:+(p.flex/Math.PI*180).toFixed(1),dev:+(p.dev/Math.PI*180).toFixed(1)}]))])),
 setRead(mode){S.read=mode==='vrm'?'vrm':'host';$('read').value=S.read;if(actor){bindRig();buildOnion();describeRig()}},
 info:()=>({label:actor?.label,read:actor?.read,torso:info.torso.map(b=>b.name),fingers:Object.fromEntries(['left','right'].map(s=>[s,info.hands[s].fingers.map(f=>f.name+':'+f.bones[0].name)])),radii:Object.fromEntries(Object.entries(info.radii).map(([k,r])=>[k,{lateral:r.lateral,front:r.front,back:r.back,source:r.source}])),hipHeight:info.hipHeight,legLength:info.legLength,palm:info.hands.left.palmLength}),
}
