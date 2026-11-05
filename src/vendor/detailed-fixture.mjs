// Original, deliberately simple skinned test body WITH fingers, clavicles,
// upper chest and toes. It is not a user's avatar. T-pose bind, palms down,
// thumbs pointing forward (+Z), soles at y=0, like typical VRM exports.
import {Bone,Skeleton,SkinnedMesh,BoxGeometry,MeshStandardMaterial,Matrix4,Color,Float32BufferAttribute,Uint16BufferAttribute} from 'three'
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

export function createDetailedPoseFixture(){
 const bones=[],byName={}
 const bone=(name,position,parent)=>{const b=new Bone();b.name=name;b.position.fromArray(position);if(parent)parent.add(b);bones.push(b);byName[name]=b;return b}
 const hips=bone('hips',[0,.95,0]),spine=bone('spine',[0,.10,0],hips),chest=bone('chest',[0,.13,0],spine),upperChest=bone('upperChest',[0,.12,0],chest),neck=bone('neck',[0,.12,0],upperChest),head=bone('head',[0,.09,0],neck)
 for(const [sign,side] of [[1,'left'],[-1,'right']]){
  const shoulder=bone(side+'Shoulder',[sign*.03,.075,-.01],upperChest),upper=bone(side+'UpperArm',[sign*.14,0,0],shoulder),lower=bone(side+'LowerArm',[sign*.28,0,0],upper),hand=bone(side+'Hand',[sign*.25,0,0],lower)
  for(const [name,root,lengths,dir] of FINGERS){
   let parent=hand,position=[sign*root[0],root[1],root[2]]
   for(let i=0;i<3;i++){const b=bone(side+name+SEGMENTS[i],position,parent);const n=Math.hypot(...dir);position=[sign*dir[0]/n*lengths[i],dir[1]/n*lengths[i],dir[2]/n*lengths[i]];parent=b}
   bone(side+name+'Tip',position,parent)
  }
  const thigh=bone(side+'UpperLeg',[sign*.09,-.06,0],hips),shin=bone(side+'LowerLeg',[0,-.42,0],thigh),foot=bone(side+'Foot',[0,-.40,0],shin);bone(side+'Toes',[0,-.05,.12],foot)
 }
 hips.updateMatrixWorld(true)
 const pieces=[],headPieces=[]
 const box=(b,size,offset,color)=>{
  const g=new BoxGeometry(...size);g.translate(...offset);g.applyMatrix4(b.matrixWorld)
  const count=g.attributes.position.count,index=bones.indexOf(b),indices=[],weights=[],colors=[],c=new Color(color)
  for(let i=0;i<count;i++){indices.push(index,0,0,0);weights.push(1,0,0,0);colors.push(c.r,c.g,c.b)}
  g.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));g.setAttribute('color',new Float32BufferAttribute(colors,3));(b===head?headPieces:pieces).push(g)
 }
 box(hips,[.30,.16,.19],[0,0,0],'#425d70');box(spine,[.27,.14,.17],[0,.06,0],'#347f91');box(chest,[.30,.14,.19],[0,.06,0],'#347f91');box(upperChest,[.34,.13,.20],[0,.05,0],'#347f91');box(neck,[.09,.11,.09],[0,.04,0],'#cead87');box(head,[.18,.23,.20],[0,.095,.015],'#dfbd96');box(head,[.14,.035,.018],[0,.11,.12],'#374852')
 for(const [sign,side] of [[1,'left'],[-1,'right']]){
  box(byName[side+'Shoulder'],[.13,.08,.10],[sign*.075,0,0],'#347f91');box(byName[side+'UpperArm'],[.28,.095,.10],[sign*.14,0,0],'#347f91');box(byName[side+'LowerArm'],[.25,.07,.075],[sign*.125,0,0],'#dfbd96')
  box(byName[side+'Hand'],[.092,.028,.082],[sign*.047,0,0],'#dfbd96')
  for(const [name,,lengths] of FINGERS)for(let i=0;i<3;i++){const b=byName[side+name+SEGMENTS[i]],tip=b.children[0].position;box(b,[Math.abs(tip.x)+.004,.016,Math.abs(tip.z)+.016],[tip.x/2,tip.y/2,tip.z/2],'#e8c9a4')}
  box(byName[side+'UpperLeg'],[.14,.42,.15],[0,-.21,0],'#425d70');box(byName[side+'LowerLeg'],[.10,.40,.11],[0,-.20,0],'#425d70');box(byName[side+'Foot'],[.10,.07,.17],[0,-.035,.05],'#283b45');box(byName[side+'Toes'],[.10,.04,.07],[0,-.0,.035],'#283b45')
 }
 const geometry=mergeGeometries(pieces),headGeometry=mergeGeometries(headPieces),material=new MeshStandardMaterial({vertexColors:true,roughness:.9}),mesh=new SkinnedMesh(geometry,material)
 ;[...pieces,...headPieces].forEach(p=>p.dispose());mesh.name='authored-detailed-test-body';mesh.frustumCulled=false;mesh.userData.poseLabFixture=true;mesh.add(hips)
 const skeleton=new Skeleton(bones);mesh.bind(skeleton)
 const headMesh=new SkinnedMesh(headGeometry,material);headMesh.name='authored-detailed-test-head';headMesh.frustumCulled=false;headMesh.layers.set(10);mesh.add(headMesh);headMesh.bind(skeleton,new Matrix4())
 const rest=bones.map(b=>b.quaternion.clone())
 /** Host-like idle: arms hang down with soft elbows, legs straight, head may look around. */
 function idle(time=0){
  bones.forEach((b,i)=>b.quaternion.copy(rest[i]))
  for(const [sign,side] of [[1,'left'],[-1,'right']]){byName[side+'UpperArm'].rotation.z=-sign*1.2;byName[side+'LowerArm'].rotation.y=sign*.25;for(const name of ['Index','Middle','Ring','Little'])byName[side+name+'Proximal'].rotation.y=sign*.25}
  head.rotation.y=Math.sin(time*.6)*.1;hips.updateWorldMatrix(true,true);skeleton.update()
 }
 return {mesh,skeleton,bones:byName,idle,dispose(){geometry.dispose();headGeometry.dispose();material.dispose();skeleton.dispose()}}
}
