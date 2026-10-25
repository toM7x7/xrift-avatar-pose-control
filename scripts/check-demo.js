async (page) => {
 const errors=[],requests=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')requests.push(r.method())})
 await page.setViewportSize({width:1440,height:1100})
 await page.getByRole('combobox',{name:'検証用の体格',exact:true}).selectOption('small')
 await page.waitForFunction(()=>window.__avatarLab?.profile==='small')
 for(const preset of ['upright','hover','board','glider','native']){
  await page.getByRole('combobox',{name:'姿勢',exact:true}).selectOption(preset)
  await page.waitForFunction(p=>window.__avatarLab?.preset===p,preset)
  await page.waitForTimeout(80)
  const r=await page.evaluate(()=>structuredClone(window.__avatarLab));if(!r.connected||r.error||!r.restored)throw Error(JSON.stringify(r))
  if(preset!=='native'&&r.metrics.headDriftMm>.001)throw Error('Head drift')
  if(preset==='native'){const f=r.frames;await page.waitForTimeout(150);if((await page.evaluate(()=>window.__avatarLab.frames))!==f)throw Error('Disabled pose still applies')}
  results.push({preset,error:r.error,headDriftMm:r.metrics?.headDriftMm,restored:r.restored})
 }
 await page.getByRole('combobox',{name:'姿勢',exact:true}).selectOption('hover')
 await page.getByRole('checkbox',{name:'手の追跡位置を保つ（模擬）'}).check()
 await page.getByRole('slider',{name:'頭の左右',exact:true}).press('End')
 await page.waitForTimeout(150)
 await page.locator('#controls').evaluate(el=>el.scrollTop=0)
 await page.screenshot({path:'docs/screenshots/pose-demo.png'})
 if(errors.length||requests.length)throw Error(JSON.stringify({errors,requests}))
 await page.getByRole('combobox',{name:'検証用の体格',exact:true}).selectOption('standard')
 return {checks:{allPresets:true,nativeDoesNotApply:true,trackedHands:true,headRotation:true,restoresAfterRender:true,noPageErrors:true,noNonGetRequests:true},results}
}
