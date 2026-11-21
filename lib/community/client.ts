export async function communityRequest(path:string,body?:object|FormData,method='POST',signal?:AbortSignal){
 const response=await fetch(path,{cache:'no-store',signal,...(body?{method,...(body instanceof FormData?{body}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível carregar.');return data;
}
