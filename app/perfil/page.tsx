'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
export default function MyProfilePage() {
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me?summary=1', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) { router.replace('/login'); return; }
      const data = await response.json();
      if (!response.ok || !data.user?.username) throw Error('Não foi possível abrir seu perfil.');
      if (!controller.signal.aborted) router.replace('/perfil/' + encodeURIComponent(data.user.username));
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível abrir seu perfil. Atualize a página para tentar novamente.'); });
    return () => controller.abort();
  }, [router]);
  return <main className="profile-editor-page"><p role={error ? 'alert' : 'status'}>{error || 'Abrindo seu perfil…'}</p></main>;
}
