import {PetCompanion} from './pet.js?v=20261108-4';
import {decodeChatSSE} from './sse.js';
const section=document.querySelector('#demo');
const pet=new PetCompanion(section);
const form=section.querySelector('.live-chat-form'),input=section.querySelector('#live-chat-input'),submit=section.querySelector('.live-chat-send'),stop=section.querySelector('.live-chat-stop'),clear=section.querySelector('.live-chat-clear'),messages=section.querySelector('.live-chat-messages'),state=section.querySelector('.live-chat-status'),connection=section.querySelector('.demo-connection');
const history=[];let ready=false,csrf='',controller=null,followBottom=true,reconnectTimer=null;
messages.addEventListener('scroll',()=>{followBottom=messages.scrollHeight-messages.clientHeight-messages.scrollTop<70});
function scroll(){if(followBottom)messages.scrollTop=messages.scrollHeight}
function renderText(node,text){node.replaceChildren();let last=0;for(const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)){node.append(document.createTextNode(text.slice(last,match.index)));const strong=document.createElement('strong');strong.textContent=match[1];node.append(strong);last=match.index+match[0].length}node.append(document.createTextNode(text.slice(last)))}
function message(role,text){const article=document.createElement('article');article.className='live-message '+role;const label=document.createElement('span');label.className='live-message-label';label.textContent=role==='user'?'你':'✦ 弈星';const body=document.createElement('div');body.className='live-message-body';body.textContent=text;article.append(label,body);messages.append(article);scroll();return{article,body}}
function busy(value){submit.disabled=value||!ready;stop.hidden=!value;input.disabled=false;input.placeholder=value?'弈星正在回复，你可以先写下一条…':'说说你的棋局，或者今天的心情…';clear.disabled=value;section.querySelectorAll('[data-chat-suggestion]').forEach(b=>b.disabled=value||!ready)}
function sourceLinks(article,sources){const nav=document.createElement('div');nav.className='live-message-sources';sources.forEach((source,i)=>{let url;try{url=new URL(source.url)}catch{return}if(url.protocol!=='https:')return;const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`[${i+1}] ${source.title}`;nav.append(a)});article.append(nav)}
async function session(){const response=await fetch('/api/session',{credentials:'same-origin',signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'无法建立对话');csrf=data.csrf}
async function send(text){if(!ready||controller||!text.trim())return;text=text.trim();if(text.length>1600){state.textContent='问题最多 1600 字，拆开问也可以。';return}
 followBottom=true;input.value='';message('user',text);history.push({role:'user',content:text});const answer=message('assistant','');answer.article.classList.add('is-streaming');controller=new AbortController();busy(true);state.textContent='弈星正在翻阅资料…';let output='',sources=[],completed=false,timedOut=false;const generationTimer=setTimeout(()=>{timedOut=true;controller?.abort()},70000);
 try{
  pet.chat('thinking');await session();const response=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Chat-CSRF':csrf},body:JSON.stringify({messages:history.slice(-12)}),signal:controller.signal});
  if(!response.ok){const error=await response.json();throw new Error(error.error||'这次对话没有连上')}
  for await(const event of decodeChatSSE(response.body)){
   if(event.type==='meta')sources=event.sources||[];
   if(event.type==='delta'){if(!output){pet.chat('speaking');state.textContent='弈星正在回应…'}output+=event.text;renderText(answer.body,output);scroll()}
   if(event.type==='error')throw new Error(event.message||'对话连接中断');
   if(event.type==='done')completed=true;
  }
  if(!completed||!output)throw new Error('连接提前结束了，再试一次吧');
  history.push({role:'assistant',content:output});while(history.length>12)history.shift();sourceLinks(answer.article,sources);state.textContent='回答完成 · 你还可以继续追问';pet.chat('idle');
 }catch(error){
  const stopped=error.name==='AbortError'&&!timedOut;const errorText=timedOut?'这次等得有点久了，请再试一次。':error.name==='TimeoutError'?'连接超时了，请再试一次。':error.message;if(!output)answer.body.textContent=stopped?'这次先停在这里。':errorText;
  const note=document.createElement('small');note.className='live-message-notice';note.textContent=stopped?'已停止生成':'本次未完成，可稍后重试';answer.article.append(note);state.textContent=stopped?'已停止 · 随时可以继续聊':errorText;pet.chat('error');
 }finally{clearTimeout(generationTimer);answer.article.classList.remove('is-streaming');controller=null;busy(false);scroll();}
}
form.addEventListener('submit',e=>{e.preventDefault();send(input.value)});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(input.value)}});
stop.addEventListener('click',()=>controller?.abort());
clear.addEventListener('click',()=>{if(controller)return;history.length=0;messages.replaceChildren();message('assistant','新的一局，从这里开始。告诉我你的阶段、阵容和纠结的选择，或者先聊聊今天的心情。');state.textContent='新对话已准备好';pet.chat('idle')});
section.querySelectorAll('[data-chat-suggestion]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.chatSuggestion)));
async function connect(){
 clearTimeout(reconnectTimer);
 if(location.protocol==='file:'){connection.textContent='请通过本地服务打开，即可与弈星聊天';const a=document.createElement('a');a.href='http://127.0.0.1:5050/#demo';a.textContent='打开本地 Demo ↗';connection.append(' · ',a);state.textContent='当前是文件预览，聊天需要本地服务';busy(false);return}
 try{const response=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error();const data=await response.json();ready=data.configured;connection.textContent=ready?'✦ 弈星在线 · 千问文本模型':'模型尚未连接';state.textContent=ready?'可以直接聊天，也可以先和弈星玩一会儿':'请配置服务端模型密钥';const modelName=section.querySelector('.demo-model-name');if(modelName)modelName.textContent=data.model||'Qwen/Qwen3.5-27B';
 const freshness=section.querySelector('.demo-tech-freshness');if(freshness)freshness.textContent=`按 ${data.knowledge.patch} 检索；${data.knowledge.guideBuildPatch} 配装标注旧版，记录核验日，不冒充实时最新。`;
 const checked=section.querySelector('.demo-tech-checked');if(checked)checked.textContent=`核验于 ${data.knowledge.checkedAt}`;
 }catch{ready=false;connection.textContent='正在重新连接弈星…';state.textContent='连接暂时中断，正在自动重试；你可以先写好问题'}busy(false);if(!ready)reconnectTimer=setTimeout(connect,5000);
}
busy(false);connect();
