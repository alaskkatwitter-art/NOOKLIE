import type { Metadata } from 'next';
import { HeartHandshake } from 'lucide-react';

export const metadata: Metadata = { title: 'Doação voluntária | Nooklie' };
export const dynamic = 'force-dynamic';

const goalInCents = 16_000;
const timeZone = 'America/Sao_Paulo';
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function DonationsPage() {
  const now = new Date();
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit' }).format(now);
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { timeZone, month: 'long', year: 'numeric' }).format(now);
  const rawTotal = process.env.NOOKLIE_DONATION_TOTAL_CENTS ?? '';
  const total = Number(rawTotal);
  const hasTotal = process.env.NOOKLIE_DONATION_MONTH === month && /^\d+$/.test(rawTotal) && Number.isSafeInteger(total);
  const configuredUrl = URL.parse(process.env.NOOKLIE_DONATION_URL ?? '');
  const donationUrl = configuredUrl?.protocol === 'https:' && !configuredUrl.username && !configuredUrl.password ? configuredUrl.href : null;

  return <main className="discovery-home px-4 py-12 sm:py-20">
    <section className="mx-auto max-w-2xl rounded-3xl border border-pink-300/25 bg-gradient-to-br from-[#382036] to-[#171018] p-6 sm:p-10">
      <HeartHandshake size={36} className="text-pink-300" aria-hidden="true" />
      <h1 className="mt-5 text-3xl font-bold sm:text-4xl">Doação voluntária</h1>
      <p className="mt-4 max-w-xl leading-7 text-white/80">
        Ajude a manter o Nooklie no ar, gratuito e sem anúncios. Qualquer valor contribui com os custos de manter o site funcionando.
      </p>
      <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
        <h2 className="text-sm font-semibold text-pink-200">Meta mensal</h2>
        <p className="mt-1 text-3xl font-bold">{currency.format(goalInCents / 100)}</p>
        <p className="mt-2 text-sm capitalize text-white/65">{monthLabel}</p>
        {hasTotal ? <>
          <progress className="mt-4 block h-3 w-full overflow-hidden rounded-full accent-pink-400" aria-label="Progresso da meta mensal" value={Math.min(total, goalInCents)} max={goalInCents} />
          <p className="mt-3 text-sm text-white/75">{currency.format(total / 100)} arrecadados neste mês</p>
        </> : <p className="mt-4 text-sm text-white/65">O total arrecadado neste mês ainda não foi divulgado.</p>}
      </div>
      {donationUrl ? <a className="nook-primary mt-6 inline-flex items-center" href={donationUrl} target="_blank" rel="noopener noreferrer">Fazer uma doação</a>
        : <p className="mt-6 text-sm text-pink-200">O canal de doação estará disponível em breve.</p>}
      <p className="mt-4 text-sm leading-6 text-white/65">A contribuição é opcional. Todas as funções continuam gratuitas para a comunidade.</p>
    </section>
  </main>;
}
