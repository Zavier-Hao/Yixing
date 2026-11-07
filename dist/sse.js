export async function* decodeChatSSE(body){
 const decoder=new TextDecoder();let buffer='';
 for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});if(buffer.length>100000)throw new Error('响应格式异常');let end;while((end=buffer.indexOf('\n\n'))!==-1){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);for(const line of event.split('\n'))if(line.startsWith('data:'))yield JSON.parse(line.slice(5).trim());}}
 if(buffer.trim())throw new Error('对话连接提前结束');
}
