import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {VRMLoaderPlugin} from '@pixiv/three-vrm'
import './style.css'
export function createStage(createFixture){
 const viewport=document.querySelector('#viewport'),scene=new THREE.Scene();scene.background=new THREE.Color('#e9eee9')
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));viewport.append(renderer.domElement)
 const camera=new THREE.PerspectiveCamera(42,1,.01,100);camera.position.set(2.5,1.9,3.7);camera.layers.enable(10)
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,1.05,0);orbit.enableDamping=true
 scene.add(new THREE.HemisphereLight('#ffffff','#7d8c81',2.8));const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(3,6,4);scene.add(light,new THREE.GridHelper(10,20,'#869b8c','#c6d0c6'))
 const resize=()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()};new ResizeObserver(resize).observe(viewport);resize()
 let actor=null,lastTime=performance.now(),update=()=>{},profile='standard'
 const disposeObject=root=>{const gs=new Set(),ms=new Set(),ts=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v)}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose())}
 function wrap(root,bones,vrm=null,fixture=null){
  const neutral=[];root.traverse(o=>{if(o.isBone)neutral.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()})});const humanoid=Object.fromEntries(Object.entries(bones).filter(([,b])=>b)),scale=root.scale.clone(),base=root.position.clone()
  return {root,bones:humanoid,vrm,fixture,neutral,scale,base,animate(t,{seated=false,headYaw=0,headPitch=0}={}){
   for(const {o,p,q,s}of neutral){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s)}
   if(seated)for(const side of ['left','right']){humanoid[side+'UpperLeg']?.rotateX(-Math.PI/2);humanoid[side+'LowerLeg']?.rotateX(Math.PI/2);humanoid[side+'UpperArm']?.rotateZ(side==='left'?-Math.PI/2:Math.PI/2)}
   humanoid.head?.rotateY(headYaw);humanoid.head?.rotateX(headPitch)
   root.updateWorldMatrix(true,true);root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update()})
  },dispose(){if(fixture)fixture.dispose();else disposeObject(root)}}
 }
 const roles=['hips','spine','chest','neck','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
 function replace(next){if(actor){scene.remove(actor.root);actor.dispose()}actor=next;scene.add(actor.root);const box=new THREE.Box3().setFromObject(actor.root),center=box.getCenter(new THREE.Vector3()),height=Math.max(.3,box.getSize(new THREE.Vector3()).y);orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1.2,.5,1.8).multiplyScalar(height));orbit.update();return actor}
 function useFixture(kind='standard'){
  const f=createFixture(),root=new THREE.Group();root.add(f.mesh);root.scale.setScalar(kind==='small'?.65:kind==='tall'?1.35:1)
  // A shifted head pivot/shape is an authored reproduction case, not a VRM claim.
  if(kind==='forward-pivot'){f.bones.head.position.z=.08;f.mesh.updateWorldMatrix(true,true);f.skeleton.calculateInverses()}
  profile=kind;return replace(wrap(root,f.bones,null,f))
 }
 async function loadVRM(file){
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(/^(data:|blob:)/.test(url))return url;throw Error('Embedded local VRM assets only; external references are disabled')})
  const loader=new GLTFLoader(manager);loader.register(parser=>new VRMLoaderPlugin(parser));const gltf=await loader.parseAsync(await file.arrayBuffer(),'');const vrm=gltf.userData.vrm
  if(!vrm?.humanoid)throw Error('No VRM humanoid definition')
  vrm.firstPerson?.setup();vrm.update(0)
  const bones=Object.fromEntries(roles.map(role=>[role,vrm.humanoid.getRawBoneNode(role)]));profile='local-vrm'
  return replace(wrap(vrm.scene,bones,vrm))
 }
 useFixture()
 function frame(now){const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;orbit.update();update(now/1000,dt,actor);renderer.render(scene,camera);requestAnimationFrame(frame)}
 requestAnimationFrame(frame)
 return {scene,renderer,camera,orbit,get actor(){return actor},get profile(){return profile},useFixture,loadVRM,setUpdate(fn){update=fn},THREE}
}
export function commonControls(title,description){
 document.querySelector('#controls').innerHTML=`<p class="eyebrow">XRIFT / AVATAR LAB</p><h1>${title}</h1><p>${description}</p><label>検証用の体格<select id="profile"><option value="standard">標準</option><option value="small">小型 0.65倍</option><option value="tall">大型 1.35倍</option><option value="forward-pivot">頭ピボット前ずれの自作ケース</option></select></label><label class="file">手元のVRMを読み込む<input id="vrm" type="file" accept=".vrm"></label><p class="note">VRMはブラウザ内だけで読み込みます。ファイルや画像は送信・保存しません。既定表示は自作骨格です。</p><div id="specific"></div><label>頭の左右 <input id="headYaw" type="range" min="-1.2" max="1.2" step=".01" value="0"></label><label>頭の上下 <input id="headPitch" type="range" min="-.8" max=".8" step=".01" value="0"></label><p id="message" role="status"></p><details open><summary>計測値</summary><pre id="metrics"></pre></details><p class="note">ドラッグで観察、ホイールで拡大。ローカルの検証であり、XRift実機の動作保証とは分けて記録します。</p>`
}
export function bindActorControls(stage,onChange=()=>{}){
 const message=document.querySelector('#message');document.querySelector('#profile').onchange=e=>{onChange(null);stage.useFixture(e.target.value);onChange(stage.actor);message.textContent='自作骨格へ切り替えました'}
 document.querySelector('#vrm').onchange=async e=>{const file=e.target.files[0];if(!file)return;onChange(null);try{await stage.loadVRM(file);onChange(stage.actor);message.textContent='ローカルVRM読込済み'}catch(error){onChange(stage.actor);message.textContent=String(error)}}
}
export const value=id=>Number(document.getElementById(id).value)
export function showMetrics(data){document.querySelector('#metrics').textContent=JSON.stringify(data,null,2)}
