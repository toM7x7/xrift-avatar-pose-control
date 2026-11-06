// Close-ups of both hands at chosen keys (Pose Studio's four views zoomed on the hands), on the built-in
// body and local VRMs. Output: local-assets/hands/ (git-ignored).
// Usage (Pose Studio on 5228): node scripts/hand-closeup.mjs [--vrm path ...] [--keys charge,thrust] [--size 0.22] [--tag run]
import {chromium} from 'playwright'
import {existsSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'

const args=process.argv.slice(2),opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1]}
const vrms=[];for(let i=0;i<args.length;i++)if(args[i]==='--vrm')vrms.push(resolve(args[i+1]))
const keys=opt('keys','charge,thrust,follow').split(',').filter(Boolean),size=Number(opt('size','.22')),tag=opt('tag','run')
const out=resolve(import.meta.dirname,'..','local-assets','hands');mkdirSync(out,{recursive:true})
const exe=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1243','chrome-win64','chrome.exe')
const browser=await chromium.launch({executablePath:existsSync(exe)?exe:undefined,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu']})
const page=await browser.newPage({viewport:{width:1500,height:960}})
await page.goto('http://127.0.0.1:5228/studio.html?read='+opt('read','host'))
await page.waitForFunction(()=>!!window.__studio?.result,null,{timeout:30000})
const bodies=[{label:'fixture',load:null},...vrms.map((p,i)=>({label:'V'+(i+1),load:p}))]
for(const body of bodies){
 if(body.load){await page.setInputFiles('#vrm',body.load);await page.waitForFunction(()=>/\.vrm/.test(window.__studio.info().label),null,{timeout:60000});await page.waitForTimeout(400)}
 await page.evaluate(()=>{window.__studio.pause();window.__studio.setOverlay({guides:false,onion:false,balance:false,colliders:false})})
 for(const key of keys){
  await page.evaluate(([key,size])=>{
   const S=window.__studio,b=S.rig.bones,V=b.hips.position.constructor
   S.applyKey(key)
   const c=b.leftHand.getWorldPosition(new V()).add(b.rightHand.getWorldPosition(new V())).multiplyScalar(.5)
   S.setOverlay({focus:{center:c,size}});S.setStatic(key)
  },[key,size])
  await page.waitForTimeout(350)
  await page.screenshot({path:join(out,`${tag}-${body.label}-${key}.png`),clip:{x:0,y:0,width:1120,height:960}})
 }
}
console.log('→',out)
await browser.close()
