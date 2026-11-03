"use client";

import { contentMediaUrl } from "@/lib/security/content-media";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  Compass,
  House,
  Menu,
  MessageCircle,
  NotebookPen,
  X,
  UserRound,
  Settings,
  Library,
  CalendarDays,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Briefcase,
  Users,
  LogOut,
} from "lucide-react";

type User = {
  username: string;
  display_name: string | null;
  bio?: string | null;
  avatar_url: string | null;
};
const links = [
  ["/inicio", "Início", House],
  ["/explorar", "Explorar", Compass],
  ["/feed", "Feed", MessageCircle],
  ["/biblioteca", "Biblioteca", BookOpen],
  ["/escrever", "Escrever", NotebookPen],
] as const;
const drawerLinks = [
  ["/chat", "Mensagens", MessageCircle],
  ["/minhas-historias", "Minhas histórias", NotebookPen],
  ["/eventos", "Eventos literários", CalendarDays],
  ["/fandoms", "Meus universos", Sparkles],
  ["/solicitacoes", "Solicitações de seguidores", Users],
  ["/oportunidades", "Faça parte da equipe", Briefcase],
] as const;

export default function SiteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [unread, setUnread] = useState(0);
  const [staff, setStaff] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    profileMenu.current?.removeAttribute("open");
    drawer.current?.close();
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        setUser(response.ok && data.authenticated ? data.user : null);
        if (response.ok && data.authenticated) {
          const [access, notifications] = await Promise.all([
            fetch("/api/admin/access", {
              cache: "no-store",
              signal: controller.signal,
            }),
            fetch("/api/notifications", {
              cache: "no-store",
              signal: controller.signal,
            }),
          ]);
          const permissions = access.ok ? await access.json() : null;
          if (!controller.signal.aborted) {
            setStaff(Boolean(permissions?.moderation_allowed));
            setAdmin(Boolean(permissions?.allowed));
          }
          const result = notifications.ok ? await notifications.json() : null;
          if (!controller.signal.aborted) setUnread(result?.unread_count || 0);
        } else {
          setUnread(0);
          setStaff(false);
          setAdmin(false);
        }
      } catch {
        /* Navigation remains available offline. */
      }
    }
    function closeProfile(event: MouseEvent) {
      if (
        profileMenu.current &&
        !profileMenu.current.contains(event.target as Node)
      )
        profileMenu.current.removeAttribute("open");
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") profileMenu.current?.removeAttribute("open");
    }
    async function refreshNotifications() {
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = response.ok ? await response.json() : null;
        if (!controller.signal.aborted && data)
          setUnread(data.unread_count || 0);
      } catch {
        /* A later navigation retries the badge update. */
      }
    }
    window.addEventListener(
      "nooklie:notifications-changed",
      refreshNotifications,
    );
    document.addEventListener("click", closeProfile);
    document.addEventListener("keydown", escape);
    void load();
    return () => {
      controller.abort();
      document.removeEventListener("click", closeProfile);
      document.removeEventListener("keydown", escape);
      window.removeEventListener(
        "nooklie:notifications-changed",
        refreshNotifications,
      );
    };
  }, [pathname]);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      setUser(null);
      setUnread(0);
      profileMenu.current?.removeAttribute("open");
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="site-shell">
        <div className="site-shell-inner">
          <div className="flex items-center gap-1 sm:gap-3">
            <button
              type="button"
              className="shell-icon"
              aria-label="Abrir menu de navegação"
              onClick={() => drawer.current?.showModal()}
            >
              <Menu size={22} />
            </button>
          </div>
          <Link
            href={user ? "/inicio" : "/"}
            aria-label="Nooklie — início"
            className="site-shell-brand"
          >
            <img src="/icon.svg" alt="" width={48} height={34} />
            <span className="hidden font-black tracking-[.18em] sm:block">
              NOOKLIE
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/notificacoes"
              className="shell-icon relative"
              aria-label={
                unread ? `Notificações: ${unread} não lidas` : "Notificações"
              }
            >
              <Bell size={21} />
              {unread > 0 && (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff91c6] px-1 text-[10px] font-bold text-black">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            {user ? (
              <details ref={profileMenu} className="relative">
                <summary
                  aria-label="Abrir menu do perfil"
                  className="shell-avatar cursor-pointer list-none"
                >
                  {user.avatar_url ? (
                    <img
                      src={contentMediaUrl(user.avatar_url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    user.username[0]?.toUpperCase()
                  )}
                </summary>
                <div className="profile-popover">
                  <p className="mb-2 truncate px-3 py-2 text-xs text-[#ffb7da]">
                    @{user.username}
                  </p>
                  {[
                    ["/perfil", "Perfil"],
                    ["/minhas-historias", "Minhas histórias"],
                    ["/configuracoes", "Configurações"],
                    ["/preferencias", "Fandoms favoritos"],
                  ].map(([href, label]) => (
                    <Link
                      href={href}
                      key={href}
                      className="block rounded-xl px-3 py-3 text-sm hover:bg-white/10"
                    >
                      {label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={logout}
                    disabled={busy}
                    className="w-full rounded-xl px-3 py-3 text-left text-sm text-[#ffb7da] hover:bg-white/10 disabled:opacity-50"
                  >
                    {busy ? "Saindo…" : "Sair"}
                  </button>
                  {error && (
                    <p role="alert" className="p-3 text-xs text-red-200">
                      {error}
                    </p>
                  )}
                </div>
              </details>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-[#ff9bcc] px-4 py-2.5 text-sm font-bold text-[#20101a]"
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>
      <nav aria-label="Navegação principal" className="site-navigation">
        {links.map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <dialog
        ref={drawer}
        aria-labelledby="site-menu-title"
        className="site-drawer"
        onClick={(e) => {
          if (e.target === e.currentTarget) drawer.current?.close();
        }}
      >
        <div className="drawer-cover">
          <span className="drawer-wordmark font-nooklie-logo">NOOKLIE</span>
          <button
            type="button"
            aria-label="Fechar menu"
            className="shell-icon"
            onClick={() => drawer.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <div className="drawer-identity">
          <Link href={user ? "/perfil" : "/login"} className="drawer-photo">
            {user?.avatar_url ? (
              <img src={contentMediaUrl(user.avatar_url)} alt="" />
            ) : (
              <UserRound size={27} />
            )}
          </Link>
          <h2 id="site-menu-title">
            {user?.display_name ||
              user?.username ||
              "Seu cantinho de histórias"}
          </h2>
          <p>
            {user ? "@" + user.username : "Entre para encontrar seu universo."}
          </p>
          <span className="drawer-tag">
            <BookOpen size={13} />
            {user?.bio?.slice(0, 100) || "Uma história de cada vez"}
          </span>
        </div>
        <nav aria-label="Mais áreas" className="drawer-links">
          {drawerLinks.map(([href, label, Icon]) => (
            <Link
              href={href}
              key={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <span>
                <Icon size={20} />
              </span>
              {label}
            </Link>
          ))}
          {staff && (
            <Link href="/moderacao">
              <span>
                <ShieldCheck size={20} />
              </span>
              Central de moderação
            </Link>
          )}
        </nav>
        <nav
          aria-label="Sua conta e ajuda"
          className="drawer-links drawer-bottom"
        >
          <Link href="/perfil">
            <span>
              <UserRound size={20} />
            </span>
            Meu perfil
          </Link>
          <Link href="/configuracoes">
            <span>
              <Settings size={20} />
            </span>
            Configurações
          </Link>
          <Link href="/ouvidoria">
            <span>
              <HeartHandshake size={20} />
            </span>
            Ouvidoria e ajuda
          </Link>
          <Link href="/politicas">
            <span>
              <Library size={20} />
            </span>
            Políticas da comunidade
          </Link>
          {admin && (
            <Link href="/admin">
              <span>
                <ShieldCheck size={20} />
              </span>
              Administração da equipe
            </Link>
          )}
          {user && (
            <button type="button" disabled={busy} onClick={logout}>
              <span>
                <LogOut size={20} />
              </span>
              {busy ? "Saindo…" : "Sair da conta"}
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </nav>
      </dialog>
    </>
  );
}
