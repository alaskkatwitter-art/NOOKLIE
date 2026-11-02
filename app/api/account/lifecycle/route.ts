import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext({ allowDeactivated: true });
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const body = await request.json();
    const action = body?.action;
    if (!['deactivate', 'reactivate', 'request_deletion'].includes(action)) {
      return NextResponse.json({ error: 'Ação de conta inválida.' }, { status: 400, headers: noStore });
    }

    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('id, deactivated_at').eq('user_id', user.userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404, headers: noStore });

    if (action === 'request_deletion') {
      if (body?.confirmation !== 'EXCLUIR MINHA CONTA') {
        return NextResponse.json({ error: 'Digite EXCLUIR MINHA CONTA para confirmar a solicitação.' }, { status: 400, headers: noStore });
      }
      const { data: pending, error: pendingError } = await supabase.from('account_lifecycle_requests')
        .select('id').eq('profile_id', profile.id).eq('request_type', 'deletion').in('status', ['pending', 'processing']).maybeSingle();
      if (pendingError) throw pendingError;
      if (pending) return NextResponse.json({ error: 'Já existe uma solicitação de exclusão em análise.' }, { status: 409, headers: noStore });
      const { error } = await supabase.from('account_lifecycle_requests').insert({
        profile_id: profile.id,
        request_type: 'deletion',
        options: { confirmation_recorded: true, requested_by_user: true },
      });
      if (error) throw error;
      return NextResponse.json({ requested: true, message: 'Solicitação registrada para análise. Sua conta e suas obras continuam disponíveis até a conclusão da revisão.' }, { status: 202, headers: noStore });
    }

    if (action === 'deactivate') {
      if (profile.deactivated_at) return NextResponse.json({ deactivated: true }, { headers: noStore });
      const now = new Date().toISOString();
      const { error: storyError } = await supabase.from('stories').update({ hidden_by_deactivation: true }).eq('author_id', profile.id);
      if (storyError) throw storyError;
      const { error: updateError } = await supabase.from('profiles').update({ deactivated_at: now }).eq('id', profile.id);
      if (updateError) {
        await supabase.from('stories').update({ hidden_by_deactivation: false }).eq('author_id', profile.id);
        throw updateError;
      }
      const { error: requestError } = await supabase.from('account_lifecycle_requests').insert({ profile_id: profile.id, request_type: 'deactivation', status: 'completed', options: { stories_public: false }, completed_at: now });
      if (requestError) {
        await Promise.all([
          supabase.from('profiles').update({ deactivated_at: null }).eq('id', profile.id),
          supabase.from('stories').update({ hidden_by_deactivation: false }).eq('author_id', profile.id),
        ]);
        throw requestError;
      }
      return NextResponse.json({ deactivated: true, message: 'Conta desativada. Seu perfil e suas histórias deixaram de aparecer publicamente; seus dados e favoritos foram preservados.' }, { headers: noStore });
    }

    if (!profile.deactivated_at) return NextResponse.json({ error: 'Esta conta não está desativada.' }, { status: 409, headers: noStore });
    const { error: updateError } = await supabase.from('profiles').update({ deactivated_at: null }).eq('id', profile.id);
    if (updateError) throw updateError;
    const { error: storiesError } = await supabase.from('stories').update({ hidden_by_deactivation: false }).eq('author_id', profile.id);
    if (storiesError) {
      await supabase.from('profiles').update({ deactivated_at: profile.deactivated_at }).eq('id', profile.id);
      throw storiesError;
    }
    const { error: requestError } = await supabase.from('account_lifecycle_requests').insert({ profile_id: profile.id, request_type: 'reactivation', status: 'completed', completed_at: new Date().toISOString() });
    if (requestError) throw requestError;
    return NextResponse.json({ deactivated: false, message: 'Conta reativada.' }, { headers: noStore });
  } catch (error) {
    console.error('POST /api/account/lifecycle:', error);
    return NextResponse.json({ error: 'Não foi possível atualizar o estado da conta.' }, { status: 500, headers: noStore });
  }
}
