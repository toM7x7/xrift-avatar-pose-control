// Review an authored action clip on the built-in test body at three sizes:
// the whole press→hold→release timeline at 60 fps, host idle restored every
// frame, verdicts against the clip thresholds. No private assets needed.
// Usage: node scripts/review-action.mjs [specs/charge-wave.v1.json]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {Scene,Group} from 'three'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {inspectHumanoidRigs,prepareRig} from '../src/vendor/render-pose.mjs'
import {evaluateAction} from '../src/authoring/quality.mjs'
const path=process.argv[2]??'specs/charge-wave.v1.json',clip=JSON.parse(readFileSync(path,'utf8'))
const out={clip:{id:clip.id,version:clip.version},bodies:{}}
for(const [label,scale,holdFor] of [['small-0.75',.75,2.6],['standard',1,2.6],['tall-1.3',1.3,2.6],['standard-tap',1,.5]]){
 const scene=new Scene(),f=createDetailedPoseFixture(),root=new Group();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);f.idle(0);scene.updateMatrixWorld(true)
 const rig=prepareRig(inspectHumanoidRigs(scene)[0]),t0=performance.now()
 const e=evaluateAction(rig,clip,{hostPose:t=>f.idle(t),holdFor,beamFor:1,charge:Math.min(1,holdFor/2.85)})
 const ms=(performance.now()-t0)/e.frames.length
 out.bodies[label]={score:e.score,msPerFrame:ms,frames:e.frames.length,verdicts:e.verdicts,maxSpeed:e.maxSpeed,maxJump:e.maxJump}
 console.log(label.padEnd(13),'score',e.score,'frames',e.frames.length,'ms/frame',ms.toFixed(2),e.verdicts.filter(v=>v.status!=='pass'&&v.status!=='n/a').map(v=>`${v.status}:${v.metric}=${v.value?.toFixed(1)}`).join(' '))
 f.dispose()
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/'+clip.id+'-review.json',JSON.stringify(out,null,1))
