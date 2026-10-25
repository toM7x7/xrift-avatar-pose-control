async (page) => {
 // Playwright CLI run-code function. Select the local VRMs in patterns.html first.
 // Optional window.__posePatternRunConfig: {intensities:['stress'],
 // baselineViews:['front','side'],representativeViews:['front','side','orbit'],
 // maxExtraCasesPerRun:6,maxExtraCasesPerPattern:1,runLabel:'run-01'}.
 // All reports/captures stay below the ignored private directory. This is a
 // numerical kinematic support sweep, not rigid-body contact or visual approval.
 const startedAt=new Date().toISOString(),baseDirectory='local-assets/pattern-sim-2026-10-25'
 const pageErrors=[],nonGetRequests=[],runs=[],executionErrors=[],captureIndex=[],independentFindings=[]
 const privateTerms=(await page.locator('#vrm').evaluate(el=>Array.from(el.files??[],f=>f.name))).flatMap(name=>[name,name.replace(/\.vrma?$/i,'')]).filter(name=>name.length>3)
 const redact=value=>{
  let text=String(value)
  for(const term of privateTerms)if(term&&term.length>3)text=text.split(term).join('[private-vrm]')
  return text.replace(/(?:[A-Za-z]:[\\/]+Users[\\/]+|\/(?:Users|home)\/)[^\s"'<>]+/g,'[private-home-path]')
   .replace(/[^\s"'<>\\/]+\.vrma?\b/gi,'[private-vrm]')
 }
 const privateKeys=/^(?:fileName|filename|sourceFile|sourceFileName|sourcePath|absolutePath|author|authors|contactInformation|otherLicenseUrl|otherPermissionUrl|accessToken|apiKey|password|stack)$/i
 const scrub=value=>Array.isArray(value)?value.map(scrub):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!privateKeys.test(key)).map(([key,child])=>[key,scrub(child)])):typeof value==='string'?redact(value):value
 const onError=error=>pageErrors.push(redact(error.message)),onRequest=request=>{
  if(request.method()!=='GET')nonGetRequests.push({method:request.method(),resourceType:request.resourceType()})
 }
 const assert=(ok,message)=>{if(!ok)throw Error(message)}
 const safeId=value=>String(value).replace(/[^A-Za-z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,100)||'case'
 const modelSummary=(model,id)=>{
  const result={anonymousId:id,kind:model?.kind,vertexCount:model?.vertexCount,visibleFeet:model?.visibleFeet}
  for(const key of ['meshCount','skinCount','humanoidRoleCount','legLengthM','vrmGeneration','specVersion','footWeightedVertexCounts','visibleFootVertexCounts','soleOffsetM'])if(model?.[key]!==undefined)result[key]=scrub(model[key])
  return result
 }
 const fingerprint=model=>JSON.stringify(modelSummary(model,'current'))
 const checkModel=(state,expected,where)=>{
  assert(state?.model?.kind==='local-vrm',where+': expected a loaded local VRM, not the fixture')
  assert(Number.isFinite(state.model.vertexCount)&&state.model.vertexCount>0,where+': missing model vertex diagnostic')
  assert(typeof state.model.visibleFeet==='boolean',where+': missing visible-foot diagnostic')
  assert(state.modelGeneration===expected.generation,where+': model generation changed')
  assert(fingerprint(state.model)===expected.fingerprint,where+': model diagnostics changed')
 }
 const frameSettle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const apiState=()=>page.evaluate(()=>window.__posePatternExperiment.getState())
 const progress=async value=>page.evaluate(value=>{window.__posePatternRunnerProgress=value},scrub(value))
 const config=await page.evaluate(()=>window.__posePatternRunConfig??{})
 const intensities=Array.isArray(config.intensities)&&config.intensities.length?config.intensities:['stress']
 const views=(value,fallback)=>Array.isArray(value)&&value.length?value.filter(v=>['front','side','back','orbit'].includes(v)):fallback
 const baselineViews=views(config.baselineViews,['front','side']),representativeViews=views(config.representativeViews,['front','side','orbit'])
 const maxExtra=Number.isInteger(config.maxExtraCasesPerRun)&&config.maxExtraCasesPerRun>=0?config.maxExtraCasesPerRun:6
 const maxPerPattern=Number.isInteger(config.maxExtraCasesPerPattern)&&config.maxExtraCasesPerPattern>=0?config.maxExtraCasesPerPattern:1
 const outputDirectory=baseDirectory+(config.runLabel?'/'+safeId(config.runLabel):'')
 const isBaseline=item=>item.isBaseline===true||item.condition?.isBaseline===true||item.condition?.baseline===true||item.condition?.variantId==='base'||/^(?:baseline|neutral|default)$/i.test(String(item.condition?.variant??item.condition?.scenario??item.condition??''))
 const rank=item=>({fail:300,limited:200,unsupported:100,pass:0}[item.assessment.status]??-1)+(item.assessment.reasons?.length??0)
 const pickContinuousCases=cases=>{
  const groups=new Map(),selected=[]
  for(const item of cases){if(!groups.has(item.patternId))groups.set(item.patternId,[]);groups.get(item.patternId).push(item)}
  for(const [patternId,items]of groups){
   const base=items.find(isBaseline)??items[0]
   selected.push({caseId:base.id,patternId,role:'baseline'})
   const worst=items.filter(item=>item.id!==base.id).sort((a,b)=>rank(b)-rank(a)||Number(b.condition?.stressOnly===true)-Number(a.condition?.stressOnly===true))[0]
   if(worst)selected.push({caseId:worst.id,patternId,role:'worst-screen-assessment',assessment:scrub(worst.assessment)})
  }
  return selected
 }
 const pickCaptures=(cases,knownCases,intensity)=>{
  const byPattern=new Map(),baseline=[],candidates=[]
  let eligibleExtraCases=0
  for(const item of cases){const merged={...knownCases.find(c=>c.id===item.id),...item};if(!byPattern.has(item.patternId))byPattern.set(item.patternId,[]);byPattern.get(item.patternId).push(merged)}
  for(const [patternId,items]of byPattern){
   const explicit=items.find(isBaseline),selected=explicit??items[0]
   baseline.push({item:selected,role:'baseline',selection:explicit?'explicit-baseline':'first-reported-condition-fallback',views:baselineViews})
   const extras=items.filter(c=>c.id!==selected.id&&['limited','fail'].includes(c.assessment.status)),stressExtras=extras.filter(c=>c.condition?.stressOnly===true)
   eligibleExtraCases+=extras.length
   const pool=intensity==='stress'&&stressExtras.length?stressExtras:extras
   for(const item of pool.sort((a,b)=>rank(b)-rank(a)))candidates.push({item,role:'assessment-representative',selection:intensity==='stress'&&stressExtras.length?'stress-only-assessment-representative':'assessment-representative',views:representativeViews})
  }
  candidates.sort((a,b)=>rank(b.item)-rank(a.item)||String(a.item.patternId).localeCompare(String(b.item.patternId)))
  const chosen=[],counts=new Map(),families=new Set()
  for(const broadCoverage of [true,false])for(const entry of candidates){
   const id=entry.item.patternId,count=counts.get(id)??0
   if(chosen.includes(entry)||chosen.length>=maxExtra||count>=maxPerPattern||broadCoverage&&families.has(entry.item.family))continue
   counts.set(id,count+1);families.add(entry.item.family);chosen.push(entry)
  }
  return {entries:[...baseline,...chosen],patternCount:byPattern.size,baselineCount:baseline.length,eligibleExtraCases,representativePoolCases:candidates.length,selectedExtraCases:chosen.length,omittedExtraCases:eligibleExtraCases-chosen.length,selectionPolicy:'Severity order with family coverage; stress-only limitations/failures preferred when available.'}
 }
 const recordRun=async(report,{id,intensity,mode,loaded,expected,requestedCaseIds})=>{
  checkModel({model:report.model,modelGeneration:report.modelGeneration},expected,id+' '+mode+' report')
  checkModel(await apiState(),expected,id+' '+mode+' completed')
  assert(Array.isArray(report.cases)&&report.cases.length>0,id+' '+mode+': sweep returned no conditions')
  const counts={pass:0,limited:0,unsupported:0,fail:0},ids=new Set()
  for(const item of report.cases){
   assert(typeof item.id==='string'&&item.id&&!ids.has(item.id),id+': missing or duplicate case id');ids.add(item.id)
   assert(typeof item.patternId==='string'&&item.patternId,id+': missing pattern id')
   assert(Object.hasOwn(counts,item.assessment?.status),id+': missing assessment status')
   assert(Array.isArray(item.assessment.reasons),id+': missing assessment reasons')
   counts[item.assessment.status]++
   const nonfinite=[]
   const checkFinite=(value,key)=>{if(typeof value==='number'&&!Number.isFinite(value))nonfinite.push(key);else if(Array.isArray(value))value.forEach((v,i)=>checkFinite(v,key+'['+i+']'));else if(value&&typeof value==='object')Object.entries(value).forEach(([name,v])=>checkFinite(v,key+'.'+name))}
   checkFinite(item.metrics,'metrics')
   if(nonfinite.length)independentFindings.push({modelId:id,intensity,mode,caseId:item.id,kind:'nonfinite-metric-values',metricPaths:nonfinite,assessment:item.assessment.status})
   if((item.restored===false||item.metrics?.finite===false||item.error)&&item.assessment.status!=='fail')independentFindings.push({modelId:id,intensity,mode,caseId:item.id,kind:'assessment-does-not-report-solver-or-restoration-failure',assessment:item.assessment.status})
  }
  if(requestedCaseIds)assert(ids.size===requestedCaseIds.length&&requestedCaseIds.every(caseId=>ids.has(caseId)),id+': continuous sweep did not return exactly the selected screen conditions')
  const run={modelId:id,intensity,mode,model:modelSummary(loaded.model,id),modelGeneration:expected.generation,numericCaseCount:report.cases.length,assessmentCounts:counts,report:scrub({...report,model:modelSummary(report.model,id)}),requestedCaseIds:requestedCaseIds??null,captures:[],visualReview:{status:'pending-independent-review',allNumericCasesVisuallyReviewed:false}}
  runs.push(run);return run
 }
 page.on('pageerror',onError);page.on('request',onRequest)
 let models=[],catalog=null
 try{
  assert(intensities.every(value=>['standard','stress'].includes(value)),'Unknown sweep intensity')
  assert(baselineViews.length&&representativeViews.length,'At least one valid capture view is required')
  assert(new URL(page.url()).pathname.endsWith('/patterns.html'),'Open the local patterns.html page before running this function')
  await page.setViewportSize({width:1440,height:1100})
  await page.waitForFunction(()=>window.__posePatternExperiment&&['runSweep','renderCase','getState','listCases','getCatalog'].every(key=>typeof window.__posePatternExperiment[key]==='function'))
  models=await page.locator('#localModels option').evaluateAll(options=>options.filter(option=>!option.disabled&&option.value!=='').map((option,index)=>({value:option.value,index})))
  assert(models.length>0,'Select local VRM files first; this runner does not fetch models')
  catalog=scrub(await page.evaluate(()=>window.__posePatternExperiment.getCatalog()))
  for(const selected of models){
   const id='A'+String(selected.index+1).padStart(2,'0'),capturedCases=new Map()
   try{
    const before=await apiState(),alreadyLoaded=before.ready===true&&!before.loading&&before.selectedModelIndex===selected.index&&before.model?.kind==='local-vrm'
    if(!alreadyLoaded)await page.locator('#localModels').selectOption(selected.value)
    await page.waitForFunction(({index,previousGeneration,alreadyLoaded})=>{
     const state=window.__posePatternExperiment.getState()
     return state?.ready===true&&state.loading!==true&&state.selectedModelIndex===index&&state.model?.kind==='local-vrm'&&Number.isFinite(state.modelGeneration)&&(alreadyLoaded||state.modelGeneration>previousGeneration)
    },{index:selected.index,previousGeneration:Number.isFinite(before.modelGeneration)?before.modelGeneration:-1,alreadyLoaded},{timeout:120000})
    await frameSettle()
    const loaded=await apiState(),expected={generation:loaded.modelGeneration,fingerprint:fingerprint(loaded.model)}
    checkModel(loaded,expected,id+' loaded')
    for(const intensity of intensities){
     await progress({phase:'sweep',mode:'screen',modelId:id,intensity,completedRuns:runs.length,totalModels:models.length})
     const report=await page.evaluate(async intensity=>window.__posePatternExperiment.runSweep({intensity,mode:'screen'}),intensity)
     const run=await recordRun(report,{id,intensity,mode:'screen',loaded,expected})
     const continuousSelection=pickContinuousCases(report.cases),requestedCaseIds=continuousSelection.map(item=>item.caseId)
     run.continuousSelection=continuousSelection
     await progress({phase:'sweep',mode:'continuous',modelId:id,intensity,selectedCases:requestedCaseIds.length,completedRuns:runs.length,totalModels:models.length})
     const continuousReport=await page.evaluate(async ({intensity,caseIds})=>window.__posePatternExperiment.runSweep({intensity,mode:'continuous',caseIds}),{intensity,caseIds:requestedCaseIds})
     const continuousRun=await recordRun(continuousReport,{id,intensity,mode:'continuous',loaded,expected,requestedCaseIds})
     continuousRun.selectionPolicy='Screen baseline plus the most severe other condition per pattern; stress-only cases win ties.'
     const knownCases=await page.evaluate(()=>window.__posePatternExperiment.listCases()),plan=pickCaptures(report.cases,Array.isArray(knownCases)?knownCases:knownCases.cases??[],intensity)
     run.captureSelection={...plan,entries:undefined}
     for(const entry of plan.entries){
      const {item}=entry,{intensity:ignoredIntensity,...condition}=item.condition??{},signature=JSON.stringify({pattern:item.patternId,id:item.id,condition,options:item.options??null})
      if(capturedCases.has(signature)){run.captures.push({...capturedCases.get(signature),reusedFromEarlierIntensity:true});continue}
      const record={caseId:item.id,patternId:item.patternId,family:item.family,role:entry.role,selection:entry.selection,assessment:scrub(item.assessment),continuousAssessment:scrub(continuousReport.cases.find(c=>c.id===item.id)?.assessment??null),images:[]}
      for(const view of entry.views){
       await progress({phase:'capture',modelId:id,intensity,caseId:item.id,view,completedImages:captureIndex.length})
       const rendered=await page.evaluate(async ({caseId,view})=>window.__posePatternExperiment.renderCase(caseId,{view}),{caseId:item.id,view})
       checkModel(rendered,expected,id+' '+item.id+' '+view+' render')
       assert((rendered.caseId??rendered.case?.id??rendered.id)===item.id,id+': renderCase returned a different condition')
       await frameSettle()
       const current=await apiState();checkModel(current,expected,id+' '+item.id+' '+view+' screenshot')
       assert(current.ready===true&&!current.loading&&!current.current?.error,id+': display is not ready for a screenshot')
       assert((current.caseId??current.case?.id??current.id)===item.id,id+': displayed condition changed before screenshot')
       if(Number.isFinite(rendered.current?.time))assert(current.current?.time===rendered.current.time,id+': displayed simulation sample changed before screenshot')
       const capturePath=outputDirectory+'/'+id+'/'+intensity+'/'+safeId(item.patternId)+'--'+safeId(item.id)+'--'+view+'.png'
       await page.screenshot({path:capturePath,animations:'disabled',mask:[page.locator('[data-private-model]'),page.locator('#vrm'),page.locator('#localModels')],maskColor:'#181a1f'})
       // renderCase measures skin vertices at the fixed final sample. The
       // animation loop may replace current on later frames, so keep that
       // measured return value and separately record the pre-capture guards.
       const capture={path:capturePath,view,modelId:id,modelGeneration:expected.generation,model:modelSummary(current.model,id),caseId:item.id,renderedState:scrub({...rendered,model:modelSummary(rendered.model,id)}),screenshotGuard:{ready:current.ready,caseId:current.caseId,modelGeneration:current.modelGeneration,sampleTimeSeconds:current.current?.time??null}}
       record.images.push(capture);captureIndex.push({path:capturePath,modelId:id,intensity,patternId:item.patternId,caseId:item.id,view,role:entry.role,assessment:item.assessment.status})
      }
      run.captures.push(record);capturedCases.set(signature,record)
     }
    }
   }catch(error){executionErrors.push({modelId:id,message:redact(error.message)})}
  }
 }catch(error){executionErrors.push({message:redact(error.message)})}
 finally{page.off('pageerror',onError);page.off('request',onRequest)}
 const uniqueModelCaseCount=new Set(runs.flatMap(run=>run.report.cases.map(item=>run.modelId+'|'+item.id))).size
 const summary={selectedModelCount:models.length,completedRuns:runs.length,numericCaseCount:runs.reduce((sum,run)=>sum+run.numericCaseCount,0),uniqueModelCaseCount,simulatedFrames:runs.reduce((sum,run)=>sum+run.report.cases.reduce((count,item)=>count+(item.frames??0),0),0),captureCount:captureIndex.length,assessmentCounts:runs.reduce((sum,run)=>{for(const key of Object.keys(sum))sum[key]+=run.assessmentCounts[key];return sum},{pass:0,limited:0,unsupported:0,fail:0})}
 summary.byMode=Object.fromEntries(['screen','continuous'].map(mode=>[mode,{runs:runs.filter(run=>run.mode===mode).length,cases:runs.filter(run=>run.mode===mode).reduce((sum,run)=>sum+run.numericCaseCount,0),frames:runs.filter(run=>run.mode===mode).reduce((sum,run)=>sum+run.report.cases.reduce((count,item)=>count+(item.frames??0),0),0)}]))
 summary.repeatedModelCaseEvaluations=summary.numericCaseCount-uniqueModelCaseCount
 const executionSucceeded=executionErrors.length===0&&pageErrors.length===0&&nonGetRequests.length===0&&runs.length===models.length*intensities.length*2
 await progress({phase:'complete',executionSucceeded,...summary})
 return {kind:'local-vrm-pose-pattern-sweep',startedAt,finishedAt:new Date().toISOString(),executionSucceeded,anonymousModelAssignment:'Selection order for this run; do not infer earlier A01/A02/A03 identities without vertex/mesh diagnostics.',configuration:{intensities,modes:['screen','continuous'],continuousSelection:'Baseline plus worst other screen condition per pattern',baselineViews,representativeViews,maxExtraCasesPerRun:maxExtra,maxExtraCasesPerPattern:maxPerPattern,outputDirectory},catalog,summary,runs,captureIndex,pageErrors,nonGetRequests,executionErrors,independentFindings,visualReview:{status:'pending-independent-review',imagesCaptured:captureIndex.length,imagesIndependentlyReviewed:0,allNumericCasesVisuallyReviewed:false},limitations:['Screen mode samples each condition once at the fixed final pose; continuous mode repeats selected baseline/worst conditions for 24 frames.','Kinematic support-pose conditions are simulated; full-body rigid contact, collision, friction and load-bearing are not solved.','Invisible feet are not visible-contact success: inspect unsupported/limited reasons separately from bone target errors.','Numerical pass is separate from clothing, silhouette, sole contact and aesthetic review.','Private local VRMs and screenshots remain local-assets; no XRift, Quest or remote-avatar acceptance is implied.']}
}
