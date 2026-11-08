export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const PET_ANIMATIONS={
 idle:{row:0,frames:8,durations:[650,180,180,130,120,180,220,650],loop:true},
 run:{row:1,frames:8,durations:Array(8).fill(90),loop:true},
 roll:{row:2,frames:10,durations:Array(10).fill(105),loop:false},
 pet:{row:3,frames:8,durations:[130,120,120,170,170,160,160,170],loop:false},
 drag:{row:4,frames:9,durations:Array(9).fill(135),loop:true},
 release:{row:5,frames:8,durations:[100,90,130,160,160,140,160,200],loop:false}
};
export function petAnimationFrame(mode,elapsed,reduced=false){
 const key=mode==='fall'?'release':mode==='read'||mode==='talk'?'idle':mode;
 const animation=PET_ANIMATIONS[key]||PET_ANIMATIONS.idle;
 const duration=animation.durations.reduce((a,b)=>a+b,0);
 let time=animation.loop?Math.max(0,elapsed)%duration:clamp(elapsed,0,duration-1),index=0;
 if(!reduced){while(index<animation.frames-1&&time>=animation.durations[index]){time-=animation.durations[index];index++}}
 return {row:animation.row,index,duration};
}
export function physicsStep(body,dt,bounds){
 const t=Math.min(Math.max(dt,0),.035),floor=Math.max(0,bounds.height-body.height);
 body.vy+=1450*t;body.x+=body.vx*t;body.y+=body.vy*t;
 if(body.x<0){body.x=0;body.vx=Math.abs(body.vx)*.55}if(body.x>bounds.width-body.width){body.x=Math.max(0,bounds.width-body.width);body.vx=-Math.abs(body.vx)*.55}
 let landed=false;if(body.y>=floor){body.y=floor;if(body.vy>140){body.vy=-body.vy*.26;body.vx*=.8}else{body.vy=0;body.vx*=Math.exp(-8*t);landed=true}}
 body.y=Math.max(0,body.y);return landed;
}
// A one-way platform: the panel is solid only when crossed from above.
export function worldStep(body,dt,world){
 const t=clamp(dt,0,.035),previousFeet=body.y+body.height;
 body.vy+=1450*t;body.x+=body.vx*t;body.y+=body.vy*t;
 const edge=Math.max(0,world.width-body.width);
 if(body.x<0){body.x=0;body.vx=Math.abs(body.vx)*.55}
 if(body.x>edge){body.x=edge;body.vx=-Math.abs(body.vx)*.55}
 let top=world.floor,surface='ground';
 const p=world.platform,center=body.x+body.width/2;
 if(p&&body.vy>=0&&center>p.left+8&&center<p.right-8&&previousFeet<=p.top+2&&body.y+body.height>=p.top){top=p.top;surface='chat'}
 body.surface=null;let hit=false;
 if(body.y+body.height>=top&&body.vy>=0){
  body.y=top-body.height;hit=true;
  if(surface==='ground'&&body.vy>240){body.vy=-body.vy*.22;body.vx*=.8}
  else{body.vy=0;body.surface=surface}
 }
 return {hit,surface:hit?surface:null,grounded:body.surface!==null};
}

export class PetCompanion{
 constructor(stage){
  this.stage=stage;this.el=stage.querySelector('.live-pet');this.actor=stage.querySelector('.live-pet-actor');this.sprite=stage.querySelector('.live-pet-sprite');this.speech=stage.querySelector('.live-pet-bubble');this.label=stage.querySelector('.live-pet-state');this.shadow=stage.querySelector('.pet-realm-floor');this.panel=stage.querySelector('.live-chat-panel');
  this.body={x:60,y:0,vx:0,vy:0,width:140,height:162,surface:null};
  this.mode='idle';this.until=Infinity;this.visible=false;this.frame=null;this.chatState='idle';this.chatting=false;this.drag=null;this.last=0;this.facing=1;this.motionSince=0;this.landingAt=null;this.entered=false;this.introRoll=false;this.nextHop=Infinity;this.world={width:1,floor:1,platform:null};
  this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');this.reduced=this.motionQuery.matches;
  this.motionQuery.addEventListener('change',e=>{this.reduced=e.matches;if(e.matches&&!this.drag){this.body.y=this.world.floor-this.body.height;this.body.vx=this.body.vy=0;this.body.surface='ground';this.setMode('idle',4000);this.paint()}});
  this.resize();new ResizeObserver(()=>this.resize()).observe(stage);if(this.panel)new ResizeObserver(()=>this.resize()).observe(this.panel);
  // Finish decoding before the entrance, so a slow image download cannot hide the drop.
  this.assetReady=false;const atlas=new Image();atlas.src=new URL('./assets/pet-frames/atlas.webp',import.meta.url).href;
  atlas.decode().then(()=>{this.assetReady=true;this.start()}).catch(()=>{this.label.textContent='桌宠素材加载失败，请刷新重试'});
  new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.last=0;if(this.visible)this.start();else if(this.frame){cancelAnimationFrame(this.frame);this.frame=null}},{threshold:.15}).observe(stage);
  stage.querySelectorAll('[data-pet-action]').forEach(button=>button.addEventListener('click',()=>this.action(button.dataset.petAction)));
  this.hovered=false;
  this.el.addEventListener('pointerenter',e=>{if(e.pointerType==='touch')return;this.hovered=true;this.hoverPet()});
  this.el.addEventListener('pointerleave',()=>{this.hovered=false});
  this.el.addEventListener('pointerdown',e=>this.grab(e));this.el.addEventListener('pointermove',e=>this.move(e));this.el.addEventListener('pointerup',e=>this.release(e));this.el.addEventListener('pointercancel',e=>this.release(e));
  this.el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.action('pet')}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.facing=e.key==='ArrowLeft'?-1:1;this.action('run',true)}if(e.key==='ArrowUp'){e.preventDefault();this.jump()}});
  if(this.panel){this.panel.addEventListener('pointermove',e=>{const r=this.panel.getBoundingClientRect();this.panel.style.setProperty('--glass-x',`${(e.clientX-r.left)/r.width*100}%`);this.panel.style.setProperty('--glass-y',`${(e.clientY-r.top)/r.height*100}%`)});}
  this.paint();
 }
 start(){if(!this.visible||!this.assetReady)return;if(!this.entered)this.enter();if(!this.frame)this.frame=requestAnimationFrame(t=>this.tick(t))}
 resize(){
  const r=this.stage.getBoundingClientRect(),oldHeight=this.body.height,oldWorld=this.world,oldSurface=this.body.surface;
  this.body.width=r.width<700?112:r.height<820?120:140;this.body.height=this.body.width*1.16;
  this.el.style.width=this.body.width+'px';this.el.style.height=this.body.height+'px';
  const p=this.panel?.getBoundingClientRect();
  this.world={width:r.width,floor:r.height-35,platform:p?{left:p.left-r.left,right:p.right-r.left,top:p.top-r.top}:null};
  this.body.x=clamp(this.body.x,12,Math.max(12,r.width-this.body.width-12));
  if(!this.entered)this.body.y=-this.body.height-25;
  else if(oldSurface==='ground')this.body.y=this.world.floor-this.body.height;
  else if(oldSurface==='chat'&&this.world.platform)this.body.y=this.world.platform.top-this.body.height;
  else this.body.y=clamp(this.body.y+(oldHeight-this.body.height),-this.body.height,this.world.floor-this.body.height);
  if(oldWorld.platform&&oldSurface==='chat'&&!this.overPlatform())this.body.surface=null;
  this.paint();
 }
 enter(){
  this.entered=true;this.el.dataset.ready='true';this.body.x=this.world.width*.26;this.body.surface=null;
  if(this.reduced){this.body.y=this.world.floor-this.body.height;this.body.surface='ground';this.setMode('idle',4000)}
  else{this.body.y=-this.body.height-35;this.body.vx=90;this.body.vy=30;this.introRoll=true;this.setMode('entrance',Infinity);this.say('借过一下——弈星来啦！')}
  this.nextHop=performance.now()+7200;this.paint();
 }
 overPlatform(){const p=this.world.platform,c=this.body.x+this.body.width/2;return p&&c>p.left+8&&c<p.right-8}
 setMode(mode,ms=4000){
  this.mode=mode;this.until=performance.now()+ms;this.motionSince=performance.now();this.el.dataset.action=mode;
  const names={idle:'呼吸 · 眨眨眼',entrance:'翻滚着来报到',run:'到处逛逛',roll:'打个滚',read:'认真看书',pet:'被摸摸啦',drag:'被你拎起来啦',fall:'轻轻落地',jump:'去聊天框上坐坐',talk:'正在回应'};
  this.label.textContent=names[mode]||'陪着你';this.el.setAttribute('aria-label',`弈星桌宠，${names[mode]}，悬停摸头或拖动互动；键盘回车摸头，上方向键跳上聊天框`);
 }
 say(text){this.speech.textContent=text}
 hoverPet(){if(!this.drag&&this.body.surface&&this.mode!=='pet'&&this.mode!=='fall'){this.action('pet');this.paint()}}
 rest(ms=2400){this.body.vx=0;this.landingAt=null;if(this.chatting){this.setMode(this.chatState==='thinking'?'read':'talk',ms)}else this.setMode('idle',ms)}
 action(action,keepFacing=false){
  if(this.drag)return;
  if(action==='jump'){this.jump();return}
  if(!this.body.surface&&!this.reduced)return;
  if(!keepFacing&&(action==='run'||action==='roll'))this.facing=this.body.x>this.world.width/2?-1:1;
  this.body.vx=this.body.vy=0;
  const lines={run:'这里也能逛，那边也能去。',roll:'咕噜——我又站好啦。',read:'让我翻翻攻略，等我一下。',pet:'嘿嘿，你也辛苦啦。',idle:'我在这儿，陪你慢慢想。'};
  this.say(lines[action]||lines.idle);this.setMode(action,action==='run'?3200:action==='roll'?1200:action==='read'?6500:action==='pet'?1300:2600);
 }
 chat(state){
  this.chatState=state;this.chatting=state==='thinking'||state==='speaking';
  if(this.drag||!this.body.surface)return;
  this.rest(this.chatting?5000:2600);this.say(state==='thinking'?'让我认真想一想…':state==='speaking'?'我有些想法，听我慢慢说。':state==='error'?'刚才没连上，不过我还在。':'说完啦，想聊什么都可以。');
 }
 jump(){
  if(this.drag||!this.body.surface)return;
  const p=this.world.platform;
  if(!p||p.top<this.body.height+8){this.action('roll');return}
  if(this.reduced){this.say('我就坐这里陪你。');return}
  const onBox=this.body.surface==='chat';
  if(onBox){this.facing=this.body.x+this.body.width/2<(p.left+p.right)/2?-1:1;this.body.vx=this.facing*170;this.body.vy=-240;this.body.surface=null;this.landingAt=null;this.setMode('jump',Infinity);this.say('换个地方，继续陪你。');this.nextHop=performance.now()+14000;return}
  const target=clamp((p.left+p.right-this.body.width)/2,p.left+24,p.right-this.body.width-24);
  const feet=this.body.y+this.body.height,apex=Math.max(this.body.height+5,p.top-80),rise=Math.max(60,feet-apex);
  this.body.vy=-Math.sqrt(2*1450*rise);
  const delta=p.top-feet,flight=(-this.body.vy+Math.sqrt(Math.max(0,this.body.vy*this.body.vy+2*1450*delta)))/1450;
  this.body.vx=(target-this.body.x)/Math.max(.2,flight);this.facing=this.body.vx>=0?1:-1;this.body.surface=null;this.landingAt=null;this.setMode('jump',Infinity);this.say('这个小箱子，借我坐一下。');this.nextHop=performance.now()+16000;
 }
 grab(e){
  if(e.button!==0)return;e.preventDefault();this.el.setPointerCapture(e.pointerId);const r=this.stage.getBoundingClientRect();
  this.drag={id:e.pointerId,offsetX:e.clientX-r.left-this.body.x,offsetY:e.clientY-r.top-this.body.y,x:e.clientX,y:e.clientY,time:performance.now(),moved:0,previousMode:this.mode,previousSurface:this.body.surface};
  this.body.vx=this.body.vy=0;this.body.surface=null;this.setMode('drag',Infinity);this.say('轻一点，我抓好啦！');
 }
 move(e){
  if(!this.drag||e.pointerId!==this.drag.id)return;const r=this.stage.getBoundingClientRect(),now=performance.now(),dt=Math.max(.008,(now-this.drag.time)/1000);
  this.body.vx=clamp((e.clientX-this.drag.x)/dt,-650,650);this.body.vy=clamp((e.clientY-this.drag.y)/dt,-650,650);
  this.drag.moved+=Math.abs(e.clientX-this.drag.x)+Math.abs(e.clientY-this.drag.y);
  this.body.x=clamp(e.clientX-r.left-this.drag.offsetX,12,Math.max(12,r.width-this.body.width-12));
  this.body.y=clamp(e.clientY-r.top-this.drag.offsetY,30,this.world.floor-this.body.height);
  Object.assign(this.drag,{x:e.clientX,y:e.clientY,time:now});this.paint();
 }
 release(e){
  if(!this.drag||e.pointerId!==this.drag.id)return;const {moved,previousSurface,time}=this.drag;this.drag=null;
  if(this.el.hasPointerCapture(e.pointerId))this.el.releasePointerCapture(e.pointerId);
  if(moved<8&&previousSurface){this.body.surface=previousSurface;this.rest(1200);if(this.hovered)this.hoverPet();return}
  // A pause before letting go means dropping, rather than throwing with a stale velocity.
  if(performance.now()-time>100)this.body.vx=this.body.vy=0;
  this.introRoll=false;this.landingAt=null;this.setMode('fall',Infinity);this.say('稳稳落地，没问题！');this.nextHop=performance.now()+10000;
  if(this.reduced){this.body.y=this.world.floor-this.body.height;this.body.surface='ground';this.rest()}
 }
 tick(now){
  this.frame=null;if(!this.visible)return;const dt=this.last?Math.min((now-this.last)/1000,.035):.016;this.last=now;
  if(!this.drag&&!this.reduced){
   if(this.body.surface){
    this.body.vx=(this.mode==='run'?115:this.mode==='roll'?165:0)*this.facing;
    const edge=this.world.width-this.body.width-12;if(this.body.x<=12||this.body.x>=edge){this.facing*=-1;this.body.x=clamp(this.body.x,13,edge-1);this.body.vx=Math.abs(this.body.vx)*this.facing}
   }
   const wasSurface=this.body.surface,result=worldStep(this.body,dt,this.world);
   if(wasSurface&&!this.body.surface&&this.mode!=='jump'){this.landingAt=null;this.setMode('fall',Infinity)}
   if(result.hit&&['entrance','jump','fall'].includes(this.mode)){
    if(this.landingAt===null){this.landingAt=now;this.setMode('fall',Infinity);this.say(result.surface==='chat'?'这里视野不错，我在上面陪你。':'落地成功！先滚一圈。')}
    if(result.grounded&&now-this.landingAt>=petAnimationFrame('fall',0).duration){
     if(this.introRoll){this.introRoll=false;this.landingAt=null;this.facing=1;this.action('roll')}
     else this.rest(result.surface==='chat'?4200:1800);
    }
   }
   if(!this.hovered&&this.body.surface&&!['fall','entrance','jump'].includes(this.mode)&&now>=this.nextHop){this.jump();this.nextHop=now+16000}
  }
  if(this.hovered)this.hoverPet();
  if(!this.drag&&this.body.surface&&now>=this.until){
   if(this.mode==='pet'&&this.hovered)this.action('pet');
   else if(this.reduced)this.rest(4000);
   else if(this.mode!=='idle'&&this.mode!=='read'&&this.mode!=='talk')this.rest(1800);
   else if(this.chatting)this.rest(3000);
   else if(this.body.surface==='chat'){this.action(Math.random()<.5?'read':'run');this.until=now+(this.mode==='run'?1800:3600)}
   else this.action(['idle','run','run','read','roll'][Math.floor(Math.random()*5)]);
  }
  this.paint(now);this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 paint(now=performance.now()){
  this.el.style.transform=`translate3d(${this.body.x}px,${this.body.y}px,0)`;
  this.el.dataset.surface=this.body.surface||'air';this.el.dataset.bubbleEdge=this.body.y<65?'below':'above';
  const horizontal=this.body.x+this.body.width/2;
  this.el.style.setProperty('--bubble-shift',`${clamp(horizontal,115,this.world.width-115)-horizontal}px`);
  this.actor.style.setProperty('--pet-facing',['run','roll','entrance','jump'].includes(this.mode)?-this.facing:1);
  const flying=this.mode==='entrance'||this.mode==='jump',animation=flying?'roll':this.mode;
  const elapsed=this.mode==='fall'?(this.landingAt===null?0:now-this.landingAt):now-this.motionSince;
  const frame=petAnimationFrame(animation,flying?elapsed%1050:elapsed,this.reduced);
  if(this.sprite){this.sprite.style.backgroundPosition=`${frame.index*100/9}% ${frame.row*100/5}%`;this.sprite.dataset.frame=String(frame.index);this.sprite.dataset.animation=this.mode==='fall'?'release':flying?'roll':this.mode==='read'||this.mode==='talk'?'idle':this.mode}
  if(this.shadow){const p=this.world.platform,surface=p&&this.overPlatform()&&this.body.y+this.body.height<p.top+3?p.top:this.world.floor,distance=Math.max(0,surface-this.body.y-this.body.height);this.shadow.style.left=horizontal+'px';this.shadow.style.top=(surface-4)+'px';this.shadow.style.opacity=String(clamp(.28-distance/1200,.03,.28));this.shadow.style.scale=String(clamp(1-distance/1200,.45,1))}
 }
}
