import { NextResponse } from 'next/server';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1AuthorInvites } from '@/lib/database/d1-author-invites';
const headers = { 'Cache-Control':'no-store, private', Vary:'Cookie' };
async function handle(request: Request, join: boolean) {
  try {
    if (join && ((request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'))
      return NextResponse.json({error:'Origem não permitida.'},{status:403,headers});
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({error:'Entre na sua conta para participar.'},{status:401,headers});
    const db = getD1PreviewDatabase('auth');
    if (!db) return NextResponse.json({error:'Convites indisponíveis no momento.'},{status:503,headers});
    const invites = d1AuthorInvites(db);
    const data = join ? await invites.participate(user.sessionTokenHash) : await invites.dashboard(user.sessionTokenHash);
    if (!data) return NextResponse.json({error:'Perfil indisponível.'},{status:403,headers});
    if (join && data.is_private) return NextResponse.json({error:'Seu perfil precisa ser público para receber leitores pelo convite.'},{status:403,headers});
    return NextResponse.json(data,{headers});
  } catch {
    return NextResponse.json({error:'Não foi possível carregar seus convites. Tente novamente.'},{status:500,headers});
  }
}
export async function GET(request: Request) { return handle(request,false); }
export async function POST(request: Request) { return handle(request,true); }
