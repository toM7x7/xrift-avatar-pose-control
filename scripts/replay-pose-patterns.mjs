import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Group,Scene} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {POSE_PATTERN_CATALOG,POSE_PATTERN_CATALOG_NOTES,createPatternCases} from '../src/pose-patterns.mjs'
import {applyDemoHostPose} from '../demo/host-input.mjs'
import {createPatternEngine} from '../demo/pattern-engine.mjs'
import {assessPatternSample} from '../demo/pattern-assessment.mjs'

// Kinematic screening of THREE separate authored fixtures. Scaling is used for
// these fixtures only; this script never reads or modifies a real VRM.
const root=fileURLToPath(new URL('../',import.meta.url)),arg=process.argv.indexOf('--output'),output=path.resolve(root,arg>=0?process.argv[arg+1]:'artifacts/pose-pattern-fixtures.json'),dt=1/60,framesPerCase=24,scales=[.65,1,1.35],cases=createPatternCases({intensity:'standard'})
const sourceFiles=['scripts/replay-pose-patterns.mjs','src/pose-patterns.mjs','demo/pattern-engine.mjs','demo/pattern-assessment.mjs','demo/host-input.mjs','demo/skin-diagnostics.mjs','src/index.mjs','src/nimbus-pose.mjs','src/supported-seat.mjs','src/shoulder-ride.mjs','src/standing.mjs','src/vendor/render-pose.mjs','src/vendor/torso-support.mjs','src/vendor/fixture.mjs','package-lock.json'],hash=b=>createHash('sha256').update(b).digest('hex'),sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await readFile(path.join(root,file)))])))
const statuses=['pass','limited','unsupported','fail'],families=[...new Set(POSE_PATTERN_CATALOG.map(p=>p.family))],maximaKeys=['boneLengthErrorMm','mappedSpanErrorMm','headRotationErrorDegrees','footTargetErrorMm','supportErrorMm','handTargetErrorMm','handPositionErrorMm','carrierHandTargetErrorMm','maxKneeDegrees','neckAngleDegrees','headChestAngleDegrees'],plain=value=>JSON.parse(JSON.stringify(value))
const bonesMatch=snapshot=>snapshot.every(s=>s.bone.position.equals(s.position)&&s.bone.quaternion.equals(s.quaternion)&&s.bone.scale.equals(s.scale)),counts=list=>Object.fromEntries(statuses.map(status=>[status,list.filter(c=>c.assessment.status===status).length]))
function compactFinal(metrics){
 if(!metrics)return null
 const keys=['finite','boneLengthErrorMm','mappedSpanErrorMm','headRotationErrorDegrees','footTargetErrorMm','supportErrorMm','handTargetErrorMm','handPositionErrorMm','carrierHandTargetErrorMm','maxKneeDegrees','neckAngleDegrees','headChestAngleDegrees','supportContactMeasured','visibleSupport','headDriftMm','soleGapProxyMm','anchorMode','handMode','clamped']
 const result=Object.fromEntries([...keys.filter(key=>metrics[key]!==undefined).map(key=>[key,metrics[key]]),['knees',metrics.knees??null],['warnings',metrics.warnings??[]]])
 if(metrics.torsoContact){const contact=metrics.torsoContact,contactKeys=['source','fitted','aligned','withinBoard','chestGapMm','abdomenGapMm','pitchDegrees','revision'];result.torsoContact=Object.fromEntries(contactKeys.filter(key=>contact[key]!==undefined).map(key=>[key,contact[key]]))}
 return result
}
function makeActor(scale,scene){
 const fixture=createPoseFixture(),root=new Group();root.scale.setScalar(scale);root.add(fixture.mesh);scene.add(root);const neutral=captureBones(fixture.skeleton)
 const actor={root,bones:fixture.bones,vrm:null,animate(_time,{seated=false,headYaw=0,headPitch=0}={}){restoreBones(neutral);root.updateWorldMatrix(true,true);applyDemoHostPose(fixture.bones,{seated,headYaw,headPitch});root.updateWorldMatrix(true,true);root.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.skeleton.update()})}}
 return {actor,fixture}
}
const report={schemaVersion:1,experiment:'pose-pattern-authored-fixture-sweep',createdAt:new Date().toISOString(),runnerCompleted:false,runnerErrors:[],input:{intensity:'standard',dtSeconds:dt,framesPerCase,fixtureScales:scales,expectedPatterns:18,expectedCasesPerFixture:324,expectedTotalCases:972,expectedSolveFrames:23328,catalogHash:hash(JSON.stringify(POSE_PATTERN_CATALOG)),casesHash:hash(JSON.stringify(cases)),catalog:plain(POSE_PATTERN_CATALOG),catalogNotes:plain(POSE_PATTERN_CATALOG_NOTES),sourceHashes:null},simulation:{kind:'kinematic-parameter-sweep',forceIntegration:false,supportPerturbationRadians:.025,frameTimes:'frame index / 60, frame=0..23; first=0s, final=23/60s',source:'self-authored fixture only; no real VRM',bodyScalePolicy:'Three separate instances of the authored fixture are scaled before rig preparation. No rider scaling condition is added to the catalog.',restorationScope:'engine capture/restore/isRestored covers actor joints, carrier joints and carrier root transform; actor/carrier joints are also checked separately.',visibleSupportMeasurement:'Final sample only, before restore; posed foot weights >0.5 projected on the reported support normal. This is distinct from joint metric maxima over all 24 frames.',numericPassIsVisualAcceptance:false},fixtures:[],summary:null}
const started=performance.now()
try{
 assert.equal(POSE_PATTERN_CATALOG.length,18);assert.equal(cases.length,324);assert.equal(new Set(cases.map(c=>c.id)).size,cases.length)
 report.input.sourceHashes=await sourceHashes()
 for(const [index,scale]of scales.entries()){
  const scene=new Scene(),{actor,fixture}=makeActor(scale,scene),carrier=createPoseFixture(),carrierRoot=new Group();carrierRoot.add(carrier.mesh);scene.add(carrierRoot);let result
  try{
   const engine=createPatternEngine({actor,scene,carrier,carrierRoot,kind:'fixture'}),fixtureResult={id:'F0'+(index+1),riderFixtureScale:scale,model:plain(engine.model),cases:[],summary:null};result=fixtureResult;report.fixtures.push(fixtureResult)
   assert.equal(engine.model.kind,'fixture');assert.ok(engine.model.visibleFeet,'Authored fixture unexpectedly has no visible foot skin')
   for(const c of cases){
    let snapshot,carrierSnapshot,last=null,error=null,restoreError=null,restored=false,actorRestoredByEngine=null,carrierRestoredByEngine=null,frames=0,finite=true,capturePerformed=false,restorePerformed=false;const maxima={},warnings=new Set()
    try{
     engine.reset(c);snapshot=engine.capture();carrierSnapshot=captureBones(carrier.skeleton);capturePerformed=true
     try{for(let frame=0;frame<framesPerCase;frame++){
      last=engine.solve(c,frame*dt);frames++;finite&&=last.metrics.finite
      for(const key of maximaKeys)if(Number.isFinite(last.metrics[key]))maxima[key]=Math.max(maxima[key]??0,last.metrics[key])
      for(const warning of last.metrics.warnings??[])warnings.add(warning)
     }
      if(last){last.metrics.visibleSupport=engine.measureSupport(c,last);if(c.family==='nimbus')last.metrics.supportContactMeasured=last.metrics.visibleSupport?.feet.every(foot=>foot.gapM!=null)??false}
     }catch(e){error={kind:frames===framesPerCase?'case-support-measurement-exception':'case-solver-exception',message:String(e)}}
     finally{try{engine.restore(snapshot);restorePerformed=true;restored=engine.isRestored(snapshot);actorRestoredByEngine=bonesMatch(snapshot);carrierRestoredByEngine=bonesMatch(carrierSnapshot)}catch(e){restoreError={kind:'case-restore-exception',message:String(e)}}}
    }catch(e){error={kind:'case-setup-exception',message:String(e)}}
    const metrics={...last?.metrics,...maxima,finite:last?finite:false,warnings:[...warnings]},assessment=assessPatternSample({family:c.family,metrics,model:engine.model,restored,error:error?.message??restoreError?.message??null})
    fixtureResult.cases.push({id:c.id,patternId:c.patternId,family:c.family,framesCompleted:frames,capturePerformed,capturedActorBoneCount:snapshot?.length??0,capturedCarrierBoneCount:snapshot?.carrier?.length??0,restorePerformed,restored,actorRestoredByEngine,carrierRestoredByEngine,maxima,final:compactFinal(last?.metrics),warnings:[...warnings],assessment,error,restoreError})
    // Keep the console small while still exposing progress for long CPU runs.
    if(fixtureResult.cases.length%108===0)console.log(JSON.stringify({progress:fixtureResult.id,scale,cases:fixtureResult.cases.length,total:cases.length}))
   }
   assert.equal(fixtureResult.cases.length,cases.length)
   const list=fixtureResult.cases
   fixtureResult.summary={total:list.length,solveFrames:list.reduce((sum,c)=>sum+c.framesCompleted,0),byStatus:counts(list),byFamily:Object.fromEntries(families.map(family=>{const selected=list.filter(c=>c.family===family);return [family,{cases:selected.length,byStatus:counts(selected)}]})),solverExceptions:list.filter(c=>c.error?.kind==='case-solver-exception').length,caseExceptions:list.filter(c=>c.error).length,restoreExceptions:list.filter(c=>c.restoreError).length,engineRestoreMismatches:list.filter(c=>!c.restored).length,actorRestoreMismatches:list.filter(c=>c.actorRestoredByEngine===false).length,carrierRestoreMismatches:list.filter(c=>c.carrierRestoredByEngine===false).length,reasonCounts:Object.fromEntries([...new Set(list.flatMap(c=>c.assessment.reasons))].map(reason=>[reason,list.filter(c=>c.assessment.reasons.includes(reason)).length]))}
   console.log(JSON.stringify({fixtureComplete:fixtureResult.id,scale,...fixtureResult.summary.byStatus,solverExceptions:fixtureResult.summary.solverExceptions}))
  }catch(error){report.runnerErrors.push({kind:'fixture-runner-error',fixture:result?.id??'F0'+(index+1),message:String(error),stack:error.stack})}
  finally{fixture.dispose();carrier.dispose()}
 }
 const all=report.fixtures.flatMap(f=>f.cases),endHashes=await sourceHashes();report.input.sourceHashesAfter=endHashes;report.input.sourceChangedDuringRun=JSON.stringify(endHashes)!==JSON.stringify(report.input.sourceHashes)
 if(report.input.sourceChangedDuringRun)report.runnerErrors.push({kind:'source-changed-during-run',message:'Source files changed while this CPU sweep was running; repeat after edits settle.'})
 assert.equal(report.fixtures.length,3);assert.equal(all.length,report.input.expectedTotalCases)
 report.summary={totalCases:all.length,solveFrames:all.reduce((sum,c)=>sum+c.framesCompleted,0),byStatus:counts(all),byFamily:Object.fromEntries(families.map(family=>{const list=all.filter(c=>c.family===family);return [family,{cases:list.length,byStatus:counts(list)}]})),solverExceptions:all.filter(c=>c.error?.kind==='case-solver-exception').length,caseExceptions:all.filter(c=>c.error).length,restoreExceptions:all.filter(c=>c.restoreError).length,engineRestoreMismatches:all.filter(c=>!c.restored).length,actorRestoreMismatches:all.filter(c=>c.actorRestoredByEngine===false).length,carrierRestoreMismatches:all.filter(c=>c.carrierRestoredByEngine===false).length,reasonCounts:Object.fromEntries([...new Set(all.flatMap(c=>c.assessment.reasons))].map(reason=>[reason,all.filter(c=>c.assessment.reasons.includes(reason)).length])),durationSeconds:(performance.now()-started)/1000,visualReview:'not-performed',realVrmVerification:'not-performed'}
 report.runnerCompleted=report.runnerErrors.length===0
}catch(error){report.runnerErrors.push({kind:'runner-error',message:String(error),stack:error.stack})}
finally{
 if(!report.runnerCompleted)process.exitCode=1
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8')
 console.log(JSON.stringify({runnerCompleted:report.runnerCompleted,runnerErrors:report.runnerErrors,summary:report.summary,report:path.relative(root,output).replaceAll('\\','/')},null,2))
}
