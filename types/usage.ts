import {Scene,SkinnedMesh,Bone,Vector3} from 'three'
import {attachPoseDriver,prepareHumanoidRig,applyPose} from '../src/index.mjs'
import {selectRiderRig} from '../src/adapters/xrift.mjs'
const scene=new Scene(),mesh=new SkinnedMesh(),bones:Record<string,Bone>={},rig=prepareHumanoidRig({mesh,bones})
applyPose(rig,{preset:'hover',preserveHands:true})
attachPoseDriver({scene,rig,getOptions:()=>({preset:'glider',enabled:true})}).dispose()
selectRiderRig({scene,rigs:[rig],occupantId:'me',localUserId:'me',seatPosition:new Vector3()})
