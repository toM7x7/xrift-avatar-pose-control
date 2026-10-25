import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Group,PerspectiveCamera,Quaternion,Scene,Vector3} from 'three'
import {attachPoseDriver,prepareHumanoidRig} from '../src/index.mjs'
import {createRideDynamics,stepRideDynamics} from '../src/ride-dynamics.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {applyDemoHostPose} from '../demo/host-input.mjs'
import {measureSkinDiagnostics} from '../demo/skin-diagnostics.mjs'

// CPU replay of the same render transaction, calibration and one-frame COM
// feedback as the local demo. No private VRM, browser, camera following or upload.
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),argument=(key,fallback)=>{const i=args.indexOf(key);return i>=0?args[i+1]:fallback}
const profilePath=path.resolve(root,argument('--profile','specs/n02-normal-flight.v1.json')),outputPath=path.resolve(root,argument('--output','artifacts/n02-normal-flight-v1.json'))
let dt=1/120,duration=14.5
const sourceFiles=['scripts/replay-n02-profile.mjs','src/index.mjs','src/ride-dynamics.mjs','src/nimbus-pose.mjs','src/standing.mjs','src/vendor/render-pose.mjs','src/vendor/fixture.mjs','demo/host-input.mjs','demo/skin-diagnostics.mjs']
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),point=b=>b.getWorldPosition(new Vector3()),vector=a=>new Vector3().fromArray(a),finiteTree=(value,label='value')=>{
 if(typeof value==='number'){assert.ok(Number.isFinite(value),`${label} is not finite`);return}
 if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))finiteTree(child,`${label}.${key}`)
}
const localTransforms=skeleton=>skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
const pairs=['left','right'].flatMap(s=>[[s+'UpperLeg',s+'LowerLeg'],[s+'LowerLeg',s+'Foot'],[s+'UpperArm',s+'LowerArm'],[s+'LowerArm',s+'Hand']])
const boneLengths=b=>pairs.map(([a,z])=>point(b[a]).distanceTo(point(b[z])))
const report={kind:'n02-adopted-profile-cpu-replay',version:1,createdAt:new Date().toISOString(),input:null,environment:{node:process.version,dtSeconds:dt,durationSeconds:duration,fixture:'authored-pose-test-body',privateVrmRequired:false,renderMode:'CPU scene onBeforeRender/onAfterRender transaction; no pixels rendered'},calibration:null,checkpoints:[],checks:{},extrema:{footTargetErrorMm:0,boneLengthErrorMm:0,actualSkinSoleGapMm:0,headUpDotWorld:1,headRotationErrorDegrees:0,maxKneeDegrees:0,footNormalErrorDegrees:0,centerOfMassErrorMm:0,peakSpeedMps:0,peakVerticalSpeedMps:0,peakPitchRadians:0,peakRollRadians:0},limits:{poseLimitedFrames:0,poseLimitReasons:{},hipBalanceLimitedFrames:0,supportExceededFrames:0,zmpInvalidFrames:0},limitations:['Self-authored fixture numerical replay only; no new real-VRM or visual acceptance.','COM/ZMP and sole normals are model proxies, not measured contact forces or full-body rigid-body physics.','Rotational point acceleration, collision, tracking, XRift, Quest and multi-user synchronization are unverified.'],success:false}
let fixture,driver,scene,camera,actor,rideState,options={},neutral,referenceLengths,anchorsLocal,supportOriginLocal,supportOriginWorldBase,soleOffset,latest,steps=0
try{
 const profileBytes=await readFile(profilePath),profile=JSON.parse(profileBytes)
 assert.equal(profile.id,'n02-normal-flight','Unexpected profile id');assert.equal(profile.version,'1.0.0','Unexpected profile version');assert.equal(profile.status,'adopted-local-baseline','Profile is not the adopted local baseline');assert.ok(profile.dynamics&&profile.pose&&Array.isArray(profile.sequence)&&profile.sequence.length,'Missing profile sections')
 assert.ok(profile.calibration&&profile.replay&&profile.acceptance,'Missing calibration/replay/acceptance');dt=profile.replay.stepSeconds;duration=profile.replay.durationSeconds+profile.replay.settleSeconds;assert.ok(Number.isFinite(dt)&&dt>0&&Number.isFinite(duration)&&duration>0,'Invalid replay timing');assert.ok(Math.abs(duration/dt-Math.round(duration/dt))<1e-6,'Replay duration must cover whole frames');report.environment.dtSeconds=dt;report.environment.durationSeconds=duration
 let previousUntil=0
 for(const section of profile.sequence){assert.ok(Number.isFinite(section.until)&&section.until>previousUntil,'Sequence until must increase');assert.ok(section.controls&&typeof section.controls==='object','Missing sequence controls');previousUntil=section.until}
 assert.equal(previousUntil,profile.replay.durationSeconds,'Sequence duration differs from replay duration')
 report.input={profilePath:path.relative(root,profilePath).replaceAll('\\','/'),profileSha256:sha(profileBytes),profile:structuredClone(profile),sourceSha256:Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha(await readFile(path.join(root,file)))])))}
 scene=new Scene();camera=new PerspectiveCamera();camera.position.set(3,3,4);scene.add(camera)
 fixture=createPoseFixture();const actorRoot=new Group();actorRoot.add(fixture.mesh);scene.add(actorRoot);actor={root:actorRoot,bones:fixture.bones,fixture}
 neutral=captureBones(fixture.skeleton);scene.updateMatrixWorld(true)
 const rig=prepareHumanoidRig({mesh:fixture.mesh,bones:fixture.bones}),related=[];actor.root.traverse(mesh=>{if(mesh.isSkinnedMesh&&!related.includes(mesh.skeleton))related.push(mesh.skeleton)})
 driver=attachPoseDriver({scene,rig,relatedSkeletons:related,getOptions:()=>options})
 const cameraHost={position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},initialHeading=profile.dynamics.initialHeading??profile.dynamics.heading??0
 rideState=createRideDynamics({...profile.dynamics,initialHeading})
 const calibration=profile.calibration,legLength=side=>point(fixture.bones[side+'UpperLeg']).distanceTo(point(fixture.bones[side+'LowerLeg']))+point(fixture.bones[side+'LowerLeg']).distanceTo(point(fixture.bones[side+'Foot'])),rideScale=(legLength('left')+legLength('right'))/2/calibration.referenceLegLengthM
 rideState=createRideDynamics({...profile.dynamics,initialHeading,comHeightM:calibration.initialComHeightPerScaleM*rideScale,supportHalfLengthM:calibration.initialSupportHalfLengthPerScaleM*rideScale,supportHalfWidthM:calibration.initialSupportHalfWidthPerScaleM*rideScale})
 function hostInput(){
  restoreBones(neutral);actor.root.position.fromArray(rideState.position);actor.root.quaternion.setFromAxisAngle(new Vector3(0,1,0),rideState.heading);actor.root.updateWorldMatrix(true,true);applyDemoHostPose(fixture.bones,{seated:true,headYaw:0,headPitch:0});related.forEach(s=>s.update());actor.root.updateWorldMatrix(true,true)
 }
 function frameDefinition(){return {position:supportOriginWorldBase.clone().add(vector(rideState.position)).toArray(),quaternion:[...rideState.supportQuaternion]}}
 function platformPoint(local){return vector(local).sub(supportOriginLocal).applyQuaternion(new Quaternion().fromArray(rideState.supportQuaternion)).add(supportOriginWorldBase).add(vector(rideState.position))}
 function poseOptions(){
  const p=rideState.pose,result={...profile.pose,heading:rideState.heading,preserveHands:false,supportSoleOffsetM:soleOffset??0,balance:{leanForward:p.balanceLeanForward,leanSide:p.balanceLeanSide,crouch:Math.min(1,profile.pose.crouch+p.crouch-.45),centerOfMassOffset:p.centerOfMassOffset,loadRatio:p.loadRatio,forwardAcceleration:p.tangentForwardAcceleration??p.forwardAcceleration,lateralAcceleration:p.tangentLateralAcceleration??p.lateralAcceleration,verticalAcceleration:p.verticalAcceleration,normalLoadRatio:p.normalLoadRatio,effectiveGravityMps2:p.effectiveGravityMps2,supportState:p.supportState,zmpValid:p.zmpValid,zmpInvalidReason:p.zmpInvalidReason,verticalCompression:p.verticalCompression}}
  if(anchorsLocal){result.supportFrame=frameDefinition();result.footTargetsWorld=anchorsLocal.map(p=>platformPoint(p).toArray())}
  return result
 }
 function renderTransaction(measureSkin=false){
  // WebGLRenderer normally runs this scene update before the hooks. In
  // particular, SkinnedMesh.bindMatrixInverse must follow moved actor roots.
  hostInput();scene.updateMatrixWorld(true);const host=localTransforms(fixture.skeleton);options=poseOptions();scene.onBeforeRender(null,scene,camera)
  try{
   assert.equal(driver.error,null,driver.error??'Pose driver failed');assert.ok(driver.last,'No pose metrics');const metrics=structuredClone(driver.last),actualLengths=boneLengths(fixture.bones),limbLengthErrorMm=referenceLengths?Math.max(...actualLengths.map((length,i)=>Math.abs(length-referenceLengths[i])*1000)):0,skin=measureSkin?measureSkinDiagnostics(actor,{supportFrame:anchorsLocal?frameDefinition():undefined}):null
   return {metrics,limbLengthErrorMm,skin}
  }finally{scene.onAfterRender(null,scene,camera);assert.ok(driver.restored,'Pose did not restore after render');assert.deepEqual(localTransforms(fixture.skeleton),host,'Host local transforms were not restored');assert.deepEqual(camera.position.toArray(),cameraHost.position,'Camera position changed');assert.deepEqual(camera.quaternion.toArray(),cameraHost.quaternion,'Camera quaternion changed')}
 }
 hostInput();referenceLengths=boneLengths(fixture.bones)
 const initial=renderTransaction(true),offsets=initial.skin.feet.map(f=>f.soleOffsetNormalM??f.soleOffsetM).filter(Number.isFinite)
 assert.equal(offsets.length,2,'Fixture must provide two skinned soles');soleOffset=Math.max(...offsets)
 assert.ok(Math.abs(soleOffset-calibration.fixtureSoleOffsetM)<1e-6,'Authored fixture sole offset changed')
 anchorsLocal=initial.metrics.footTargetsWorld.map(p=>vector(p).sub(vector(rideState.position)).applyAxisAngle(new Vector3(0,1,0),-rideState.heading).toArray())
 supportOriginLocal=vector(anchorsLocal[0]).add(vector(anchorsLocal[1])).multiplyScalar(.5);supportOriginLocal.y-=soleOffset;supportOriginWorldBase=supportOriginLocal.clone().applyAxisAngle(new Vector3(0,1,0),rideState.heading)
 const comHeight=initial.metrics.balanceProxy.centerOfMassWorld[1]-initial.metrics.supportHeight+soleOffset
 rideState=createRideDynamics({...rideState.config,initialHeading:rideState.heading,comHeightM:Math.max(.15,comHeight),supportHalfLengthM:Math.max(calibration.minimumSupportHalfLengthM,Math.abs(anchorsLocal[0][2]-anchorsLocal[1][2])*.5+calibration.supportLengthPaddingPerScaleM*rideScale),supportHalfWidthM:Math.max(calibration.minimumSupportHalfWidthM,Math.abs(anchorsLocal[0][0]-anchorsLocal[1][0])*.5+calibration.supportWidthPaddingPerScaleM*rideScale)})
 report.calibration={method:'Initial posed skin soles, foot anchors and weighted-bone COM proxy; same formulas as local demo',rideScale,soleOffsetM:soleOffset,anchorsLocal,supportOriginLocal:supportOriginLocal.toArray(),supportOriginWorldBase:supportOriginWorldBase.toArray(),initialCenterOfMassWorld:initial.metrics.balanceProxy.centerOfMassWorld,comHeightM:comHeight,footHull2D:initial.metrics.balanceProxy.footHull2D,resolvedDynamics:structuredClone(rideState.config)}
 const a=profile.acceptance,thresholds={footTargetErrorMm:a.footTargetErrorMaxMm,boneLengthErrorMm:a.boneLengthErrorMaxMm,actualSkinSoleGapMm:a.visibleSoleMinGapAbsMaxMm,headUpDotWorld:a.fixtureHeadUpDotMin,headRotationErrorDegrees:a.headInputRotationErrorMaxDegrees,maxKneeDegrees:profile.pose.maxKneeDegrees+a.kneeLimitToleranceDegrees,footNormalErrorDegrees:a.footNormalProxyErrorMaxDegrees,finalSpeedMps:a.stoppedSpeedMaxMps,finalAttitudeRadians:a.stoppedTiltMaxRadians}
 report.thresholds=thresholds
 function verify(result,time){
  const m=result.metrics,p=rideState.pose,e=report.extrema
  finiteTree(rideState,'dynamics');finiteTree(m,'pose')
  e.footTargetErrorMm=Math.max(e.footTargetErrorMm,m.footTargetErrorMm);e.boneLengthErrorMm=Math.max(e.boneLengthErrorMm,m.boneLengthErrorMm,result.limbLengthErrorMm,...(m.armBalance??[]).map(arm=>arm.boneLengthErrorMm));e.headUpDotWorld=Math.min(e.headUpDotWorld,m.headUpDotWorld);e.headRotationErrorDegrees=Math.max(e.headRotationErrorDegrees,m.headRotationErrorDegrees);e.maxKneeDegrees=Math.max(e.maxKneeDegrees,...m.knees);e.footNormalErrorDegrees=Math.max(e.footNormalErrorDegrees,...m.footSoleNormalErrorDegrees);e.centerOfMassErrorMm=Math.max(e.centerOfMassErrorMm,m.balanceProxy.centerOfMassErrorMm);e.peakSpeedMps=Math.max(e.peakSpeedMps,p.totalSpeed);e.peakVerticalSpeedMps=Math.max(e.peakVerticalSpeedMps,Math.abs(p.verticalSpeed));e.peakPitchRadians=Math.max(e.peakPitchRadians,Math.abs(rideState.attitude.pitch));e.peakRollRadians=Math.max(e.peakRollRadians,Math.abs(rideState.attitude.roll))
  if(result.skin)for(const foot of result.skin.feet){assert.ok(Number.isFinite(foot.supportGapM),'Skinned sole support gap unavailable');e.actualSkinSoleGapMm=Math.max(e.actualSkinSoleGapMm,Math.abs(foot.supportGapM)*1000)}
  if(m.poseLimited){report.limits.poseLimitedFrames++;for(const reason of m.poseLimitReasons)report.limits.poseLimitReasons[reason]=(report.limits.poseLimitReasons[reason]??0)+1}
  if(m.bodyBalance.hipBalanceLimited)report.limits.hipBalanceLimitedFrames++;if(m.balanceProxy.supportExceeded)report.limits.supportExceededFrames++;if(!m.balanceProxy.zmpValid)report.limits.zmpInvalidFrames++
  assert.ok(e.footTargetErrorMm<thresholds.footTargetErrorMm,`Foot target error at t=${time}`);assert.ok(e.boneLengthErrorMm<thresholds.boneLengthErrorMm,`Bone length error at t=${time}`);assert.ok(e.headUpDotWorld>thresholds.headUpDotWorld,`Head up policy at t=${time}`);assert.ok(e.headRotationErrorDegrees<thresholds.headRotationErrorDegrees,`Head input rotation at t=${time}`);assert.ok(e.maxKneeDegrees<=thresholds.maxKneeDegrees,`Knee policy at t=${time}`);assert.ok(e.actualSkinSoleGapMm<thresholds.actualSkinSoleGapMm,`Skinned sole gap at t=${time}`);assert.ok(e.footNormalErrorDegrees<thresholds.footNormalErrorDegrees,`Foot normal at t=${time}`)
 }
 function checkpoint(time,controls,segment,result){
  const m=result.metrics
  report.checkpoints.push({timeSeconds:time,segment,controls,position:[...rideState.position],velocity:[...rideState.velocity],acceleration:[...rideState.acceleration],heading:rideState.heading,attitude:structuredClone(rideState.attitude),supportFrame:frameDefinition(),dynamicsPose:structuredClone(rideState.pose),pose:{feetWorld:m.feetWorld,footTargetsWorld:m.footTargetsWorld,footTargetErrorMm:m.footTargetErrorMm,boneLengthErrorMm:Math.max(m.boneLengthErrorMm,result.limbLengthErrorMm),headUpDotWorld:m.headUpDotWorld,headRotationErrorDegrees:m.headRotationErrorDegrees,knees:m.knees,footSoleNormalErrorDegrees:m.footSoleNormalErrorDegrees,bodyBalance:m.bodyBalance,verticalBody:m.verticalBody,balanceProxy:m.balanceProxy,poseLimited:m.poseLimited,poseLimitReasons:m.poseLimitReasons},actualSkinSoles:result.skin?.feet.map(f=>({side:f.side,weightedVertexCount:f.weightedVertexCount,soleOffsetNormalM:f.soleOffsetNormalM,supportGapM:f.supportGapM}))??null})
 }
 latest=renderTransaction(true);verify(latest,0);checkpoint(0,{brake:1},0,latest)
 const checkpointFrames=new Set([.5,1,2,3,4,5,6,7,8,9,10,11,12,14,14.5].map(t=>Math.round(t/dt))),frames=Math.round(duration/dt)
 for(let frame=1;frame<=frames;frame++){
  const time=frame*dt,segment=profile.sequence.findIndex(s=>time<s.until),section=profile.sequence[segment<0?profile.sequence.length-1:segment],controls={...section.controls},observed=latest.metrics.balanceProxy,observedComHeightM=observed.comHeightM??vector(observed.centerOfMassWorld).sub(vector(frameDefinition().position)).dot(vector(rideState.supportFrame.normal))
  rideState=stepRideDynamics(rideState,{...controls,observedComHeightM},dt);latest=renderTransaction(checkpointFrames.has(frame));steps++
  verify(latest,time);if(checkpointFrames.has(frame))checkpoint(time,controls,segment<0?profile.sequence.length-1:segment,latest)
 }
 assert.ok(rideState.pose.totalSpeed<thresholds.finalSpeedMps,'Final velocity did not converge');assert.ok(Math.abs(rideState.attitude.pitch)<thresholds.finalAttitudeRadians,'Final pitch did not settle');assert.ok(Math.abs(rideState.attitude.roll)<thresholds.finalAttitudeRadians,'Final bank did not settle')
 report.checks={finiteEveryFrame:true,footTargetsWithinProfileTolerance:true,boneLengthsWithinProfileTolerance:true,headUpWithinProfileTolerance:true,headInputRotationWithinProfileTolerance:true,kneesWithinProfileTolerance:true,skinnedSolesWithinProfileToleranceAtCheckpoints:true,footNormalsWithinProfileTolerance:true,restoredEveryFrame:true,cameraUnchanged:true,finalVelocitySettled:true,finalAttitudeSettled:true};report.final={timeSeconds:duration,position:[...rideState.position],velocity:[...rideState.velocity],attitude:structuredClone(rideState.attitude),estimatedComHeightM:rideState.estimatedComHeightM};report.success=true
}catch(error){report.failure={message:error.message,stack:error.stack,steps,timeSeconds:steps*dt};process.exitCode=1}
finally{
 report.frames=steps;driver?.dispose();fixture?.dispose();await mkdir(path.dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(report,null,2)+'\n','utf8')
 console.log(JSON.stringify({success:report.success,profile:report.input?.profile.id,version:report.input?.profile.version,frames:report.frames,checkpoints:report.checkpoints.length,extrema:report.extrema,limits:report.limits,failure:report.failure?.message??null,report:path.relative(root,outputPath).replaceAll('\\','/')},null,2))
}
