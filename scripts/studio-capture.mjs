// Capture the Pose Studio (4 views) at chosen keys / times, on the built-in
// test bodies and optionally on local VRMs, with GPU Chrome. VRM captures
// are written to local-assets/ (git-ignored); fixture captures to the output dir.
// Usage: node scripts/studio-capture.mjs [--vrm path ...] [--read host|vrm] [--out dir] [--keys a,b] [--times 0.3,2.6] [--evaluate]
// --read host (default) reads bones the way an XRift item does (names, then names + skeleton shape); vrm uses the VRM humanoid map.
import {chromium} from 'playwright'
import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {join,basename,resolve} from 'node:path'

const args=process.argv.slice(2),opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1]}
const vrms=[];for(let i=0;i<args.length;i++)if(args[i]==='--vrm')vrms.push(resolve(args[i+1]))
const root=resolve(import.meta.dirname,'..')
const out=resolve(opt('out',join(root,'local-assets','studio')))
const keys=(opt('keys','ready,gather,charge,thrust,follow')).split(',').filter(Boolean)
const times=(opt('times','')).split(',').filter(Boolean).map(Number)
const evaluate=args.includes('--evaluate'),tag=opt('tag','run')
mkdirSync(out,{recursive:true})
const exe=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1243','chrome-win64','chrome.exe')
const browser=await chromium.launch({executablePath:existsSync(exe)?exe:undefined,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu']})
const page=await browser.newPage({viewport:{width:1500,height:960},deviceScaleFactor:1})
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
const read=opt('read','host')
await page.goto('http://127.0.0.1:5228/studio.html?read='+read)
await page.waitForFunction(()=>!!window.__studio?.result,null,{timeout:30000})
const report={},bodies=[{label:'fixture',load:null},...vrms.map((p,i)=>({label:'A0'+(i+1),load:p}))]
for(const body of bodies){
 if(body.load){await page.setInputFiles('#vrm',body.load);await page.waitForFunction(()=>/\.vrm/.test(window.__studio.info().label),null,{timeout:60000});await page.waitForTimeout(400)}
 const entry=report[body.label]={info:await page.evaluate(()=>window.__studio.info())}
 await page.evaluate(()=>window.__studio.pause())
 for(const key of keys){
  await page.evaluate(k=>window.__studio.setStatic(k),key);await page.waitForTimeout(250)
  await page.screenshot({path:join(out,`${tag}-${body.label}-${key}.png`),clip:{x:0,y:0,width:1120,height:960}})
 }
 for(const t of times){
  await page.evaluate(t=>{window.__studio.setTime(t);window.__studio.pause()},t);await page.waitForTimeout(250)
  await page.screenshot({path:join(out,`${tag}-${body.label}-t${t.toFixed(2)}.png`),clip:{x:0,y:0,width:1120,height:960}})
 }
 if(evaluate)entry.evaluation=await page.evaluate(()=>window.__studio.evaluate())
}
writeFileSync(join(out,`${tag}-report.json`),JSON.stringify({report,errors},null,1))
for(const [label,e] of Object.entries(report)){console.log('==',label,e.info.label,'read',e.info.read?`${e.info.read.status}/${e.info.read.method??'-'} used ${e.info.read.used}${e.info.read.mismatch?.length?' mismatch '+e.info.read.mismatch.join(';'):''}${e.info.read.reason?' reason '+e.info.read.reason:''}`:'-','fingers',e.info.fingers.left.length,'radii',Object.values(e.info.radii).map(r=>r.source[0]).join(''));if(e.evaluation){console.log(' score',e.evaluation.score,'speed',e.evaluation.maxSpeed.value.toFixed(0),e.evaluation.maxSpeed.bone);for(const v of e.evaluation.verdicts)if(v.status!=='pass')console.log(' ',v.status,v.metric,v.value?.toFixed(1),'/',v.limit,'@',v.at?.toFixed(2))}}
if(errors.length)console.log('errors',errors.slice(0,5))
await browser.close()
