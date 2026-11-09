import http from 'node:http';
import {createReadStream,realpathSync,existsSync} from 'node:fs';
import {stat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {isIP} from 'node:net';
import {knowledge,retrieve,systemPrompt} from './knowledge.mjs';
import {readProviderStream} from './stream.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(path.join(root,'.env'))}catch(e){if(e.code!=='ENOENT')throw e}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.mp4':'video/mp4','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
export function validateMessages(messages){
 if(!Array.isArray(messages)||messages.length<1||messages.length>12)throw new Error('请保留最近 12 条以内的对话');
 const result=messages.map(m=>{if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>2000)throw new Error('消息格式不正确，每条最多 2000 字');return{role:m.role,content:m.content.trim()}});
 if(result.at(-1).role!=='user')throw new Error('最后一条消息必须是你的提问');return result;
}
export function createApp(options={}){
 const fetcher=options.fetcher||fetch,apiKey=options.apiKey??process.env.SILICONFLOW_API_KEY,model=options.model||process.env.SILICONFLOW_MODEL||'Qwen/Qwen3.5-27B';
 const sessions=new Map(),buckets=new Map();let active=0,globalCount=0,hourStart=Date.now();
 const hourly=Number(options.hourlyLimit??process.env.CHAT_HOURLY_LIMIT??60),ipLimit=Number(options.ipLimit??process.env.CHAT_IP_HOURLY_LIMIT??15),concurrent=Number(options.concurrent??process.env.CHAT_MAX_CONCURRENT??3);
 const json=(res,code,body)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  let url;try{url=new URL(req.url,'http://'+req.headers.host)}catch{return json(res,400,{error:'请求地址无效'})}
  const sameOrigin=()=>!req.headers.origin||req.headers.origin==='http://'+req.headers.host||req.headers.origin==='https://'+req.headers.host;
  if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,configured:Boolean(apiKey),model,knowledge:knowledge.meta,sources:knowledge.sources});
  if(url.pathname==='/api/session'&&req.method==='GET'){
   if(!sameOrigin())return json(res,403,{error:'请从本站打开聊天'});
   const now=Date.now();for(const [id,s]of sessions)if(s.expires<now)sessions.delete(id);
   const cookie=req.headers.cookie?.match(/(?:^|;\s*)yixing_session=([a-f0-9]{48})(?:;|$)/)?.[1];let id=cookie,s=id&&sessions.get(id);
   if(!s){if(sessions.size>=2000)return json(res,503,{error:'当前访问较多，请稍后重试'});id=crypto.randomBytes(24).toString('hex');s={csrf:crypto.randomBytes(24).toString('hex'),expires:now+3600000,busy:false};sessions.set(id,s)}
   res.setHeader('Set-Cookie',`yixing_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${req.socket.encrypted?'; Secure':''}`);return json(res,200,{csrf:s.csrf});
  }
  if(url.pathname==='/api/chat'&&req.method==='POST'){
   if(!sameOrigin())return json(res,403,{error:'请从本站发起对话'});
   const id=req.headers.cookie?.match(/(?:^|;\s*)yixing_session=([a-f0-9]{48})(?:;|$)/)?.[1],session=id&&sessions.get(id);
   if(!session||session.expires<Date.now()||req.headers['x-chat-csrf']!==session.csrf)return json(res,403,{error:'对话会话已过期，请刷新页面'});
   if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'请使用 JSON 请求'});
   if(!apiKey)return json(res,503,{error:'弈星还没接好服务端模型，请配置服务端密钥后重试'});
   if(session.busy||active>=concurrent)return json(res,429,{error:'弈星正在处理其他问题，请稍等片刻'});
   const peer=req.socket.remoteAddress;const forwarded=req.headers['x-real-ip'];const trusted=process.env.TRUST_PROXY==='1'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);const ip=trusted&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:peer;const now=Date.now();if(now-hourStart>3600000){buckets.clear();globalCount=0;hourStart=now}
   if(globalCount>=hourly||(buckets.get(ip)||0)>=ipLimit){res.setHeader('Retry-After',String(Math.ceil((hourStart+3600000-now)/1000)));return json(res,429,{error:'体验次数暂时用完啦，请稍后再来找弈星'});}
   let messages;try{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32768)throw new Error('请求内容过长')}messages=validateMessages(JSON.parse(raw).messages)}catch(e){return json(res,400,{error:e.message==='请求内容过长'?e.message:'消息格式不正确，请缩短问题后重试'})}
   active++;session.busy=true;globalCount++;buckets.set(ip,(buckets.get(ip)||0)+1);
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);res.on('close',()=>controller.abort());
   try{
    const selected=retrieve(messages.filter(m=>m.role==='user').slice(-3).map(m=>m.content).join('\n'));
    const upstream=await fetcher('https://api.siliconflow.cn/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:systemPrompt(selected.context)},...messages],stream:true,enable_thinking:false,max_tokens:900,temperature:.35}),signal:controller.signal});
    if(!upstream.ok){const errors={401:'模型密钥未通过验证，请联系站点作者',402:'模型额度不足，请联系站点作者',429:'模型服务繁忙，请稍后重试'};return json(res,upstream.status===429?429:502,{error:errors[upstream.status]||'模型服务暂时不可用，请稍后重试'})}
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
    const send=async data=>{if(res.destroyed)throw new Error('CLIENT_CLOSED');if(!res.write('data: '+JSON.stringify(data)+'\n\n'))await once(res,'drain')};
    await send({type:'meta',sources:selected.sources,patch:knowledge.meta.patch});let hadText=false;
    for await(const text of readProviderStream(upstream.body)){hadText=true;await send({type:'delta',text})}
    if(!hadText)throw new Error('EMPTY_RESPONSE');await send({type:'done'});res.end();
   }catch{
    if(!res.destroyed){if(res.headersSent){res.write('data: '+JSON.stringify({type:'error',message:'这次连接中断了，请重试，我还在这里。'})+'\n\n');res.end()}else json(res,502,{error:'暂时没连上弈星，请检查网络后重试'})}
   }finally{clearTimeout(timeout);session.busy=false;active--;}
   return;
  }
  if(url.pathname.startsWith('/api/'))return json(res,404,{error:'接口不存在'});
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'不支持此请求方式'});
  let decoded;try{decoded=decodeURIComponent(url.pathname)}catch{return json(res,400,{error:'路径无效'})}
  if(decoded.split('/').some(x=>x.startsWith('.'))||decoded.includes('\\'))return json(res,404,{error:'文件不存在'});
  const dist=path.join(root,'dist'),file=path.resolve(dist,'.'+(decoded==='/'?'/index.html':decoded));
  if(!file.startsWith(dist+path.sep))return json(res,404,{error:'文件不存在'});
  try{
   const info=await stat(file);if(!info.isFile())throw new Error();const versioned=/\-[a-f0-9]{8}\.(webp|mp4)$/.test(file);const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Accept-Ranges':'bytes','Cache-Control':path.extname(file)==='.html'?'no-cache':versioned?'public, max-age=31536000, immutable':'public, max-age=300'};
   if(req.headers.range){const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!range)return res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();let start=range[1]?Number(range[1]):Math.max(0,info.size-Number(range[2])),end=range[2]&&range[1]?Math.min(Number(range[2]),info.size-1):info.size-1;if(start>end||start>=info.size)return res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${info.size}`});if(req.method==='HEAD')return res.end();createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);return;}
   res.writeHead(200,headers);if(req.method==='HEAD')return res.end();createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch{return json(res,404,{error:'文件不存在'})}
 });
 return server;
}
if(process.argv[1]&&existsSync(process.argv[1])&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 const port=Number(process.env.PORT||5050),host=process.env.HOST||'127.0.0.1';createApp().listen(port,host,()=>console.log(`Yixing: http://${host}:${port} · server-side model · patch ${knowledge.meta.patch}`));
}
