import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders } from '@/lib/discovery/server';

export async function GET() {
  try {
    const reader = await getDiscoveryReader();
    if (!reader) return NextResponse.json({ error: 'Entre para acessar seu início.' }, { status: 401, headers: privateHeaders });
    const { data, error } = await discoveryDb.rpc('discovery_home', { p_account: reader.accountId });
    if (error) throw error;
    return NextResponse.json({ ...data, user: reader.profile }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar suas leituras. Tente novamente.' }, { status: 503, headers: privateHeaders });
  }
}
