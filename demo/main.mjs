import {createStage,commonControls,bindActorControls,value,showMetrics} from './common.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {attachPoseDriver,prepareHumanoidRig,inspectHumanoidRigs,prepareRig} from '../src/index.mjs'
commonControls('ride姿勢の実験','搭乗姿勢を入力に、頭・手を保ちながら直立・ボード・伏せ姿勢を比較します。乗り物は検証用の仮形状です。')
document.querySelector('#specific').innerHTML=`<label>姿勢<select id="preset"><option value="native">元の座り姿勢</option><option value="upright">直立</option><option value="hover" selected>直立ホバリング</option><option value="board">ボード上の立ち姿勢</option><option value="glider">伏せるグライダー</option></select></label><label><input id="hands" type="checkbox"> 手の追跡位置を保つ（模擬）</label><label><input id="motion" type="checkbox" checked> 頭を保ち、身体を軽く傾ける</label><label>身体の向き<input id="heading" type="range" min="-3.14" max="3.14" step=".01" value="0"></label><p class="note">頭・手はホストからの入力を模擬。可動範囲外の手は骨を伸ばさず誤差を表示します。</p>`
const stage=createStage(createPoseFixture),{THREE}=stage,vehicle=new THREE.Group();stage.scene.add(vehicle)
function makeVehicle(preset){while(vehicle.children.length){const c=vehicle.children[0];vehicle.remove(c);c.geometry?.dispose();c.material?.dispose()}const color=preset==='glider'?'#c6a259':preset==='board'?'#2d8068':'#687d88';const size=preset==='glider'?[1.5,.06,.9]:preset==='board'?[.8,.07,.28]:[.45,.08,.45];const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color}));vehicle.add(mesh);vehicle.position.set(0,preset==='glider'?.9:preset==='board'?.05:.8,0);vehicle.visible=preset!=='upright'}
let bridge=null,currentActor=null,lastPreset='',latest=null,options={}
function bind(actor){bridge?.dispose();bridge=null;currentActor=actor;if(!actor)return
 try{
  let rigs=inspectHumanoidRigs(actor.root),chosen=rigs.filter(r=>r.supported).sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length)[0]
  // Explicit VRM raw humanoid mapping is preferred; aliases serve fixtures/fallback.
  if(actor.vrm){const candidates=[];actor.root.traverse(o=>{if(o.isSkinnedMesh)candidates.push(o)});for(const mesh of candidates.sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length)){try{chosen=prepareHumanoidRig({mesh,bones:actor.bones});break}catch{}}}
  if(!chosen)throw Error('Required humanoid joints are not available in a skin palette')
  const rig=chosen.restWorld?chosen:prepareRig(chosen),related=[];actor.root.traverse(o=>{if(o.isSkinnedMesh&&!related.includes(o.skeleton))related.push(o.skeleton)})
  bridge=attachPoseDriver({scene:stage.scene,rig,getOptions:()=>options,relatedSkeletons:related});document.querySelector('#message').textContent='姿勢コア接続済み'
 }catch(e){document.querySelector('#message').textContent=String(e)}
}
bindActorControls(stage,bind);bind(stage.actor)
stage.setUpdate((t,dt,actor)=>{
 if(actor!==currentActor)bind(actor)
 actor.animate(t,{seated:true,headYaw:value('headYaw'),headPitch:value('headPitch')})
 const preset=document.querySelector('#preset').value;if(preset!==lastPreset){makeVehicle(preset);lastPreset=preset}
 options={enabled:preset!=='native',preset:preset==='native'?'upright':preset,heading:value('heading'),preserveHands:document.querySelector('#hands').checked,...(document.querySelector('#motion').checked&&['hover','board'].includes(preset)?{pitch:Math.sin(t*.8)*.1,roll:Math.sin(t*.6)*.05}:{})}
 if(preset==='glider')vehicle.position.y=actor.bones.head.getWorldPosition(new THREE.Vector3()).y-.3*actor.root.scale.y
 else if(preset!=='native')vehicle.position.y=(bridge?.last?.feetWorld?Math.min(...bridge.last.feetWorld.map(p=>p[1])):0)-.06
 latest={profile:stage.profile,preset,connected:!!bridge,error:bridge?.error??null,frames:bridge?.frames??0,restored:bridge?.restored??true,metrics:bridge?.last??null};window.__avatarLab=latest;showMetrics(latest)
})
