'use client';
import {contentMediaUrl} from '@/lib/security/content-media';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, CheckCheck, RefreshCw } from 'lucide-react';
import { notificationHref } from '@/lib/notifications/presentation';

type NotificationItem = {
  actor?: {username:string;display_name:string|null;avatar_url:string|null}|null;
  id: string;
  title: string;
  body: string;
  href: string | null;
  created_at: string;
  read_at: string | null;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);
  const unread = notifications.filter(item => !item.read_at).length;
  const visible = filter === 'unread' ? notifications.filter(item => !item.read_at) : notifications;

  const loadNotifications = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store', signal });
      if (response.status === 401) {
        if (!signal?.aborted) { setNeedsLogin(true); setNotifications([]); }
        return false;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar suas notificações.');
      if (!signal?.aborted) { setNotifications(Array.isArray(data.notifications) ? data.notifications : []); setNeedsLogin(false); }
      return true;
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar suas notificações.');
      return false;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadNotifications(controller.signal);
    return () => controller.abort();
  }, [loadNotifications]);

  async function markRead(id?: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível marcar como lida.');
      window.dispatchEvent(new Event('nooklie:notifications-changed'));
      if (await loadNotifications()) setMessage(id ? 'Notificação marcada como lida.' : 'Todas as notificações foram marcadas como lidas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar as notificações.'); }
    finally { setBusy(false); }
  }

  return <main className="discovery-home"><div className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
    <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
      <div><div className="flex items-center gap-3"><Bell className="text-[#ffb7da]" size={28} aria-hidden="true"/><h1 className="text-3xl font-bold">Notificações</h1></div><p className="mt-3 text-sm leading-7 text-white/65">Atualizações da sua conta e avisos da equipe Nooklie.</p></div>
      <button type="button" disabled={loading || busy} onClick={() => { setMessage(''); void loadNotifications(); }} className="discovery-secondary disabled:opacity-40"><RefreshCw size={16} aria-hidden="true"/>Atualizar</button>
    </div>
    {!needsLogin && <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
      <div role="group" aria-label="Filtrar notificações" className="flex gap-2">{([['all','Todas'],['unread','Não lidas']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={filter===value} onClick={() => setFilter(value)} className={`min-h-11 rounded-full border px-4 text-sm ${filter===value ? 'border-[#ffb7da]/50 bg-[#ffb7da]/15 text-[#ffd1e7]' : 'border-white/15 text-white/65 hover:bg-white/5'}`}>{label}{value==='unread' && !loading && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">{unread}</span>}</button>)}</div>
      {unread > 0 && <button type="button" disabled={loading || busy} onClick={() => void markRead()} className="flex min-h-11 items-center gap-2 text-sm text-[#ffc4df] disabled:opacity-40"><CheckCheck size={17} aria-hidden="true"/>Marcar todas como lidas</button>}
    </div>}
    {loading && <p role="status" className="py-10 text-sm text-white/60">Carregando suas notificações…</p>}
    {error && <div role="alert" className="mt-6 rounded-2xl border border-rose-300/25 bg-rose-300/5 p-5"><p className="text-sm leading-7 text-rose-100">{error}</p><button type="button" onClick={() => void loadNotifications()} disabled={loading || busy} className="mt-3 min-h-11 text-sm text-[#ffc4df] underline disabled:opacity-40">Tentar novamente</button></div>}
    {message && <p role="status" className="mt-5 text-sm leading-7 text-[#ffc4df]">{message}</p>}
    {!loading && needsLogin && <section className="mt-8 rounded-3xl border border-[#ffb7da]/20 bg-[#241520] p-7 text-center"><BellRing className="mx-auto text-[#ffb7da]" size={36}/><h2 className="mt-5 text-xl font-bold">Entre para ver suas notificações</h2><p className="mt-3 text-sm leading-7 text-white/60">As atualizações desta área são pessoais e ficam vinculadas à sua conta.</p><Link href="/login" className="discovery-secondary mt-6">Entrar na minha conta</Link></section>}
    {!loading && !needsLogin && !error && visible.length===0 && <section className="mt-8 rounded-3xl border border-dashed border-[#ffb7da]/25 p-8 text-center"><Bell className="mx-auto text-[#dbabca]" size={38}/><h2 className="mt-5 text-xl font-bold">{filter==='unread' && notifications.length ? 'Tudo em dia!' : 'Nenhuma notificação por enquanto'}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/60">{filter==='unread' && notifications.length ? 'Você já leu todas as notificações desta lista.' : 'Quando houver uma atualização para sua conta, ela aparecerá aqui.'}</p><Link href="/inicio" className="discovery-secondary mt-6">Minhas leituras</Link></section>}
    {!loading && !needsLogin && visible.length > 0 && <div className="mt-6 space-y-3">{visible.map(item => {
      const href=notificationHref(item.href);
      return <article key={item.id} aria-label={`${item.read_at ? 'Lida' : 'Não lida'}: ${item.title}`} className={`rounded-2xl border p-5 sm:p-6 ${item.read_at ? 'border-white/10 bg-white/[0.025]' : 'border-[#ffb7da]/30 bg-[#ffb7da]/[0.07]'}`}>
        <div className="flex items-start gap-3">{item.actor&&<Link href={'/perfil/'+encodeURIComponent(item.actor.username)} aria-label={'Perfil de '+(item.actor.display_name||item.actor.username)} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ff9bca]/15">{item.actor.avatar_url?<img src={contentMediaUrl(item.actor.avatar_url)} alt="" className="h-full w-full object-cover"/>:item.actor.username[0].toUpperCase()}</Link>}<span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-white/20' : 'bg-[#ff9bcb]'}`} aria-hidden="true"/><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold leading-6">{item.title}</h2>{item.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-white/70">{item.body}</p>}<time dateTime={item.created_at} className="mt-3 block text-xs text-white/45">{new Date(item.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time><div className="mt-4 flex flex-wrap gap-3">{href && <Link href={href} className="discovery-secondary">Ver</Link>}{!item.read_at && <button type="button" disabled={busy || loading} onClick={() => void markRead(item.id)} className="min-h-11 rounded-full border border-white/15 px-4 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40">Marcar como lida</button>}</div></div></div>
      </article>;
    })}<p className="pt-3 text-xs text-white/40">Suas 50 notificações mais recentes.</p></div>}
  </div></main>;
}
