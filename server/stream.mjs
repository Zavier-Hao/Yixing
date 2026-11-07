export async function* readProviderStream(body){
 const decoder=new TextDecoder();let pending='';
 for await(const chunk of body){pending+=decoder.decode(chunk,{stream:true});let end;
  while((end=pending.indexOf('\n'))!==-1){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(data==='[DONE]')return;if(!data)continue;let payload;try{payload=JSON.parse(data)}catch{throw new Error('PROVIDER_STREAM_INVALID')}
   if(payload.error)throw new Error('PROVIDER_STREAM_ERROR');const text=payload.choices?.[0]?.delta?.content;if(typeof text==='string'&&text)yield text;
  }
 }
 pending+=decoder.decode();if(pending.trim().startsWith('data:')){const tail=pending.trim().slice(5).trim();if(tail==='[DONE]')return;if(tail){const p=JSON.parse(tail);if(p.error)throw new Error('PROVIDER_STREAM_ERROR');const text=p.choices?.[0]?.delta?.content;if(typeof text==='string')yield text;}}
 throw new Error('PROVIDER_STREAM_TRUNCATED');
}
