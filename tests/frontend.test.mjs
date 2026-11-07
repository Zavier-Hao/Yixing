import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Element{
 constructor(){this.events={};this.children=[];this.disabled=false;this.value='';this.textContent='';this.dataset={};this.classList={add(){},remove(){}};this.scrollHeight=0;this.clientHeight=300;this.scrollTop=0}
 addEventListener(name,fn){this.events[name]=fn}
 append(...nodes){this.children.push(...nodes);this.scrollHeight=this.children.length*100}
 replaceChildren(...nodes){this.children=nodes}
}
test('recommendation sends a request, draft remains editable during generation, and manual submit works',async()=>{
 const nodes=new Map();const get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector)};
 const section=get('#demo');const suggestions=[new Element()];suggestions[0].dataset.chatSuggestion='我想了解永恒之森';section.querySelector=get;section.querySelectorAll=()=>suggestions;
 const document={querySelector:get,createElement:()=>new Element(),createTextNode:text=>({textContent:text})};
 let release;const gate=new Promise(resolve=>release=resolve);const requests=[];
 const fetch=async(url,options)=>{
  if(url==='/api/health')return{ok:true,json:async()=>({configured:true,knowledge:{set:18,patch:'18.6',guideBuildPatch:'18.5',championCount:74,itemCount:183,compIndexCount:311,detailedGuideCount:129,currentGuideCount:30,checkedAt:'2026-11-07'}})};
  if(url==='/api/session')return{ok:true,json:async()=>({csrf:'test-csrf'})};
  requests.push(JSON.parse(options.body));return{ok:true,body:{}};
 };
 const source=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
 vm.runInNewContext(source,{document,location:{protocol:'http:'},PetCompanion:class{chat(){}},decodeChatSSE:async function*(){yield{type:'meta',sources:[]};yield{type:'delta',text:'我陪你一起看。'};await gate;yield{type:'done'}},fetch,AbortController,AbortSignal,URL,setTimeout,clearTimeout});
 await flush();assert.equal(suggestions[0].disabled,false);assert.equal(get('#live-chat-input').disabled,false);
 const sent=suggestions[0].events.click();await flush();assert.equal(requests.length,1);assert.equal(requests[0].messages[0].content,'我想了解永恒之森');assert.equal(get('#live-chat-input').disabled,false);assert.equal(get('.live-chat-send').disabled,true);
 get('#live-chat-input').value='下一条草稿';release();await sent;assert.equal(get('#live-chat-input').value,'下一条草稿');assert.equal(get('.live-chat-send').disabled,false);
 get('.live-chat-form').events.submit({preventDefault(){}});await flush();assert.equal(requests.length,2);assert.equal(requests[1].messages.at(-1).content,'下一条草稿');assert.equal(get('#live-chat-input').disabled,false);
});
test('browser module entry and dependencies use Nginx-compatible .js paths',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert(html.includes('src="chat.js?v=20261107-4"'));const chat=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8');assert(chat.includes("from './pet.js'"));assert(chat.includes("from './sse.js'"));assert(!html.includes('src="chat.mjs'));
});
test('a failed initial connection automatically retries and unlocks chat when the backend recovers',async()=>{
 const nodes=new Map();const get=key=>{if(!nodes.has(key))nodes.set(key,new Element());return nodes.get(key)};const section=get('#demo'),suggestion=new Element();section.querySelector=get;section.querySelectorAll=()=>[suggestion];const document={querySelector:get,createElement:()=>new Element(),createTextNode:text=>({textContent:text})};let attempts=0,retry;
 const fetch=async()=>{if(++attempts===1)throw new Error('temporary connection failure');return{ok:true,json:async()=>({configured:true,knowledge:{set:18,patch:'18.6',guideBuildPatch:'18.5',championCount:74,itemCount:183,compIndexCount:311,detailedGuideCount:129,currentGuideCount:30,checkedAt:'2026-11-07'}})}};
 const source=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
 vm.runInNewContext(source,{document,location:{protocol:'http:'},PetCompanion:class{chat(){}},decodeChatSSE:async function*(){},fetch,AbortController,AbortSignal,URL,setTimeout(fn,ms){assert.equal(ms,5000);retry=fn;return 1},clearTimeout(){}});
 await flush();assert.equal(suggestion.disabled,true);assert.equal(get('#live-chat-input').disabled,false);assert.equal(typeof retry,'function');await retry();assert.equal(attempts,2);assert.equal(suggestion.disabled,false);assert.equal(get('.live-chat-send').disabled,false);
});
