"use client";
import { useCallback, useEffect, useState } from "react";
import { HeartHandshake, Send } from "lucide-react";
type Ticket = {
  id: string;
  subject: string;
  details: string;
  status: string;
  response: string;
  created_at: string;
};
const labels: Record<string, string> = {
  pending: "Recebido",
  in_review: "Em análise",
  resolved: "Respondido",
  dismissed: "Encerrado",
};
export default function Ombudsman() {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/support", { cache: "no-store" });
    if (!r.ok)
      throw Error(
        r.status === 401
          ? "Entre na sua conta para falar com a ouvidoria."
          : "Não foi possível carregar seus relatos.",
      );
    setTickets((await r.json()).tickets);
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  return (
    <main className="nook-page">
      <p className="nook-eyebrow">Estamos aqui para ouvir</p>
      <h1 className="mt-2 flex items-center gap-3">
        <HeartHandshake size={30} />
        Ouvidoria
      </h1>
      <p className="nook-muted mt-3 max-w-xl">
        Precisa de ajuda, quer sugerir uma melhoria ou relatar uma situação?
        Fale com a equipe. Seu relato é privado.
      </p>
      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <form
          className="nook-card space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/support", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  category: f.get("category"),
                  subject: f.get("subject"),
                  details: f.get("details"),
                  target_username: String(f.get("target") || "")
                    .trim()
                    .replace(/^@/, "")
                    .toLowerCase(),
                }),
              });
              const d = await r.json().catch(() => null);
              if (!r.ok)
                throw Error(
                  d?.error ||
                    "Não foi possível enviar. Confira se você está conectado.",
                );
              form.reset();
              setSent(true);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="text-lg font-bold">Como podemos ajudar?</h2>
          <label className="nook-field">
            Tipo de relato
            <select name="category" className="nook-input">
              <option value="help">Preciso de ajuda</option>
              <option value="feedback">Sugestão ou opinião</option>
              <option value="safety">Convivência e segurança</option>
              <option value="appeal">Revisão de uma decisão</option>
            </select>
          </label>
          <label className="nook-field">
            Assunto
            <input
              name="subject"
              required
              minLength={3}
              maxLength={120}
              className="nook-input"
            />
          </label>
          <label className="nook-field">
            Seu relato
            <textarea
              name="details"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              className="nook-input"
            />
          </label>
          <label className="nook-field">
            Username envolvido, se houver
            <input
              name="target"
              maxLength={31}
              placeholder="@username · opcional"
              className="nook-input"
            />
          </label>
          <p className="nook-muted text-xs">
            Você não precisa informar nome real, e-mail ou telefone.
          </p>
          <button disabled={busy} className="nook-primary">
            <Send size={16} />
            {busy ? "Enviando…" : "Enviar relato"}
          </button>
          {sent && (
            <p role="status" className="nook-status">
              Relato recebido. Acompanhe a resposta por aqui e nas notificações.
            </p>
          )}
          {error && (
            <p role="alert" className="nook-status">
              {error}
            </p>
          )}
        </form>
        <section>
          <h2 className="text-lg font-bold mb-4">Seus relatos</h2>
          {!tickets.length && (
            <p className="nook-muted nook-card">
              Seus relatos e as respostas da equipe aparecerão aqui.
            </p>
          )}
          <div className="space-y-3">
            {tickets.map((t) => (
              <details key={t.id} className="nook-card">
                <summary>
                  <span className="text-sm font-bold">{t.subject}</span>
                  <span className="block text-xs text-pink-200/60 mt-1">
                    {labels[t.status]} ·{" "}
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </summary>
                <p className="nook-muted mt-4 whitespace-pre-wrap">
                  {t.details}
                </p>
                {t.response && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="text-xs font-semibold text-pink-200">
                      Resposta da equipe
                    </p>
                    <p className="nook-muted mt-2 whitespace-pre-wrap">
                      {t.response}
                    </p>
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
