import { chromium } from 'playwright';
const URL=process.argv[2], OUT=process.argv[3], FRAC=process.argv[4];
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl']});
const p=await b.newPage({viewport:{width:960,height:640}});
const logs=[]; p.on('console',m=>{if(/error|warn/i.test(m.type()))logs.push(`[${m.type()}] `+m.text());});
p.on('pageerror',e=>logs.push('ERR '+e.message)); p.on('response',r=>{if(r.status()>=400)logs.push(`[${r.status()}] `+r.url());});
await p.goto(URL,{waitUntil:'load'});
await p.waitForTimeout(6000);
if(FRAC!=null){ await p.evaluate(f=>{const s=document.getElementById('slider');s.value=Math.round(f*(+s.max));s.dispatchEvent(new Event('input'));},parseFloat(FRAC)); await p.waitForTimeout(2000); }
await p.screenshot({path:OUT});
await b.close();
console.log('LOGS:',logs.length?'\n'+logs.slice(0,25).join('\n'):'(none)');
