const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=path.resolve('dist'),servers=[];
 for(const before of [true,false]){const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  if(pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({configured:false,knowledge:{set:18,patch:'18.6',guideBuildPatch:'18.5'}}));return}
  let file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  if(before&&pathname==='/')file=path.resolve('.cache/perf-before.html');
  if(before&&pathname==='/pet.js')file=path.resolve('.cache/perf-before-pet.js');
  try{const size=fs.statSync(file).size;const type=({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream';let start=0,end=size-1,status=200;const headers={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'no-store'};
   const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');if(range){start=+range[1];if(range[2])end=Math.min(+range[2],size-1);status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`}
   headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end()}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server)}
 const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
 try{for(let run=1;run<=2;run++)for(const [i,variant]of ['before','after'].entries()){
  const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();await page.route('https://**',r=>r.abort());
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:200000,uploadThroughput:100000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const requests=new Map();cdp.on('Network.requestWillBeSent',e=>requests.set(e.requestId,{url:e.request.url,type:e.type,bytes:0}));cdp.on('Network.dataReceived',e=>{const r=requests.get(e.requestId);if(r)r.bytes+=e.encodedDataLength});cdp.on('Network.loadingFinished',e=>{const r=requests.get(e.requestId);if(r)r.bytes=e.encodedDataLength});
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const image=document.querySelector('.knight-companion img');const mark=()=>image.decode().then(()=>requestAnimationFrame(()=>window.__heroPaint=performance.now()));if(image.complete)mark();else image.addEventListener('load',mark,{once:true});}));
  await page.goto('http://127.0.0.1:'+servers[i].address().port+'/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__heroPaint>0,null,{timeout:90000});
  const heroMs=await page.evaluate(()=>window.__heroPaint);const initialBytes=[...requests.values()].reduce((n,r)=>n+r.bytes,0);const initialMedia=[...requests.values()].filter(r=>r.type==='Media').map(r=>r.url);
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';const v=document.querySelector('.pet-video');window.__videoStart=performance.now();v.requestVideoFrameCallback(()=>window.__firstVideoFrame=performance.now());scrollTo({top:document.querySelector('#companion').offsetTop,behavior:'instant'})});
  await page.waitForFunction(()=>window.__firstVideoFrame>0,null,{timeout:90000});
  const video=await page.evaluate(()=>({firstFrameMs:window.__firstVideoFrame-window.__videoStart,width:document.querySelector('.pet-video').videoWidth,height:document.querySelector('.pet-video').videoHeight}));
  const result={run,variant,heroMs:Math.round(heroMs),initialBytes,initialMediaRequests:initialMedia.length,videoFirstFrameMs:Math.round(video.firstFrameMs),videoResolution:video.width+'x'+video.height};results.push(result);console.log(JSON.stringify(result));fs.writeFileSync('.cache/media-performance.json',JSON.stringify({conditions:'Cold cache; 1.6 Mbps down; 80 ms latency; CPU 4x; localhost HTTP; external Riot art requests blocked in both variants.',results},null,2));
  if(run===1&&variant==='after'){await page.screenshot({path:'.cache/perf-video.png'});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'.cache/perf-hero.png'})}
  await context.close();
 }}finally{await browser.close();for(const s of servers)s.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
