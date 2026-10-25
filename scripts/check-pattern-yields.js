async page=>{
 const result=await page.evaluate(async()=>{
  const api=window.__posePatternExperiment,caseIds=['chair-car__base','prone-glider__base','shoulder-back-offset__base']
  const frame=await api.runSweep({mode:'continuous',caseIds,yieldMode:'frame'}),task=await api.runSweep({mode:'continuous',caseIds,yieldMode:'task'})
  return {model:frame.model,cases:caseIds,framesPerRun:frame.summary.frames,exactCaseEquality:JSON.stringify(frame.cases)===JSON.stringify(task.cases),frameStatuses:frame.summary.byStatus,taskStatuses:task.summary.byStatus}
 })
 return result
}
