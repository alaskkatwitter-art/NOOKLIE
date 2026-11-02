'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, BookOpen, Compass, House, Menu, MessageCircle, NotebookPen, X } from 'lucide-react';

type User = { username: string; display_name: string | null; avatar_url: string | null };
const links = [['/inicio', 'Início', House], ['/explorar', 'Explorar', Compass], ['/feed', 'Feed', MessageCircle], ['/biblioteca', 'Biblioteca', BookOpen], ['/escrever', 'Escrever', NotebookPen]] as const;
const drawerLinks = [['/inicio','Meu início'],['/explorar','Buscar histórias e autores'],['/feed','Feed da comunidade'],['/biblioteca','Minha biblioteca'],['/minhas-historias','Minhas histórias'],['/escrever','Escrever'],['/preferencias','Fandoms favoritos'],['/fandoms','Explorar fandoms'],['/eventos','Eventos literários'],['/notificacoes','Notificações'],['/perfil','Meu perfil'],['/configuracoes','Configurações'],['/oportunidades','Oportunidades'],['/politicas','Políticas da comunidade']];

export default function SiteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    profileMenu.current?.removeAttribute('open'); drawer.current?.close();
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        setUser(response.ok && data.authenticated ? data.user : null);
        if (response.ok && data.authenticated) {
          const notifications = await fetch('/api/notifications', { cache: 'no-store', signal: controller.signal });
          const result = notifications.ok ? await notifications.json() : null;
          if (!controller.signal.aborted) setUnread(result?.unread_count || 0);
        } else setUnread(0);
      } catch { /* Navigation remains available offline. */ }
    }
    function closeProfile(event: MouseEvent) { if (profileMenu.current && !profileMenu.current.contains(event.target as Node)) profileMenu.current.removeAttribute('open'); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') profileMenu.current?.removeAttribute('open'); }
    async function refreshNotifications() {
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store', signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (!controller.signal.aborted && data) setUnread(data.unread_count || 0);
      } catch { /* A later navigation retries the badge update. */ }
    }
    window.addEventListener('nooklie:notifications-changed', refreshNotifications);
    document.addEventListener('click', closeProfile); document.addEventListener('keydown', escape);
    void load(); return () => { controller.abort(); document.removeEventListener('click', closeProfile); document.removeEventListener('keydown', escape); window.removeEventListener('nooklie:notifications-changed', refreshNotifications); };
  }, [pathname]);
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      setUser(null); setUnread(0); profileMenu.current?.removeAttribute('open');
      router.replace('/'); router.refresh();
    } catch { setError('Não foi possível sair. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <>
    <header className="site-shell"><div className="site-shell-inner">
      <div className="flex items-center gap-1 sm:gap-3"><button type="button" className="shell-icon" aria-label="Abrir menu de navegação" onClick={() => drawer.current?.showModal()}><Menu size={22} /></button><button type="button" className="shell-icon text-sm" aria-label="Voltar para a página anterior" onClick={() => window.history.length > 1 ? router.back() : router.push('/inicio')}>←</button></div>
      <Link href={user ? '/inicio' : '/'} aria-label="Nooklie — início" className="site-shell-brand"><img src="/icon.svg" alt="" width={48} height={34} /><span className="hidden font-black tracking-[.18em] sm:block">NOOKLIE</span></Link>
      <div className="flex items-center gap-2"><Link href="/notificacoes" className="shell-icon relative" aria-label={unread ? `Notificações: ${unread} não lidas` : 'Notificações'}><Bell size={21} />{unread > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff91c6] px-1 text-[10px] font-bold text-black">{unread > 9 ? '9+' : unread}</span>}</Link>
      {user ? <details ref={profileMenu} className="relative"><summary aria-label="Abrir menu do perfil" className="shell-avatar cursor-pointer list-none">{user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : user.username[0]?.toUpperCase()}</summary><div className="profile-popover"><p className="mb-2 truncate px-3 py-2 text-xs text-[#ffb7da]">@{user.username}</p>{[['/perfil','Perfil'],['/minhas-historias','Minhas histórias'],['/configuracoes','Configurações'],['/preferencias','Fandoms favoritos']].map(([href,label])=><Link href={href} key={href} className="block rounded-xl px-3 py-3 text-sm hover:bg-white/10">{label}</Link>)}<button type="button" onClick={logout} disabled={busy} className="w-full rounded-xl px-3 py-3 text-left text-sm text-[#ffb7da] hover:bg-white/10 disabled:opacity-50">{busy ? 'Saindo…' : 'Sair'}</button>{error && <p role="alert" className="p-3 text-xs text-red-200">{error}</p>}</div></details> : <Link href="/login" className="rounded-full bg-[#ff9bcc] px-4 py-2.5 text-sm font-bold text-[#20101a]">Entrar</Link>}</div>
    </div></header>
    <nav aria-label="Navegação principal" className="site-navigation">{links.map(([href,label,Icon])=><Link key={href} href={href} aria-current={pathname===href ? 'page' : undefined}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>)}</nav>
    <dialog ref={drawer} aria-labelledby="site-menu-title" className="site-drawer" onClick={e=>{if(e.target===e.currentTarget)drawer.current?.close();}}><div className="flex items-center justify-between border-b border-white/10 p-5"><h2 id="site-menu-title" className="font-bold text-[#ffb7da]">Seu cantinho no Nooklie</h2><button type="button" aria-label="Fechar menu" className="shell-icon" onClick={()=>drawer.current?.close()}><X size={22}/></button></div><nav aria-label="Todas as áreas" className="space-y-1 p-4">{drawerLinks.map(([href,label])=><Link href={href} key={href} aria-current={pathname===href?'page':undefined} className="block rounded-xl px-4 py-3 text-sm hover:bg-[#ff9bcc]/10 aria-[current=page]:bg-[#ff9bcc]/15 aria-[current=page]:text-[#ffb7da]">{label}</Link>)}</nav></dialog>
  </>;
}
