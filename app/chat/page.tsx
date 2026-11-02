import{Suspense}from'react';import ChatClient from'./ChatClient';
export const metadata={title:'Chat privado | Nooklie',robots:{index:false,follow:false}};
export default function ChatPage(){return <Suspense fallback={<main className="discovery-home p-8">Abrindo seu chat…</main>}><ChatClient/></Suspense>;}
