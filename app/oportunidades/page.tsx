'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

type Question = { id: string; prompt: string; required?: boolean };
type Opportunity = {
  id: string; department_id: string; title: string; description: string;
  requirements: string; openings: number; questions: Question[];
  opens_at: string; closes_at: string; department: { name: string } | null;
};
type Application = {
  id: string; opportunity_id: string; status: string; created_at: string;
  answers: Record<string, string>;
  opportunity: { title: string; department: { name: string } | null } | null;
};

const statusLabel: Record<string, string> = {
  submitted: 'Enviada', in_review: 'Em análise', approved: 'Aprovada',
  rejected: 'Recusada', cancelled: 'Cancelada',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [opportunitiesResponse, applicationsResponse] = await Promise.all([
        fetch('/api/opportunities', { cache: 'no-store' }),
        fetch('/api/applications/mine', { cache: 'no-store' }),
      ]);
      const opportunitiesData = await opportunitiesResponse.json();
      setOpportunities(opportunitiesResponse.ok && Array.isArray(opportunitiesData.opportunities) ? opportunitiesData.opportunities : []);
      if (applicationsResponse.ok) {
        const applicationsData = await applicationsResponse.json();
        setApplications(Array.isArray(applicationsData.applications) ? applicationsData.applications : []);
      } else {
        setApplications([]);
      }
    } catch {
      setError('Não foi possível carregar as oportunidades. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>, opportunity: Opportunity) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const payload: Record<string, string> = {};
    for (const question of opportunity.questions || []) {
      payload[question.id] = answers[opportunity.id + ':' + question.id] || '';
    }
    try {
      const response = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: opportunity.id, answers: payload }),
      });
      const data = await response.json();
      if (response.status === 401) {
        window.location.href = '/login?next=%2Foportunidades';
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar sua candidatura.');
      setNotice('Candidatura enviada! Você pode acompanhar o status nesta página.');
      setExpanded(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar sua candidatura.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(application: Application) {
    if (!window.confirm('Cancelar esta candidatura?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/applications/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: application.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível cancelar.');
      setNotice('Candidatura cancelada.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar.');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#100b12] px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">

        <header className="mb-8 mt-7 rounded-3xl border border-[#ff78b9]/15 bg-gradient-to-br from-[#281523] to-[#191219] p-6 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff78b9]">NOOKLIE • COMUNIDADE</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">Central de oportunidades</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Faça parte dos projetos, conte um pouco sobre você e acompanhe sua candidatura por aqui.</p>
        </header>

        {error && <p role="alert" className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-2xl border border-green-400/20 bg-green-400/5 p-4 text-sm text-green-200">{notice}</p>}

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold sm:text-2xl">Vagas abertas</h2><p className="mt-1 text-sm text-white/40">As oportunidades são atualizadas pela equipe Nooklie.</p></div></div>
          {loading ? <div className="rounded-2xl border border-white/10 bg-[#191219] p-8 text-center text-sm text-white/40">Carregando oportunidades…</div>
            : opportunities.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-[#191219] p-8 text-center"><p className="font-semibold">Nenhuma vaga aberta no momento</p><p className="mt-2 text-sm text-white/40">Volte em breve para conferir novas oportunidades.</p></div>
            : opportunities.map((opportunity) => {
              const existingApplication = applications.find((application) => application.opportunity_id === opportunity.id);
              return <article key={opportunity.id} className="rounded-2xl border border-white/10 bg-[#191219] p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-[#ff9aca]">{opportunity.department?.name || 'Nooklie'}</p>
                    <h3 className="mt-2 text-xl font-black sm:text-2xl">{opportunity.title}</h3>
                    <p className="mt-2 text-xs text-white/40">{opportunity.openings} vaga(s) · Inscrições até {formatDate(opportunity.closes_at)}</p>
                  </div>
                  {existingApplication ? <span className="rounded-full border border-green-300/20 bg-green-300/5 px-3 py-2 text-xs font-semibold text-green-200">{statusLabel[existingApplication.status] || 'Candidatura registrada'}</span>
                    : <button type="button" onClick={() => { setExpanded(expanded === opportunity.id ? null : opportunity.id); setError(''); }} className="rounded-full bg-[#ff78b9] px-5 py-3 text-sm font-bold text-[#1b1018] hover:brightness-110">Quero me candidatar</button>}
                </div>
                {opportunity.description && <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/70">{opportunity.description}</p>}
                {opportunity.requirements && <div className="mt-5 rounded-xl border border-white/5 bg-[#100b12] p-4"><p className="text-xs font-bold uppercase tracking-wide text-white/45">Requisitos</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/65">{opportunity.requirements}</p></div>}
                {expanded === opportunity.id && !existingApplication && <form onSubmit={(event) => void submit(event, opportunity)} className="mt-5 space-y-4 rounded-2xl border border-[#ff78b9]/20 bg-[#100b12] p-4 sm:p-5">
                  <h4 className="font-bold">Sua candidatura</h4>
                  {(opportunity.questions || []).map((question) => <label key={question.id} className="block text-sm font-semibold text-white/75">{question.prompt}{question.required && <span className="text-[#ff78b9]"> *</span>}
                    <textarea required={Boolean(question.required)} maxLength={8000} rows={4} value={answers[opportunity.id + ':' + question.id] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [opportunity.id + ':' + question.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#191219] px-3 py-3 text-sm text-white outline-none focus:border-[#ff78b9]/50" />
                  </label>)}
                  <div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl bg-[#ff78b9] px-5 py-3 text-sm font-bold text-[#1b1018] disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar candidatura'}</button><button disabled={busy} type="button" onClick={() => setExpanded(null)} className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/65">Cancelar</button></div>
                </form>}
              </article>;
            })}
        </section>

        {applications.length > 0 && <section className="mt-12">
          <h2 className="text-xl font-bold sm:text-2xl">Minhas candidaturas</h2>
          <div className="mt-4 space-y-3">{applications.map((application) => <article key={application.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#191219] p-4">
            <div><p className="font-bold">{application.opportunity?.title || 'Oportunidade'}</p><p className="mt-1 text-xs text-white/40">{application.opportunity?.department?.name || 'Nooklie'} · enviada em {formatDate(application.created_at)}</p></div>
            <div className="flex items-center gap-2"><span className="rounded-full border border-[#ff78b9]/20 px-3 py-2 text-xs font-semibold text-[#ff9aca]">{statusLabel[application.status] || application.status}</span>
              {['submitted', 'in_review'].includes(application.status) && <button disabled={busy} type="button" onClick={() => void cancel(application)} className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/50 hover:text-white">Cancelar inscrição</button>}</div>
          </article>)}</div>
        </section>}
      </div>
    </main>
  );
}
