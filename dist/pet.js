export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function physicsStep(body,dt,bounds){
 const t=Math.min(Math.max(dt,0),.035),floor=Math.max(0,bounds.height-body.height);
 body.vy+=1450*t;body.x+=body.vx*t;body.y+=body.vy*t;
 if(body.x<0){body.x=0;body.vx=Math.abs(body.vx)*.55}if(body.x>bounds.width-body.width){body.x=Math.max(0,bounds.width-body.width);body.vx=-Math.abs(body.vx)*.55}
 let landed=false;if(body.y>=floor){body.y=floor;if(body.vy>140){body.vy=-body.vy*.26;body.vx*=.8}else{body.vy=0;body.vx*=Math.exp(-8*t);landed=true}}
 body.y=Math.max(0,body.y);return landed;
}
export class PetCompanion{
 constructor(stage){
  this.stage=stage;this.el=stage.querySelector('.live-pet');this.actor=stage.querySelector('.live-pet-actor');this.speech=stage.querySelector('.live-pet-bubble');this.label=stage.querySelector('.live-pet-state');
  this.body={x:60,y:0,vx:0,vy:0,width:146,height:170};this.mode='idle';this.until=0;this.visible=false;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.frame=null;this.chatting=false;this.drag=null;this.last=0;this.facing=1;this.motionSince=0;
  new ResizeObserver(()=>this.resize()).observe(stage);this.resize();
  const observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.last=0;if(this.visible&&!this.frame)this.frame=requestAnimationFrame(t=>this.tick(t));else if(!this.visible&&this.frame){cancelAnimationFrame(this.frame);this.frame=null}},{threshold:.15});observer.observe(stage);
  stage.querySelectorAll('[data-pet-action]').forEach(button=>button.addEventListener('click',()=>this.action(button.dataset.petAction)));
  this.el.addEventListener('pointerdown',e=>this.grab(e));this.el.addEventListener('pointermove',e=>this.move(e));this.el.addEventListener('pointerup',e=>this.release(e));this.el.addEventListener('pointercancel',e=>this.release(e));
  this.el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.action('pet')}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.facing=e.key==='ArrowLeft'?-1:1;this.action('run',true)}});
  this.paint();
 }
 resize(){const r=this.stage.getBoundingClientRect();this.bounds={width:r.width,height:r.height-70};this.body.width=r.width<360?120:146;this.body.height=this.body.width*1.16;this.el.style.width=this.body.width+'px';this.el.style.height=this.body.height+'px';this.body.x=clamp(this.body.x,0,Math.max(0,r.width-this.body.width));this.body.y=Math.max(0,this.bounds.height-this.body.height);this.paint()}
 setMode(mode,ms=4000){this.mode=mode;this.until=performance.now()+ms;this.motionSince=performance.now();this.el.dataset.action=mode;const names={idle:'发呆中',run:'跑一圈',roll:'打个滚',read:'认真看书',pet:'被摸摸啦',drag:'被你拎起来啦',fall:'轻轻落地',talk:'正在回应'};this.label.textContent=names[mode]||'陪着你';this.el.setAttribute('aria-label',`弈星桌宠，${names[mode]}，可拖动或按回车摸摸头`)}
 say(text){this.speech.textContent=text}
 action(action,keepFacing=false){if(this.drag)return;if(!keepFacing&&action==='run')this.facing=this.body.x>this.bounds.width/2?-1:1;this.body.vx=0;this.body.vy=0;
  const lines={run:'来，活动一下！',roll:'咕噜——我又站好啦。',read:'让我翻翻攻略，等我一下。',pet:'嘿嘿，你也辛苦啦。',idle:'我在这儿，陪你慢慢想。'};this.say(lines[action]||lines.idle);this.setMode(action,action==='run'?3200:action==='roll'?1200:action==='read'?6500:2200);
 }
 chat(state){this.chatting=state==='thinking'||state==='speaking';if(this.drag)return;if(state==='thinking'){this.action('read');this.say('让我认真想一想…');this.until=Infinity}else if(state==='speaking'){this.setMode('talk',Infinity);this.say('我有些想法，听我慢慢说。')}else{this.action('idle');this.say(state==='error'?'刚才没连上，不过我还在。':'说完啦，想聊什么都可以。')}}
 grab(e){if(e.button!==0)return;e.preventDefault();this.el.setPointerCapture(e.pointerId);const r=this.stage.getBoundingClientRect();this.drag={id:e.pointerId,offsetX:e.clientX-r.left-this.body.x,offsetY:e.clientY-r.top-this.body.y,x:e.clientX,y:e.clientY,time:performance.now(),moved:0};this.body.vx=0;this.body.vy=0;this.setMode('drag',Infinity);this.say('轻一点，我抓好啦！')}
 move(e){if(!this.drag||e.pointerId!==this.drag.id)return;const r=this.stage.getBoundingClientRect(),now=performance.now(),dt=Math.max(.008,(now-this.drag.time)/1000);this.body.vx=clamp((e.clientX-this.drag.x)/dt,-650,650);this.body.vy=clamp((e.clientY-this.drag.y)/dt,-650,650);this.drag.moved+=Math.abs(e.clientX-this.drag.x)+Math.abs(e.clientY-this.drag.y);this.body.x=clamp(e.clientX-r.left-this.drag.offsetX,0,Math.max(0,r.width-this.body.width));this.body.y=clamp(e.clientY-r.top-this.drag.offsetY,0,Math.max(0,this.bounds.height-this.body.height));Object.assign(this.drag,{x:e.clientX,y:e.clientY,time:now});this.paint()}
 release(e){if(!this.drag||e.pointerId!==this.drag.id)return;const moved=this.drag.moved;this.drag=null;if(this.el.hasPointerCapture(e.pointerId))this.el.releasePointerCapture(e.pointerId);if(moved<8){this.action('pet');return}this.setMode('fall',1800);this.say('稳稳落地，没问题！');if(this.reduced){this.body.y=this.bounds.height-this.body.height;this.action('idle')}}
 tick(now){this.frame=null;if(!this.visible)return;const dt=this.last?Math.min((now-this.last)/1000,.035):.016;this.last=now;
  if(!this.drag){if(!this.reduced){if(this.mode==='run'||this.mode==='roll'){const speed=this.mode==='roll'?165:115;this.body.x+=this.facing*speed*dt;const edge=Math.max(0,this.bounds.width-this.body.width);if(this.body.x<=0||this.body.x>=edge){this.body.x=clamp(this.body.x,0,edge);this.facing*=-1}}else if(this.mode==='fall'){if(physicsStep(this.body,dt,this.bounds)){if(this.chatting)this.chat('thinking');else this.action('idle')}}}
   if(now>=this.until){if(this.chatting)this.chat('thinking');else if(this.reduced)this.action('idle');else this.action(['idle','run','read','roll'][Math.floor(Math.random()*4)])}
  }
  this.paint(now);this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 paint(now=performance.now()){this.el.style.transform=`translate3d(${this.body.x}px,${this.body.y}px,0)`;this.actor.style.setProperty('--pet-facing',this.facing);this.el.style.setProperty('--roll-angle',this.mode==='roll'&&!this.reduced?`${this.facing*Math.min(1,(now-this.motionSince)/1050)*360}deg`:'0deg');this.stage.style.setProperty('--pet-shadow-x',`${this.body.x+this.body.width/2}px`)}
}
