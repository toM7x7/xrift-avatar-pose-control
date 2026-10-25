async (page) => {
 await page.setViewportSize({width:1440,height:1100})
 const range=async(id,value)=>page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}))},value)
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))))
 await page.locator('#resetPose').click()
 await page.locator('#profile').selectOption('standard')
 const shots=[]
 for(const preset of ['nimbus','shoulder']){
  await page.locator('#preset').selectOption(preset)
  for(const view of ['front','side','back','orbit']){
   await page.locator('#view').selectOption(view);await settle()
   await page.locator('#controls').evaluate(el=>el.scrollTop=0)
   const path='docs/screenshots/'+(preset==='nimbus'?'n02':'u02')+'-'+view+'-v3-2026-10-25.png'
   await page.screenshot({path});shots.push({path,state:await page.evaluate(()=>structuredClone(window.__avatarLab))})
  }
 }
 await page.locator('#profile').selectOption('small');await range('carrierScale',1.35)
 await page.locator('#view').selectOption('side');await settle()
 const path='docs/screenshots/u02-small-passenger-tall-carrier-v3-2026-10-25.png';await page.screenshot({path});shots.push({path,state:await page.evaluate(()=>structuredClone(window.__avatarLab))})
 await page.locator('#profile').selectOption('standard');await range('carrierScale',1);await page.locator('#view').selectOption('orbit');await settle()
 return shots
}
