import {createStage,commonControls,bindActorControls,value,showMetrics} from './common.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {attachPoseDriver,prepareHumanoidRig,inspectHumanoidRigs,prepareRig} from '../src/index.mjs'
import {measureSkinDiagnostics} from './skin-diagnostics.mjs'
import {createRideDynamics,stepRideDynamics} from '../src/ride-dynamics.mjs'
import {N02_NORMAL_FLIGHT_PROFILE as n02Profile,createN02RideOptions,sampleN02FlightSequence} from '../src/n02-profile.mjs'
commonControls('N02 / U02 姿勢実験','筋斗雲のサーフ姿勢と肩車を比較。既定は自作骨格。ローカルVRMは乗る側だけに読み込めます。')
document.querySelector('#specific').innerHTML=`
<label>姿勢<select id="preset"><option value="nimbus" selected>N02 筋斗雲・サーフ姿勢</option><option value="shoulder">U02 ユーザーの肩車</option><option value="native">元の座り姿勢</option><option value="upright">直立</option><option value="hover">直立ホバリング</option><option value="board">旧ボード姿勢</option><option value="glider">伏せるグライダー</option></select></label>
<div id="nimbusControls"><label>足幅<input id="stanceWidth" type="range" min=".6" max="1.4" step=".02" value="${n02Profile.pose.stanceWidth}"></label><label>しゃがみ<input id="crouch" type="range" min="0" max="1" step=".01" value="${n02Profile.pose.crouch}"></label>
<label>姿勢の基準<select id="nimbusAnchorMode"><option value="support">足場へ踏ん張る（観察用）</option><option value="head">頭位置を保つ（比較用）</option></select></label>
<label><input id="cloudTilt" type="checkbox" checked> 上昇・下降・旋回で雲を傾ける（切替時は初期化）</label>
<button id="driveTiltSequence" type="button">上昇→左右旋回→下降→停止を試す</button>
<div class="vertical-buttons"><button id="driveUp" type="button">上昇</button><button id="driveDown" type="button">下降</button><button id="driveBrake" type="button">全方向を制動</button><button id="driveVerticalSequence" type="button">上昇→制動→下降→制動を試す</button></div>
<p class="note">ボタンを押すと推力が続きます。「全方向を制動」で減速して空中停止。左右と上下は組み合わせられます。</p>
<div class="drive-buttons"><button id="driveForward" type="button">前進</button><button id="driveLeft" type="button">左へ</button><button id="driveRight" type="button">右へ</button><button id="driveCoast" type="button">惰性</button><button id="driveReset" type="button">停止・戻す</button><button id="driveSequence" type="button">発進→旋回→制動を試す</button></div>
<label><input id="drivePause" type="checkbox"> 動きを一時停止して観察</label><label><input id="followRide" type="checkbox" checked> 観察視点を移動へ追従</label><label><input id="showBalance" type="checkbox"> 重心・荷重の目安を表示</label>
<p id="driveSummary" class="note" aria-live="polite"></p></div>
<div id="shoulderControls" hidden><label>肩車の合わせ方<select id="anchorMode"><option value="support">肩へ腰を合わせる（頭は移動）</option><option value="head">頭の位置を保つ（肩からずれる）</option></select></label><label>運ぶ側の体格<input id="carrierScale" type="range" min=".65" max="1.35" step=".05" value="1"></label><label><input id="carrierMotion" type="checkbox"> 運ぶ側を動かす（移動・旋回の模擬）</label></div>
<label><input id="hands" type="checkbox"> 手の追跡位置を保つ（模擬）</label>
<label><input id="motion" type="checkbox"> 旧ボード・ホバリングの揺れ比較</label>
<label>身体の向き<input id="heading" type="range" min="-3.14" max="3.14" step=".01" value="0"></label>
<label>観察方向<select id="view"><option value="orbit">斜め</option><option value="front">進行方向から</option><option value="side">横から</option><option value="back">後ろから</option></select></label>
<button id="resetPose" type="button">調整を初期値へ</button><p id="poseSummary" class="note" aria-live="polite"></p>
<p class="note">N02は傾く雲へ足裏・胸・腰・脚を合わせる実験です。頭の世界向きを保ち、支持優先では頭位置が動きます。荷重は単純化した推定です。実VRカメラは未接続です。</p>`
document.querySelector('details').open=false
const stage=createStage(createPoseFixture),{THREE}=stage,vehicle=new THREE.Group(),carrierRoot=new THREE.Group()
stage.scene.add(vehicle,carrierRoot)
const carrier=createPoseFixture();carrierRoot.add(carrier.mesh)
carrier.mesh.material.vertexColors=false;carrier.mesh.material.color.set('#cf854c')
const carrierRig=prepareHumanoidRig({mesh:carrier.mesh,bones:carrier.bones})
let options={},bridge=null,carrierDriver=null,currentActor=null,lastPreset='',frameView=true,lastView='',carrierHeading=0,motionTime=0,skinDiagnostics=null,measureNext=true,lastMeasureKey='',supportOffset=null,fitAfterMeasure=true
let rideState=createRideDynamics(),driveCommand={throttle:0,steer:0,lift:0,brake:0},drivePhase='idle',sequenceTime=0,sequenceSegment='',anchorsLocal=null,supportOriginLocal=new THREE.Vector3(),supportOriginWorldBase=new THREE.Vector3(),anchorGeneration=0,lastHeadingValue=0,calibratedSupportOffset=null,rideScale=1,lastRidePosition=new THREE.Vector3()
const flightReadout=document.createElement('div');flightReadout.className='flight-readout';flightReadout.setAttribute('aria-live','off');document.querySelector('#viewport').append(flightReadout)
const tiltEnabled=()=>document.querySelector('#cloudTilt').checked
const platformQuaternion=()=>rideState.supportQuaternion?new THREE.Quaternion().fromArray(rideState.supportQuaternion):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rideState.heading)
const platformPoint=(point)=>{
 const p=new THREE.Vector3().fromArray(point),position=new THREE.Vector3().fromArray(rideState.position)
 return tiltEnabled()?p.sub(supportOriginLocal).applyQuaternion(platformQuaternion()).add(supportOriginWorldBase).add(position):p.applyAxisAngle(new THREE.Vector3(0,1,0),rideState.heading).add(position)
}
const supportFrame=()=>({position:(tiltEnabled()?supportOriginWorldBase.clone().add(new THREE.Vector3().fromArray(rideState.position)):platformPoint(supportOriginLocal.toArray())).toArray(),quaternion:platformQuaternion().toArray()})
function resetRide(){
 const actor=stage.actor
 const length=s=>{const b=actor.bones;return b[s+'UpperLeg'].getWorldPosition(new THREE.Vector3()).distanceTo(b[s+'LowerLeg'].getWorldPosition(new THREE.Vector3()))+b[s+'LowerLeg'].getWorldPosition(new THREE.Vector3()).distanceTo(b[s+'Foot'].getWorldPosition(new THREE.Vector3()))}
 rideScale=(length('left')+length('right'))/2/n02Profile.calibration.referenceLegLengthM
 rideState=createRideDynamics(createN02RideOptions({rideScale,attitudeEnabled:tiltEnabled(),initialHeading:value('heading')}))
 driveCommand={throttle:0,steer:0,lift:0,brake:0};drivePhase='idle';sequenceTime=0;sequenceSegment='';anchorsLocal=null;supportOriginLocal.set(0,0,0);supportOriginWorldBase.set(0,0,0);anchorGeneration++;calibratedSupportOffset=null;lastRidePosition.set(0,0,0);measureNext=true;fitAfterMeasure=true
}
function command(phase,input){drivePhase=phase;sequenceSegment='';driveCommand={throttle:0,steer:0,lift:0,brake:0,...input};document.querySelector('#drivePause').checked=false}
document.querySelector('#driveUp').onclick=()=>command('ascending',{...driveCommand,lift:1,brake:0})
document.querySelector('#driveDown').onclick=()=>command('descending',{...driveCommand,lift:-1,brake:0})
document.querySelector('#driveForward').onclick=()=>command('accelerating',{throttle:1,steer:0,lift:driveCommand.lift,brake:0})
document.querySelector('#driveLeft').onclick=()=>command('turning-left',{throttle:.35,steer:-.75,lift:driveCommand.lift,brake:0})
document.querySelector('#driveRight').onclick=()=>command('turning-right',{throttle:.35,steer:.75,lift:driveCommand.lift,brake:0})
document.querySelector('#driveCoast').onclick=()=>command('coasting',{throttle:0,steer:0,brake:0})
document.querySelector('#driveBrake').onclick=()=>command('braking',{throttle:0,steer:0,brake:1})
document.querySelector('#driveReset').onclick=()=>{resetRide();frameView=true;document.querySelector('#drivePause').checked=false}
document.querySelector('#driveSequence').onclick=()=>{resetRide();command('sequence',{throttle:1,steer:0,brake:0})}
document.querySelector('#driveVerticalSequence').onclick=()=>{resetRide();command('vertical-sequence',{})}
document.querySelector('#driveTiltSequence').onclick=()=>{resetRide();command('tilt-sequence',{})}
document.querySelector('#cloudTilt').onchange=()=>{resetRide();frameView=true}
document.querySelector('#stanceWidth').oninput=()=>{resetRide();frameView=true}
// Runs after the scene is drawn but BEFORE the pose manager restores bones.
// Sampling is requested by changed controls or a new model, not every frame.
const previousAfterRender=stage.scene.onAfterRender
stage.scene.onAfterRender=function(...args){
 previousAfterRender.call(this,...args)
 if(!measureNext||!currentActor||!bridge||bridge.error)return
 skinDiagnostics=measureSkinDiagnostics(currentActor,{supportFrame:options.preset==='nimbus'&&anchorsLocal?supportFrame():undefined});measureNext=false
 const offsets=skinDiagnostics.feet.map(f=>f.soleOffsetNormalM??f.soleOffsetM).filter(Number.isFinite)
 supportOffset=offsets.length?Math.max(...offsets):null
 if(options.preset==='nimbus'&&!anchorsLocal&&bridge.last?.footTargetsWorld){
  anchorsLocal=bridge.last.footTargetsWorld.map(p=>new THREE.Vector3().fromArray(p).sub(new THREE.Vector3().fromArray(rideState.position)).applyAxisAngle(new THREE.Vector3(0,1,0),-rideState.heading).toArray())
  calibratedSupportOffset=supportOffset;fitAfterMeasure=true
  supportOriginLocal.fromArray(anchorsLocal[0]).add(new THREE.Vector3().fromArray(anchorsLocal[1])).multiplyScalar(.5);supportOriginLocal.y-=supportOffset??0
  supportOriginWorldBase.copy(supportOriginLocal).applyAxisAngle(new THREE.Vector3(0,1,0),rideState.heading)
  const comHeight=bridge.last.balanceProxy?bridge.last.balanceProxy.centerOfMassWorld[1]-bridge.last.supportHeight+(supportOffset??0):.9*rideScale
  const c=n02Profile.calibration
  rideState=createRideDynamics({...rideState.config,initialHeading:rideState.heading,comHeightM:Math.max(.15,comHeight),supportHalfLengthM:Math.max(c.minimumSupportHalfLengthM,Math.abs(anchorsLocal[0][2]-anchorsLocal[1][2])*.5+c.supportLengthPaddingPerScaleM*rideScale),supportHalfWidthM:Math.max(c.minimumSupportHalfWidthM,Math.abs(anchorsLocal[0][0]-anchorsLocal[1][0])*.5+c.supportWidthPaddingPerScaleM*rideScale)})
 }
 if(fitAfterMeasure){frameView=true;fitAfterMeasure=false}
 if(window.__avatarLab)window.__avatarLab.skinDiagnostics=skinDiagnostics
}
const carrierRest=carrier.skeleton.bones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}))
const anchors=()=>Object.fromEntries(['leftShoulder','rightShoulder','head'].map((key,i)=>[key,carrier.bones[['leftUpperArm','rightUpperArm','head'][i]].getWorldPosition(new THREE.Vector3())]))
function bind(actor){
 bridge?.dispose();carrierDriver?.dispose();bridge=null;carrierDriver=null;currentActor=actor;frameView=true;measureNext=true;fitAfterMeasure=true;skinDiagnostics=null;supportOffset=null;if(!actor)return
 resetRide()
 try{
  let chosen=inspectHumanoidRigs(actor.root).filter(r=>r.supported).sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length)[0]
  if(actor.vrm){const candidates=[];actor.root.traverse(o=>{if(o.isSkinnedMesh)candidates.push(o)});chosen=null;for(const mesh of candidates.sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length)){try{chosen=prepareHumanoidRig({mesh,bones:actor.bones});break}catch{}}}
  if(!chosen)throw Error('Required humanoid joints are not available in a skin palette')
  const rig=chosen.restWorld?chosen:prepareRig(chosen),related=[];actor.root.traverse(o=>{if(o.isSkinnedMesh&&!related.includes(o.skeleton))related.push(o.skeleton)})
  bridge=attachPoseDriver({scene:stage.scene,rig,relatedSkeletons:related,getOptions:()=>({...options,...(options.preset==='shoulder'?{carrierAnchors:anchors()}:{})})})
  // These fixture shoulder anchors are unchanged by upright posing. Apply the
  // passenger first, then solve carrier hands from THIS render's calf positions.
  carrierDriver=attachPoseDriver({scene:stage.scene,rig:carrierRig,getOptions:()=>({enabled:options.enabled&&options.preset==='shoulder',preset:'carrierSupport',heading:carrierHeading,shinTargets:bridge.last?.kneesWorld?Object.fromEntries(['left','right'].map((s,i)=>[s,new THREE.Vector3().fromArray(bridge.last.kneesWorld[i]).lerp(new THREE.Vector3().fromArray(bridge.last.feetWorld[i]),.55)])):undefined})})
  document.querySelector('#message').textContent='姿勢コア接続済み'
 }catch(e){document.querySelector('#message').textContent=String(e)}
}
bindActorControls(stage,bind);bind(stage.actor)
const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(0,.015,0),1,0x256f57,.16,.09);stage.scene.add(arrow)
const balanceMarkers=new THREE.Group();stage.scene.add(balanceMarkers)
for(const color of ['#78b149','#78b149','#ca663e'])balanceMarkers.add(new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),new THREE.MeshStandardMaterial({color})))
const altitudeGeometry=new THREE.BufferGeometry();altitudeGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(60),3))
const altitudeGuide=new THREE.LineSegments(altitudeGeometry,new THREE.LineBasicMaterial({color:'#85998d',transparent:true,opacity:.65}));altitudeGuide.frustumCulled=false;stage.scene.add(altitudeGuide)
function makeVehicle(preset){
 while(vehicle.children.length){const c=vehicle.children[0];vehicle.remove(c);c.geometry?.dispose();c.material?.dispose()}
 vehicle.scale.setScalar(1);vehicle.rotation.set(0,0,0)
 if(preset==='nimbus'){
  const support=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.028,40),new THREE.MeshStandardMaterial({color:'#f0d586',roughness:1}));support.scale.z=1.35;support.position.y=-.014;vehicle.add(support)
  for(const [x,z,r] of [[0,0,.48],[-.27,0,.34],[.27,0,.34],[0,-.38,.36],[0,.38,.36]]){
   const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,12),new THREE.MeshStandardMaterial({color:'#e6c778',roughness:1}));m.scale.y=.28;m.position.set(x,-r*.28-.028,z);vehicle.add(m)
  }
 }else if(!['shoulder','upright'].includes(preset)){
  const size=preset==='glider'?[1.5,.06,.9]:preset==='board'?[.8,.07,.28]:[.45,.08,.45]
  vehicle.add(new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color:preset==='glider'?'#c6a259':'#687d88'})))
 }
}
function setView(preset){
 const bounds=skinDiagnostics?.bounds
 const box=bounds?.min?new THREE.Box3(new THREE.Vector3().fromArray(bounds.min),new THREE.Vector3().fromArray(bounds.max)):new THREE.Box3().setFromObject(stage.actor.root)
 if(preset==='shoulder'){
  const s=carrierRoot.scale.y,p=carrierRoot.position
  box.union(new THREE.Box3(p.clone().add(new THREE.Vector3(-.8*s,0,-.65*s)),p.clone().add(new THREE.Vector3(.8*s,1.85*s,.65*s))))
 }else if(vehicle.children.length){vehicle.updateWorldMatrix(true,true);box.union(new THREE.Box3().setFromObject(vehicle))}
 const center=box.getCenter(new THREE.Vector3()),radius=Math.max(.25,box.getSize(new THREE.Vector3()).length()*.5),view=document.querySelector('#view').value
 const offset=view==='front'?[0,.1,2.2]:view==='side'?[2.2,.1,0]:view==='back'?[0,.1,-2.2]:[1.65,.6,2.2]
 const vertical=THREE.MathUtils.degToRad(stage.camera.fov*.5),halfAngle=Math.min(vertical,Math.atan(Math.tan(vertical)*stage.camera.aspect)),distance=radius/Math.sin(halfAngle)*1.14
 stage.orbit.target.copy(center);stage.camera.position.copy(center).add(new THREE.Vector3(...offset).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),preset==='nimbus'?rideState.heading:0).multiplyScalar(distance));stage.orbit.update()
}
document.querySelector('#resetPose').onclick=()=>{
 for(const [id,v] of Object.entries({stanceWidth:String(n02Profile.pose.stanceWidth),crouch:String(n02Profile.pose.crouch),carrierScale:'1',heading:'0',headYaw:'0',headPitch:'0',anchorMode:'support',nimbusAnchorMode:'support',view:'orbit'}))document.getElementById(id).value=v
 for(const id of ['hands','motion','carrierMotion'])document.getElementById(id).checked=false
 motionTime=0;frameView=true;resetRide();document.querySelector('#drivePause').checked=false
}
stage.setUpdate((t,dt,actor)=>{
 if(actor!==currentActor)bind(actor)
 const preset=document.querySelector('#preset').value,isShoulder=preset==='shoulder'
 if(preset!==lastPreset){makeVehicle(preset);lastPreset=preset;frameView=true;fitAfterMeasure=true;if(preset==='nimbus')resetRide()}
 if(preset==='nimbus'){
  if(value('heading')!==lastHeadingValue){lastHeadingValue=value('heading');resetRide();frameView=true}
  if(!document.querySelector('#drivePause').checked){
   if(drivePhase==='sequence'){
    sequenceTime+=dt
    driveCommand=sequenceTime<3?{throttle:1,steer:0,brake:0}:sequenceTime<5?{throttle:.25,steer:0,brake:0}:sequenceTime<7?{throttle:.35,steer:.65,brake:0}:sequenceTime<9?{throttle:.35,steer:-.65,brake:0}:sequenceTime<11?{throttle:0,steer:0,brake:1}:{throttle:0,steer:0,brake:0}
    if(sequenceTime>14)drivePhase='stopped'
   }
   if(drivePhase==='vertical-sequence'){
    sequenceTime+=dt
    if(sequenceTime<1){driveCommand={lift:0,brake:1};sequenceSegment='ホバー'}
    else if(sequenceTime<2.4){driveCommand={lift:1,brake:0};sequenceSegment='上昇加速・重くなる'}
    else if(sequenceTime<3.6){driveCommand={lift:0,brake:1};sequenceSegment='上昇を制動・軽くなる'}
    else if(sequenceTime<4.6){driveCommand={lift:0,brake:1};sequenceSegment='上空で停止'}
    else if(sequenceTime<6){driveCommand={lift:-1,brake:0};sequenceSegment='下降加速・軽くなる'}
    else if(sequenceTime<7.2){driveCommand={lift:0,brake:1};sequenceSegment='下降を制動・重くなる'}
    else {driveCommand={lift:0,brake:1};sequenceSegment='停止・構えが戻る'}
    if(sequenceTime>9){drivePhase='stopped';sequenceSegment=''}
   }
   if(drivePhase==='tilt-sequence'){
    sequenceTime+=dt
    const sample=sampleN02FlightSequence(sequenceTime);driveCommand=sample.controls;sequenceSegment=sample.label
    if(sample.done){drivePhase='stopped';sequenceSegment=''}
   }
   const observed=bridge?.last?.balanceProxy
   const observedComHeightM=observed?.comHeightM??(observed?observed.centerOfMassWorld[1]-observed.contactPlaneY:undefined)
   rideState=stepRideDynamics(rideState,{...driveCommand,observedComHeightM},dt)
  }
  const position=new THREE.Vector3().fromArray(rideState.position),delta=position.clone().sub(lastRidePosition)
  if(document.querySelector('#followRide').checked){stage.camera.position.add(delta);stage.orbit.target.add(delta)}
  lastRidePosition.copy(position)
  actor.root.position.copy(actor.base).add(position)
  actor.root.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rideState.heading).multiply(actor.baseQuaternion))
 }else{actor.root.position.copy(actor.base);actor.root.quaternion.copy(actor.baseQuaternion)}
 actor.animate(t,{seated:true,headYaw:value('headYaw'),headPitch:value('headPitch')})
 document.querySelector('#nimbusControls').hidden=preset!=='nimbus';document.querySelector('#shoulderControls').hidden=!isShoulder;carrierRoot.visible=isShoulder
 const moving=isShoulder&&document.querySelector('#carrierMotion').checked
 if(moving)motionTime+=dt
 carrierHeading=value('heading')+(moving?Math.sin(motionTime*.5)*.6:0)
 carrierRoot.rotation.y=carrierHeading
 carrierRoot.scale.setScalar(value('carrierScale'));carrierRoot.position.set(moving?Math.sin(motionTime*.7)*.35:0,0,moving?Math.cos(motionTime*.7)*.2:0)
 for(const {b,p,q,s}of carrierRest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s)}
 carrierRoot.updateWorldMatrix(true,true);carrier.skeleton.update()
 options={enabled:preset!=='native',preset:preset==='native'?'upright':preset,heading:preset==='nimbus'?rideState.heading:isShoulder?carrierHeading:value('heading'),preserveHands:document.querySelector('#hands').checked,stanceWidth:value('stanceWidth'),crouch:value('crouch'),anchorMode:document.querySelector('#anchorMode').value,...(document.querySelector('#motion').checked&&['hover','board'].includes(preset)?{pitch:Math.sin(t*.8)*.1,roll:Math.sin(t*.6)*.05}:{})}
 if(preset==='nimbus'){
  const p=rideState.pose
  options.anchorMode=document.querySelector('#nimbusAnchorMode').value
  options.maxKneeDegrees=n02Profile.pose.maxKneeDegrees
  options.supportSoleOffsetM=calibratedSupportOffset??0
  options.balance={leanForward:p.balanceLeanForward,leanSide:p.balanceLeanSide,crouch:Math.min(1,value('crouch')+p.crouch-.45),centerOfMassOffset:p.centerOfMassOffset,loadRatio:p.loadRatio,forwardAcceleration:p.tangentForwardAcceleration??p.forwardAcceleration,lateralAcceleration:p.tangentLateralAcceleration??p.lateralAcceleration,verticalAcceleration:p.verticalAcceleration,normalLoadRatio:p.normalLoadRatio,effectiveGravityMps2:p.effectiveGravityMps2,supportState:p.supportState,zmpValid:p.zmpValid,zmpInvalidReason:p.zmpInvalidReason,verticalCompression:p.verticalCompression}
  if(tiltEnabled()&&anchorsLocal)options.supportFrame=supportFrame()
  if(anchorsLocal)options.footTargetsWorld=anchorsLocal.map(p=>platformPoint(p).toArray())
 }
 const measureKey=[preset,stage.profile,options.heading.toFixed(1),options.stanceWidth,options.crouch,options.anchorMode,options.preserveHands,value('headYaw'),value('headPitch'),value('carrierScale'),document.querySelector('#drivePause').checked,(options.balance?.leanForward??0).toFixed(1),(options.balance?.leanSide??0).toFixed(1),(options.balance?.verticalCompression??0).toFixed(1),(rideState.attitude?.pitch??0).toFixed(1),(rideState.attitude?.roll??0).toFixed(1)].join('|')
 if(measureKey!==lastMeasureKey){measureNext=true;lastMeasureKey=measureKey}
 const metrics=bridge?.last
 if(preset==='nimbus'&&(anchorsLocal||metrics?.footTargetsWorld)){
  const feet=anchorsLocal?anchorsLocal.map(platformPoint):metrics.footTargetsWorld.map(p=>new THREE.Vector3().fromArray(p)),center=feet[0].clone().add(feet[1]).multiplyScalar(.5)
  if(anchorsLocal){vehicle.position.fromArray(supportFrame().position);vehicle.quaternion.copy(platformQuaternion())}
  else{vehicle.position.copy(center);vehicle.position.y-=calibratedSupportOffset??supportOffset??.0625*actor.root.scale.y;vehicle.rotation.y=rideState.heading}
  vehicle.scale.setScalar(rideScale)
 }else if(preset==='glider')vehicle.position.set(0,actor.bones.head.getWorldPosition(new THREE.Vector3()).y-.3*actor.root.scale.y,0)
 else if(preset==='native'){const s=skinDiagnostics?.legLengthM?skinDiagnostics.legLengthM/.79:actor.root.scale.y;vehicle.position.copy(actor.bones.hips.getWorldPosition(new THREE.Vector3()));vehicle.position.y-=.06*s;vehicle.scale.setScalar(s)}
 else vehicle.position.set(0,(metrics?.feetWorld?Math.min(...metrics.feetWorld.map(p=>p[1])):0)-.06,0)
 const supportNormal=new THREE.Vector3(0,1,0).applyQuaternion(platformQuaternion())
 if(preset==='nimbus'){arrow.position.copy(vehicle.position).addScaledVector(supportNormal,.015);arrow.setDirection(new THREE.Vector3(0,0,1).applyQuaternion(platformQuaternion()))}
 else{arrow.position.set(0,.015,0);arrow.setDirection(new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),options.heading))}
 altitudeGuide.visible=preset==='nimbus'&&!!anchorsLocal
 if(altitudeGuide.visible){
  const y=vehicle.position.y,x=vehicle.position.x+rideScale*.85,z=vehicle.position.z,points=[new THREE.Vector3(x,y-3,z),new THREE.Vector3(x,y+3,z)]
  const origin=anchorsLocal.reduce((s,p)=>s+p[1],0)/2-(calibratedSupportOffset??0)
  for(let i=Math.ceil(y-origin-3);i<=Math.floor(y-origin+3);i++)points.push(new THREE.Vector3(x-.08*rideScale,origin+i,z),new THREE.Vector3(x+.08*rideScale,origin+i,z))
  altitudeGuide.geometry.setFromPoints(points);altitudeGuide.geometry.setDrawRange(0,points.length)
 }
 balanceMarkers.visible=preset==='nimbus'&&document.querySelector('#showBalance').checked&&!!anchorsLocal
 if(balanceMarkers.visible){
  const front=anchorsLocal[0][2]>anchorsLocal[1][2]?0:1
  const loads=rideState.pose.zmpValid&&metrics?.balanceProxy?.zmpValid!==false?(metrics?.balanceProxy?.loadRatio??rideState.pose.loadRatio):null
  anchorsLocal.forEach((p,i)=>{const m=balanceMarkers.children[i];m.visible=!!loads;m.position.copy(platformPoint(p)).addScaledVector(supportNormal,-(calibratedSupportOffset??0)+.02);m.scale.setScalar(.7+(loads?(i===front?loads.front:loads.rear)*2:0))})
  const zmp=rideState.pose.zeroMomentPoint,c=new THREE.Vector3().fromArray(anchorsLocal[0]).add(new THREE.Vector3().fromArray(anchorsLocal[1])).multiplyScalar(.5)
  balanceMarkers.children[2].visible=!!zmp
  if(zmp){c.x+=zmp.side;c.z+=zmp.forward;c.y=supportOriginLocal.y;balanceMarkers.children[2].position.copy(metrics?.balanceProxy?.zeroMomentPointWorld?new THREE.Vector3().fromArray(metrics.balanceProxy.zeroMomentPointWorld):platformPoint(c.toArray())).addScaledVector(supportNormal,.04)}
 }
 const view=document.querySelector('#view').value;if(view!==lastView){measureNext=true;fitAfterMeasure=true}if(frameView||view!==lastView){setView(preset);frameView=false;lastView=view}
 const carrierData=isShoulder?{frames:carrierDriver?.frames,restored:carrierDriver?.restored,error:carrierDriver?.error,metrics:carrierDriver?.last,position:carrierRoot.position.toArray(),heading:carrierHeading,scale:carrierRoot.scale.y}:null
 const latest={profile:stage.profile,preset,connected:!!bridge,error:bridge?.error??null,frames:bridge?.frames??0,restored:bridge?.restored??true,metrics:preset==='native'?null:bridge?.last??null,carrier:carrierData,skinDiagnostics,supportPlaneY:preset==='nimbus'?vehicle.position.y:null,ride:preset==='nimbus'?{phase:drivePhase,segment:sequenceSegment,paused:document.querySelector('#drivePause').checked,state:rideState,anchorsLocal,supportOriginLocal:supportOriginLocal.toArray(),supportOriginWorldBase:supportOriginWorldBase.toArray(),supportFrame:anchorsLocal?supportFrame():null,anchorsWorld:anchorsLocal?.map(p=>platformPoint(p).toArray()),anchorGeneration,anchorMode:options.anchorMode,tiltEnabled:tiltEnabled()}:null,camera:{position:stage.camera.position.toArray(),quaternion:stage.camera.quaternion.toArray(),followRide:document.querySelector('#followRide').checked},simulated:true};window.__avatarLab=latest
 const rounded=n=>Number.isFinite(n)?n.toFixed(2):'—'
 let summary=preset==='nimbus'?'N02：足のずれ '+rounded(metrics?.footTargetErrorMm)+' mm ／首のねじれ '+rounded(metrics?.bodyBalance?.neckYawDegrees)+' 度。'+(metrics?.bodyBalance?.neckPolicyExceeded||metrics?.footTargetErrorMm>1?'合わせきれない条件です。':'')+'足を雲へ固定し、胸・腰を分担して動かします。':isShoulder?'U02：肩支持のずれ '+rounded(metrics?.supportErrorMm)+' mm ／描画頭の移動 '+rounded(metrics?.headDriftMm)+' mm ／支える手のずれ '+rounded(carrierDriver?.last?.handTargetErrorMm)+' mm。'+(metrics?.proxyWarning?'簡易の体積判定では頭と身体が近接。':'')+'支持優先での頭移動は意図した結果です。':'元の比較姿勢。頭・手はホスト入力の模擬です。'
 flightReadout.hidden=preset!=='nimbus'
 if(preset==='nimbus'){
  const p=rideState.pose,load=p.zmpValid&&metrics?.balanceProxy?.zmpValid!==false?(metrics?.balanceProxy?.loadRatio??p.loadRatio):null,stateLabel=p.supportState==='adhesion'?'魔法の拘束':p.supportState==='low-load'?'荷重が小さい':p.normalLoadRatio>1.05?'重くなる':p.normalLoadRatio<.95?'軽くなる':'通常荷重'
  flightReadout.textContent=(sequenceSegment?sequenceSegment+'\n':'')+'開始位置から '+rounded(rideState.position[1])+' m\n上下速度 '+rounded(p.verticalSpeed)+' m/s · '+stateLabel+' '+rounded(p.normalLoadRatio)+'倍\n雲の上向き '+rounded((rideState.attitude?.pitch??0)*180/Math.PI)+'° ／右傾き '+rounded((rideState.attitude?.roll??0)*180/Math.PI)+'°'
  document.querySelector('#driveSummary').textContent='高度差 '+rounded(rideState.position[1])+' m ／上下速度 '+rounded(p.verticalSpeed)+' m/s ／上下加速度 '+rounded(p.verticalAcceleration)+' m/s² ／荷重目安 '+rounded(p.normalLoadRatio)+'倍 ／'+(load?'前足 '+Math.round(load.front*100)+'%・後足 '+Math.round(load.rear*100)+'%':'ZMP・足荷重比は無効（'+p.zmpInvalidReason+'）')+(metrics?.balanceProxy?.supportExceeded?' ／支持範囲を超える入力':'')
 }
 if(options.preserveHands&&metrics?.handPositionErrorMm>1)summary+=' 模擬追跡手へ届かない量 '+rounded(metrics.handPositionErrorMm)+' mm。'
 if(preset==='nimbus'&&metrics?.balanceProxy?.centerOfMassErrorMm>5)summary+=' 支持を優先したため重心目標に '+rounded(metrics.balanceProxy.centerOfMassErrorMm)+' mmの差があります。'
 if(isShoulder&&metrics?.bodyProxyWarnings?.some(w=>/shin|foot/.test(w)))summary+=' 脚と胴も近接の可能性があり、目視確認が必要です。'
 if(actor.vrm&&skinDiagnostics?.feet.every(f=>f.weightedVertexCount===0))summary+=' このモデルには足として検出できる描画頂点がありません。足の支持は目視検証の対象外です。'
 document.querySelector('#poseSummary').textContent=summary
 showMetrics(latest)
})
