import {createStage,commonControls,bindActorControls} from './common.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {POSE_PATTERN_CATALOG,createPatternCases} from '../src/pose-patterns.mjs'
import {createPatternEngine} from './pattern-engine.mjs'
import {assessPatternSample} from './pattern-assessment.mjs'
import './patterns.css'
document.body.classList.add('pose-patterns')
commonControls('乗り姿勢のパターン実験','18候補を手元のVRMで比較します。数値のスクリーニングと見た目の採否は別です。')
document.querySelector('#vrm').closest('label').nextElementSibling.textContent='VRMと画像は外部へ送信しません。結果JSONは端末へ保存できます。既定表示は自作骨格です。'
for(const id of ['vrm','localModels'])document.querySelector('#'+id)?.closest('label')?.setAttribute('data-private-model','')
document.querySelector('#specific').innerHTML=`<p><a href="/">採用済みN02の実験へ</a></p>
<label>姿勢の候補<select id="pattern"></select></label><p id="patternDescription" class="note"></p>
<label>比較する条件<select id="variant"></select></label>
<label>観察方向<select id="view"><option value="orbit">斜め</option><option value="front">正面</option><option value="side">横</option><option value="back">後ろ</option></select></label>
<label><input id="animateSupport" type="checkbox"> 支持を小さく揺らす</label>
<button id="sweepStandard">全候補を一次SIM</button><button id="sweepStress">境界条件も一次SIM</button><button id="sweepContinuous">表示中を24フレームSIM</button><button id="downloadReport" disabled>結果JSONを保存</button>
<p id="sweepProgress" role="status"></p><p id="resultSummary" class="note"></p>
<p class="note">固定dtで支持面を動かす姿勢・IKの実験です。剛体接触や転倒を解く物理SIMではありません。緑の数値成立も、衣服の干渉・見た目・VR体験の合格を意味しません。</p>`
document.querySelector('details').open=false
document.querySelector('#headYaw').closest('label').hidden=true;document.querySelector('#headPitch').closest('label').hidden=true
const stage=createStage(createPoseFixture),{THREE}=stage,carrier=createPoseFixture(),carrierRoot=new THREE.Group(),guides=new THREE.Group()
carrierRoot.add(carrier.mesh);carrier.mesh.material.vertexColors=false;carrier.mesh.material.color.set('#bd835c');stage.scene.add(carrierRoot,guides)
for(const color of ['#437d67','#437d67','#c38a4b','#c38a4b'])guides.add(new THREE.Mesh(new THREE.SphereGeometry(.025,12,8),new THREE.MeshStandardMaterial({color})))
const supportMesh=new THREE.Mesh(new THREE.BoxGeometry(1,.035,1),new THREE.MeshStandardMaterial({color:'#dfcda5',transparent:true,opacity:.62}));stage.scene.add(supportMesh)
const overlay=document.createElement('div');overlay.className='flight-readout';document.querySelector('#viewport').append(overlay)
const labels={pass:'数値成立・目視待ち',limited:'制約／未確認あり',unsupported:'見える足の検証対象外',fail:'不成立'}
let engine=null,loading=false,generation=0,ready=false,busy=false,activeCase=null,current=null,lastReport=null,fit=true,lastView='',lastCase='',lastSolveKey='',simTime=23/60,sweepProgress=null
const standard=createPatternCases(),allCases=createPatternCases({intensity:'stress'}),caseMap=new Map(allCases.map(c=>[c.id,c]))
for(const pattern of POSE_PATTERN_CATALOG){const option=new Option(pattern.title,pattern.id);document.querySelector('#pattern').add(option)}
function casesForPattern(id){return allCases.filter(c=>c.patternId===id)}
function selectPattern(id){
 const pattern=POSE_PATTERN_CATALOG.find(p=>p.id===id);if(!pattern)throw Error('Unknown pattern')
 document.querySelector('#pattern').value=id;document.querySelector('#patternDescription').textContent=pattern.description
 const select=document.querySelector('#variant');select.replaceChildren(...casesForPattern(id).map(c=>new Option(c.condition.variantTitle,c.id)));setCase(select.value)
}
function setCase(id){activeCase=caseMap.get(id);if(!activeCase)throw Error('Unknown case');document.querySelector('#variant').value=id;fit=true;lastSolveKey=''}
document.querySelector('#pattern').onchange=e=>selectPattern(e.target.value)
document.querySelector('#variant').onchange=e=>setCase(e.target.value)
function bind(actor){
 generation++;ready=false;current=null;engine=null;lastReport=null;document.querySelector('#downloadReport').disabled=true
 if(!actor){loading=true;return}
 try{engine=createPatternEngine({actor,scene:stage.scene,carrier,carrierRoot,kind:actor.vrm?'local-vrm':'fixture'});ready=true;loading=false;fit=true;document.querySelector('#resultSummary').textContent='数値SIMと複数方向の目視を組み合わせて候補を選びます。'}catch(error){loading=false;document.querySelector('#message').textContent=String(error)}
}
bindActorControls(stage,bind);document.querySelector('#localModels').closest('label').setAttribute('data-private-model','');bind(stage.actor);selectPattern(POSE_PATTERN_CATALOG[0].id)
function updateGuides(result){
 const m=result.metrics,normal=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion().fromArray(result.frame.quaternion))
 const points=[...(m.footTargetsWorld??m.feetWorld??[]),...(m.handTargetsWorld??m.handsWorld??[])]
 guides.children.forEach((mesh,i)=>{mesh.visible=!!points[i];if(points[i])mesh.position.fromArray(points[i])})
 supportMesh.visible=activeCase.family!=='shoulder'&&activeCase.family!=='standing'
 supportMesh.position.fromArray(result.frame.position);supportMesh.quaternion.fromArray(result.frame.quaternion)
 if(activeCase.family==='nimbus'){supportMesh.scale.set(1.2*engine.scale,1,.9*engine.scale);supportMesh.position.addScaledVector(normal,-.0175)}
 else if(activeCase.family==='prone'){supportMesh.scale.set(.8*engine.scale,1,1.6*engine.scale);supportMesh.position.addScaledVector(normal,-.0175)}
 else {supportMesh.scale.set(activeCase.family==='straddle'?.3*engine.scale:.6*engine.scale,1,.4*engine.scale);supportMesh.position.addScaledVector(normal,-.10*engine.scale)}
}
function frameView(result){
 const m=result.metrics,points=[m.headWorld,m.hipsWorld,...m.feetWorld,...m.handsWorld].filter(Boolean).map(p=>new THREE.Vector3().fromArray(p))
 if(activeCase.family==='shoulder')points.push(new THREE.Vector3(0,0,0))
 const box=new THREE.Box3().setFromPoints(points),bounds=engine.measureBodyBounds()
 if(bounds.min&&bounds.max){box.expandByPoint(new THREE.Vector3().fromArray(bounds.min));box.expandByPoint(new THREE.Vector3().fromArray(bounds.max))}
 const center=box.getCenter(new THREE.Vector3()),radius=Math.max(.2,box.getBoundingSphere(new THREE.Sphere()).radius),verticalFov=THREE.MathUtils.degToRad(stage.camera.fov)
 const limitingFov=2*Math.atan(Math.tan(verticalFov/2)*Math.min(1,stage.camera.aspect)),distance=radius/Math.sin(limitingFov/2)*1.12
 const view=document.querySelector('#view').value,offset={front:[0,.16,1],back:[0,.16,-1],side:[1,.16,0],orbit:[1.1,.38,1.4]}[view]
 stage.orbit.target.copy(center);stage.camera.position.copy(center).add(new THREE.Vector3(...offset).normalize().multiplyScalar(distance));stage.orbit.update()
}
function getState(){return {ready,loading,busy,modelGeneration:generation,selectedModelIndex:Number(document.querySelector('#localModels').value||0),model:engine?.model??null,caseId:activeCase?.id??null,patternId:activeCase?.patternId??null,progress:sweepProgress,current}}
stage.setUpdate((now,dt)=>{
 if(!engine||!ready||busy)return
 try{
  const time=document.querySelector('#animateSupport').checked?now%1:simTime,key=generation+'|'+activeCase.id+'|'+time
  if(key!==lastSolveKey||!current?.metrics){current=engine.solve(activeCase,time);lastSolveKey=key}
  carrierRoot.visible=activeCase.family==='shoulder';updateGuides(current)
  if(fit||lastView!==document.querySelector('#view').value||lastCase!==activeCase.id){frameView(current);fit=false;lastView=document.querySelector('#view').value;lastCase=activeCase.id}
  const status=lastReport?.cases.find(c=>c.id===activeCase.id)?.assessment??current.assessment
  overlay.textContent=activeCase.title+'\n'+labels[status.status]+'\n頭の向き誤差 '+(current.metrics.headRotationErrorDegrees??0).toFixed(5)+'° ／ 足目標 '+(current.metrics.footTargetErrorMm??0).toFixed(2)+' mm'
  document.querySelector('#metrics').textContent=JSON.stringify({model:engine.model,case:activeCase,assessment:status,metrics:current.metrics},null,2)
 }catch(error){document.querySelector('#message').textContent=String(error);current={error:String(error)};ready=false}
})
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve))
const taskChannel=new MessageChannel(),taskQueue=[];taskChannel.port1.onmessage=()=>taskQueue.shift()?.()
const nextTask=()=>new Promise(resolve=>{taskQueue.push(resolve);taskChannel.port2.postMessage(0)})
const maximaKeys=['boneLengthErrorMm','mappedSpanErrorMm','headRotationErrorDegrees','footTargetErrorMm','supportErrorMm','handTargetErrorMm','handPositionErrorMm','carrierHandTargetErrorMm','maxKneeDegrees','neckAngleDegrees','headChestAngleDegrees']
async function runSweep({intensity='standard',mode='screen',caseIds=null,yieldMode='task'}={}){
 if(!ready||!engine||busy)throw Error('A ready idle model is required')
 if(!['screen','continuous'].includes(mode))throw Error('Unknown simulation mode')
 if(!['task','frame'].includes(yieldMode))throw Error('Unknown yield mode')
 const selected=caseIds?new Set(caseIds):null,available=createPatternCases({intensity:selected?'stress':intensity}),runCases=selected?available.filter(c=>selected.has(c.id)):available
 if(!runCases.length||(selected&&runCases.length!==selected.size))throw Error('Unknown or empty selected cases')
 const framesPerCase=mode==='continuous'?24:1
 const runEngine=engine,modelGeneration=generation,cases=[],started=performance.now()
 busy=true;sweepProgress={completed:0,total:runCases.length};document.querySelector('#sweepStandard').disabled=true;document.querySelector('#sweepStress').disabled=true
 const inputs=[...document.querySelectorAll('#vrm,#profile,#localModels,#pattern,#variant')];inputs.forEach(el=>el.disabled=true)
 try{
  for(const c of runCases){
   if(generation!==modelGeneration)throw Error('Model changed during sweep')
   runEngine.reset(c);const snapshot=runEngine.capture(),maxima={},warnings=new Set();let last,error=null,finite=true,framesCompleted=0
   try{for(let frame=0;frame<framesPerCase;frame++){
    last=runEngine.solve(c,mode==='continuous'?frame/60:simTime);framesCompleted++
    finite&&=last.metrics.finite
    for(const key of maximaKeys)if(Number.isFinite(last.metrics[key]))maxima[key]=Math.max(maxima[key]??0,last.metrics[key])
    for(const warning of last.metrics.warnings??[])warnings.add(warning)
   }
   if(last){last.metrics.visibleSupport=runEngine.measureSupport(c,last);if(c.family==='nimbus')last.metrics.supportContactMeasured=last.metrics.visibleSupport?.feet.every(f=>f.gapM!=null)}
   }catch(e){error=String(e)}
   finally{runEngine.restore(snapshot)}
   const restored=runEngine.isRestored(snapshot),metrics={...last?.metrics,...maxima,finite,warnings:[...warnings]}
   const assessment=assessPatternSample({family:c.family,metrics,model:runEngine.model,restored,error})
   cases.push({...c,metrics,assessment,restored,error,frames:framesCompleted,finalSample:last?.metrics??null})
   sweepProgress={completed:cases.length,total:runCases.length};document.querySelector('#sweepProgress').textContent=cases.length+' / '+runCases.length+' 条件'
   if(cases.length%2===0)await (yieldMode==='frame'?nextFrame():nextTask())
  }
  const byStatus=Object.fromEntries(Object.keys(labels).map(status=>[status,cases.filter(c=>c.assessment.status===status).length]))
  const byFamily=Object.fromEntries([...new Set(cases.map(c=>c.family))].map(family=>[family,{cases:cases.filter(c=>c.family===family).length,status:Object.fromEntries(Object.keys(labels).map(s=>[s,cases.filter(c=>c.family===family&&c.assessment.status===s).length]))}]))
  const totalFrames=cases.reduce((sum,c)=>sum+c.frames,0)
  lastReport={schemaVersion:1,experiment:'ride-pose-patterns-v1',createdAt:new Date().toISOString(),modelGeneration,model:{...runEngine.model},simulation:{kind:'kinematic-parameter-sweep',mode,yieldMode,dtSeconds:mode==='continuous'?1/60:null,sampleTimeSeconds:simTime,framesPerCase,supportPerturbationRadians:.025,note:'Screen samples the final pose once. Continuous solves selected cases at fixed dt for 24 frames. Neither integrates forces, collision, rigid contact, live tracking or cloth. finalSample is the screenshot pose.'},intensity,cases,summary:{total:cases.length,frames:totalFrames,byStatus,byFamily,durationSeconds:(performance.now()-started)/1000,visualReview:'pending',numericPassIsVisualAcceptance:false}}
  document.querySelector('#resultSummary').textContent=cases.length+'条件・'+totalFrames+'フレーム。数値成立 '+byStatus.pass+'／制約あり '+byStatus.limited+'／検証対象外 '+byStatus.unsupported+'／不成立 '+byStatus.fail+'。見た目は別に確認してください。'
  document.querySelector('#downloadReport').disabled=false;return structuredClone(lastReport)
 }finally{busy=false;lastSolveKey='';sweepProgress=null;inputs.forEach(el=>el.disabled=false);document.querySelector('#sweepStandard').disabled=false;document.querySelector('#sweepStress').disabled=false;fit=true}
}
document.querySelector('#sweepStandard').onclick=()=>runSweep().catch(e=>document.querySelector('#message').textContent=String(e))
document.querySelector('#sweepStress').onclick=()=>runSweep({intensity:'stress'}).catch(e=>document.querySelector('#message').textContent=String(e))
document.querySelector('#sweepContinuous').onclick=()=>runSweep({mode:'continuous',caseIds:[activeCase.id]}).catch(e=>document.querySelector('#message').textContent=String(e))
document.querySelector('#downloadReport').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='pose-pattern-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
window.__posePatternExperiment={getState,runSweep,useAuthoredSkinCulling:enabled=>engine.useAuthoredSkinCulling(enabled),getCatalog:()=>structuredClone(POSE_PATTERN_CATALOG),listCases:()=>structuredClone(allCases),selectPattern,async renderCase(id,{view='orbit'}={}){
 if(busy)throw Error('Sweep is busy');const c=caseMap.get(id);if(!c)throw Error('Unknown case')
 if(document.querySelector('#pattern').value!==c.patternId)selectPattern(c.patternId)
 setCase(id);document.querySelector('#view').value=view;document.querySelector('#animateSupport').checked=false;fit=true
 await nextFrame();await nextFrame();if(current?.metrics){current.metrics.visibleSupport=engine.measureSupport(c,current);if(c.family==='nimbus')current.metrics.supportContactMeasured=current.metrics.visibleSupport?.feet.every(f=>f.gapM!=null);current.assessment=assessPatternSample({family:c.family,metrics:current.metrics,model:engine.model})}return structuredClone(getState())
}}
