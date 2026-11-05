// Fit the hand-pair axes of every pair key of a clip on the reference test body
// and write them back (the authored axes are kept as authoredAxes for the record).
// Usage: node scripts/fit-clip.mjs specs/charge-wave.v1.json [--dry]
import {readFileSync,writeFileSync} from 'node:fs'
import {Scene,Group} from 'three'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {inspectHumanoidRigs,prepareRig} from '../src/vendor/render-pose.mjs'
import {fitPairAxes} from '../src/authoring/fit.mjs'
const path=process.argv[2]??'specs/charge-wave.v1.json',dry=process.argv.includes('--dry')
const clip=JSON.parse(readFileSync(path,'utf8'))
const scene=new Scene(),f=createDetailedPoseFixture(),root=new Group();root.add(f.mesh);scene.add(root);f.idle(0);scene.updateMatrixWorld(true)
const rig=prepareRig(inspectHumanoidRigs(scene)[0])
for(const [name,key] of Object.entries(clip.keys)){
 const pair=key.hands?.pair;if(!pair)continue
 const authored=pair.authoredAxes??pair.axes??[0,0,0],k=structuredClone(key);k.hands.pair.axes=authored
 const fit=fitPairAxes(rig,k,{hostPose:()=>f.idle(0)})
 console.log(name.padEnd(8),'authored',JSON.stringify(authored).padEnd(16),'fitted',JSON.stringify(fit.axes).padEnd(22),'cost',fit.before.toFixed(2),'→',fit.cost.toFixed(2),`(${fit.evaluated} evals)`)
 pair.authoredAxes=authored;pair.axes=fit.axes
}
if(!dry)writeFileSync(path,JSON.stringify(clip,null,2)+'\n')
