'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Settings = { designer_portfolio_enabled: boolean; reviewer_portfolio_enabled: boolean; beta_reader_portfolio_enabled: boolean; translator_portfolio_enabled: boolean; available_for_design_requests: boolean };
const options: { key: keyof Settings; label: string; help: string }[] = [
  { key: 'designer_portfolio_enabled', label: 'Capas feitas por mim', help: 'Exibe histórias com créditos de capa aceitos.' },
  { key: 'reviewer_portfolio_enabled', label: 'Revisões realizadas', help: 'Exibe créditos de revisão aceitos.' },
  { key: 'beta_reader_portfolio_enabled', label: 'Leituras beta', help: 'Exibe créditos de leitura beta aceitos.' },
  { key: 'translator_portfolio_enabled', label: 'Traduções', help: 'Exibe créditos de tradução aceitos.' },
  { key: 'available_for_design_requests', label: 'Disponível para pedidos de design', help: 'Informa no seu perfil que você aceita conversar sobre trabalhos de capa.' },
];

export default function CreditSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/account/credits', { cache: 'no-store' }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao carregar.'); setSettings(data.settings);
  }, []);
  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar.')); }, [load]);

  async function update(key: keyof Settings, value: boolean) {
    if (!settings) return; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/account/credits', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha ao salvar.'); setSettings(data.settings); setNotice('Preferência salva.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#100b12] px-4 py-10 text-white sm:px-6"><section className="mx-auto max-w-2xl space-y-5">
    <Link href="/perfil" className="text-sm text-[#ff9aca]">← Voltar ao perfil</Link><header><h1 className="text-2xl font-bold">Créditos e portfólio</h1><p className="mt-2 text-sm text-white/55">Créditos aparecem somente depois que você aceita o convite. Você pode ocultar cada seção do seu perfil quando quiser.</p><Link href="/conta/colaboracoes" className="mt-3 inline-block text-sm font-semibold text-[#ff9aca] hover:underline">Gerenciar créditos e sair de coautorias</Link></header>
    {error && <p role="alert" className="rounded-xl border border-rose-400/20 p-3 text-sm text-rose-200">{error}</p>}{notice && <p role="status" className="rounded-xl border border-emerald-400/20 p-3 text-sm text-emerald-200">{notice}</p>}
    {settings && options.map((option) => <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><input type="checkbox" checked={settings[option.key]} disabled={busy} onChange={(event) => void update(option.key, event.target.checked)} className="mt-1 accent-[#ff78b9]" /><span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs text-white/45">{option.help}</span></span></label>)}
  </section></main>;
}
