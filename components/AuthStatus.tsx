'use client';

import AccountBadge from '@/components/AccountBadge';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type User = {
  id: string;
  username: string;
  display_name: string | null; verified?: boolean; is_official?: boolean;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  theme_color: string | null;
};

export default function AuthStatus() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch('/api/auth/me?summary=1', {
          cache: 'no-store',
        });

        if (!response.ok) {
          setUser(null);
          return;
        }

        const data = await response.json();

        if (data.authenticated && data.user) {
          setUser(data.user);
          const accessResponse = await fetch('/api/admin/access', { cache: 'no-store' });
          const access = accessResponse.ok ? await accessResponse.json() : { allowed: false };
          setIsAdmin(access.allowed === true);
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      } catch {
        setUser(null);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });

      setUser(null);
      setIsAdmin(false);
      router.push('/');
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <button
        onClick={() => router.push('/login')}
        className="rounded-full bg-[#ff78b9] px-5 py-2.5 text-sm font-bold text-[#180d15] transition hover:brightness-110"
      >
        Entrar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => router.push('/perfil')}
        className="flex items-center gap-3 rounded-full border border-white/10 bg-[#191219] px-4 py-2 transition hover:border-[#ff78b9]/40"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ff78b9] text-xs font-black text-[#180d15]">
          {user.username.charAt(0).toUpperCase()}
        </div>

        <span className="max-w-[120px] truncate text-sm font-semibold text-white">
          @{user.username}
        </span>
        <AccountBadge account={user} />
      </button>

      {isAdmin && <button
        onClick={() => router.push('/admin')}
        className="rounded-full border border-[#ff78b9]/30 px-4 py-2 text-sm font-semibold text-[#ff9aca] transition hover:bg-[#ff78b9]/10"
      >Painel</button>}

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/50 transition hover:border-[#ff78b9]/40 hover:text-[#ff78b9] disabled:opacity-50"
      >
        {loggingOut ? 'Saindo...' : 'Sair'}
      </button>
    </div>
  );
}
