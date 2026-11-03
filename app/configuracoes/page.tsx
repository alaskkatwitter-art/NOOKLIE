'use client';

import {contentMediaUrl} from '@/lib/security/content-media';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type UserProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  theme_color: string | null;
};

function CloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M7.5 18.5H17C19.4853 18.5 21.5 16.4853 21.5 14C21.5 11.6304 19.6685 9.68907 17.3445 9.51352C16.6917 6.90473 14.3338 5 11.5 5C8.35051 5 5.7974 7.35271 5.48042 10.4199C3.20692 10.918 1.5 12.9488 1.5 15.25C1.5 17.0459 2.95406 18.5 4.75 18.5H7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M19 12H5M11 18L5 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="8"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 21C4 16.5817 7.58172 13 12 13C16.4183 13 20 16.5817 20 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 9C18 5.68629 15.3137 3 12 3C8.68629 3 6 5.68629 6 9C6 16 3 17 3 19H21C21 17 18 16 18 9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 22H14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 10V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3C7.02944 3 3 6.80558 3 11.5C3 16.1944 7.02944 20 12 20H13.25C14.2165 20 15 19.2165 15 18.25C15 17.4216 15.6716 16.75 16.5 16.75H17.5C19.433 16.75 21 15.183 21 13.25C21 7.58985 16.9706 3 12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="7.5" cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="7" r="1" fill="currentColor" />
      <circle cx="14" cy="7" r="1" fill="currentColor" />
      <circle cx="17" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M10 17L15 12L10 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 12H3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M21 19V5C21 3.89543 20.1046 3 19 3H14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 18L15 12L9 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={enabled}
      className={`relative h-7 w-12 rounded-full transition ${
        enabled ? 'bg-[#ff68ae]' : 'bg-white/10'
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          enabled ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [chapterNotifications, setChapterNotifications] =
    useState(true);
  const [socialNotifications, setSocialNotifications] =
    useState(true);
  const [privateProfile, setPrivateProfile] = useState(false);

  const [preferencesReady,setPreferencesReady]=useState(false);
  const [preferencesError,setPreferencesError]=useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);

      const response = await fetch('/api/auth/me', {
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok || !data.authenticated || !data.user) {
        window.location.href = '/login';
        return;
      }

      setProfile(data.user);
      const prefs=await fetch('/api/profile/privacy',{cache:'no-store'});if(!prefs.ok)throw new Error('Preferências indisponíveis');const savedPrefs=await prefs.json();setPrivateProfile(savedPrefs.is_private);setChapterNotifications(savedPrefs.chapter_notifications);setSocialNotifications(savedPrefs.social_notifications);setPreferencesReady(true);
    } catch (error) {
      setPreferencesError('Não foi possível carregar suas preferências. Recarregue a página antes de salvar.');
      console.error('Erro ao carregar configurações:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if(!preferencesReady)return;
    setSaving(true);
    setSaved(false);

    try{const response=await fetch('/api/profile/privacy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_private:privateProfile,social_notifications:socialNotifications,chapter_notifications:chapterNotifications})});if(!response.ok)throw new Error();setSaved(true);}catch{window.alert('Não foi possível salvar. Tente novamente.');}finally{setSaving(false);}
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Erro ao sair:', error);
    } finally {
      window.location.href = '/login';
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#080609] text-white">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="h-10 w-48 animate-pulse rounded-xl bg-white/5" />
          <div className="mt-8 h-64 animate-pulse rounded-3xl bg-white/5" />
          <div className="mt-5 h-64 animate-pulse rounded-3xl bg-white/5" />
        </div>
      </main>
    );
  }

  const displayName =
    profile?.display_name?.trim() ||
    profile?.username ||
    'Usuário';

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080609] text-white">
      <header className="border-b border-white/8 bg-[#0c090d]/95">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between px-5">
          <Link
            href="/feed"
            className="flex items-center gap-3 transition hover:opacity-80"
          >
            <span className="text-[#ff78b9]">
              <CloudIcon />
            </span>

            <span className="text-xl font-black tracking-tight">
              nooklie
            </span>
          </Link>


        </div>
      </header>

      <div className="relative mx-auto max-w-5xl px-5 py-10 md:py-14">
        <div className="pointer-events-none absolute -left-40 top-0 h-[32rem] w-[32rem] rounded-full bg-[#ff4fa3]/10 blur-3xl" />

        <div className="pointer-events-none absolute -right-40 top-32 h-[30rem] w-[30rem] rounded-full bg-[#ff78b9]/8 blur-3xl" />

        <section className="relative">
          <div className="mb-10">
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">
              Configurações
            </h1>

            <p className="mt-2 text-sm text-white/45">
              Gerencie sua conta e personalize sua experiência no Nooklie.
            </p>
          </div>

          <div className="space-y-5">
            {preferencesError&&<p role="alert"className="mb-4 text-sm text-rose-200">{preferencesError}</p>}
            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.025]">
              <div className="flex items-center gap-3 border-b border-white/8 px-6 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff78b9]/10 text-[#ff78b9]">
                  <UserIcon />
                </div>

                <div>
                  <h2 className="font-bold">Minha conta</h2>
                  <p className="text-xs text-white/35">
                    Informações básicas do seu perfil.
                  </p>
                </div>
              </div>

              <div className="p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  {profile?.avatar_url ? (
                    <img
                      src={contentMediaUrl(profile.avatar_url)}
                      alt=""
                      className="h-20 w-20 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff68ae] to-[#ff91c4] text-2xl font-black text-[#180b12]">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h3 className="text-lg font-bold">
                      {displayName}
                    </h3>

                    <p className="mt-1 text-sm text-white/40">
                      @{profile?.username}
                    </p>

                    {profile?.bio && (
                      <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
                        {profile.bio}
                      </p>
                    )}
                  </div>

                  <Link
                    href="/perfil"
                    className="sm:ml-auto"
                  >
                    <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/65 transition hover:bg-white/10 hover:text-white">
                      Editar perfil
                      <ChevronIcon />
                    </span>
                  </Link>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.025]">
              <div className="flex items-center gap-3 border-b border-white/8 px-6 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff78b9]/10 text-[#ff78b9]">
                  <BellIcon />
                </div>

                <div>
                  <h2 className="font-bold">Notificações</h2>
                  <p className="text-xs text-white/35">
                    Escolha o que você quer receber.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-white/6">
                <div className="flex items-center justify-between gap-5 px-6 py-5">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Atualizações de histórias
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-white/35">
                      Saiba quando histórias que você acompanha recebem novos
                      capítulos.
                    </p>
                  </div>

                  <Toggle
                    enabled={chapterNotifications}
                    onChange={() =>
                      setChapterNotifications((value) => !value)
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-5 px-6 py-5">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Interações sociais
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-white/35">
                      Receba notificações sobre curtidas, comentários e outras
                      interações.
                    </p>
                  </div>

                  <Toggle
                    enabled={socialNotifications}
                    onChange={() =>
                      setSocialNotifications((value) => !value)
                    }
                  />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.025]">
              <div className="flex items-center gap-3 border-b border-white/8 px-6 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff78b9]/10 text-[#ff78b9]">
                  <PaletteIcon />
                </div>

                <div>
                  <h2 className="font-bold">Aparência</h2>
                  <p className="text-xs text-white/35">
                    Personalize a aparência da sua conta.
                  </p>
                </div>
              </div>

              <div className="px-6 py-5">
                <div className="flex items-center justify-between gap-5">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Tema
                    </h3>

                    <p className="mt-1 text-xs text-white/35">
                      O Nooklie utiliza o tema escuro como padrão.
                    </p>
                  </div>

                  <span className="rounded-full border border-[#ff78b9]/20 bg-[#ff78b9]/8 px-4 py-2 text-xs font-bold text-[#ff91c4]">
                    Escuro
                  </span>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.025]">
              <div className="flex items-center gap-3 border-b border-white/8 px-6 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff78b9]/10 text-[#ff78b9]">
                  <LockIcon />
                </div>

                <div>
                  <h2 className="font-bold">Privacidade</h2>
                  <p className="text-xs text-white/35">
                    Controle a visibilidade do seu perfil.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-white/6">
                <div className="flex items-center justify-between gap-5 px-6 py-5">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Perfil privado
                    </h3>

                    <p className="mt-1 max-w-xl text-xs leading-5 text-white/35">
                      Limita quem pode visualizar as informações do seu perfil.
                    </p>
                  </div>

                  <Toggle
                    enabled={privateProfile}
                    onChange={() =>
                      setPrivateProfile((value) => !value)
                    }
                  />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.025]">
              <div className="p-6">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving||!preferencesReady}
                  className="w-full rounded-2xl bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-6 py-3.5 text-sm font-black text-[#180b12] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? 'Salvando...'
                    : saved
                      ? 'Configurações salvas'
                      : 'Salvar configurações'}
                </button>
              </div>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-red-500/10 bg-red-500/[0.025]">
              <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-bold text-red-300">
                    Sair da conta
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-white/35">
                    Encerra sua sessão neste dispositivo.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 rounded-full border border-red-400/20 bg-red-400/5 px-5 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-400/10"
                >
                  <LogOutIcon />
                  Sair
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
