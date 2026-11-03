"use client";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import ModerationPanel from "@/app/admin/ModerationPanel";
import WarningAction from "@/components/WarningAction";
type Ticket = {
  id: string;
  subject: string;
  details: string;
  status: string;
  internal_notes: string;
  response: string;
  reporter: string;
  target: string | null;
  target_user_id: string | null;
  created_at: string;
};
type ChatReport = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  evidence: { body: string; sender_id: string; has_attachment: boolean } | null;
};
const labels: Record<string, string> = {
  pending: "Pendente",
  in_review: "Em análise",
  resolved: "Resolvido",
  dismissed: "Encerrado",
  reviewed: "Revisado",
};
export default function ModerationWorkspace({
  canManage,
}: {
  canManage: boolean;
}) {
  const [tab, setTab] = useState("reports");
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [chats, setChats] = useState<ChatReport[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (tab === "reports") return;
    const r = await fetch(
      tab === "support" ? "/api/moderation/inbox" : "/api/chat/reports",
      { cache: "no-store" },
    );
    if (!r.ok) throw Error("Não foi possível carregar esta área.");
    const d = await r.json();
    if (tab === "support") setTickets(d.tickets);
    else setChats(d.reports);
  }, [tab]);
  useEffect(() => {
    setError("");
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function review(e: React.FormEvent<HTMLFormElement>, t: Ticket) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const r = await fetch("/api/moderation/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: t.id,
          status: f.get("status"),
          notes: f.get("notes"),
          response: f.get("response"),
        }),
      });
      if (!r.ok) throw Error("Não foi possível registrar a análise.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="nook-page">
      <p className="nook-eyebrow">Cuidar da comunidade</p>
      <h1 className="mt-2 flex items-center gap-3">
        <ShieldCheck size={28} />
        Central de moderação
      </h1>
      <p className="nook-muted mt-3">
        Analise os relatos, registre decisões e oriente as pessoas envolvidas. O
        acesso acompanha as permissões do cargo de cada integrante.
      </p>
      <div
        className="nook-tabs mt-6 mb-6"
        role="group"
        aria-label="Áreas da moderação"
      >
        {[
          ["reports", "Denúncias"],
          ["support", "Ouvidoria"],
          ["chat", "Chat"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="nook-status mb-4">
          {error}
        </p>
      )}
      {tab === "reports" ? (
        <ModerationPanel canManage={canManage} />
      ) : tab === "support" ? (
        <section className="space-y-4">
          {!tickets.length && (
            <p className="nook-card nook-muted">Nenhum relato na ouvidoria.</p>
          )}
          {tickets.map((t) => (
            <details className="nook-card" key={t.id}>
              <summary>
                <span className="text-base font-bold">{t.subject}</span>
                <span className="block mt-1 text-xs text-pink-200/60">
                  {labels[t.status]} · @{t.reporter} ·{" "}
                  {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </span>
              </summary>
              <p className="mt-4 text-sm whitespace-pre-wrap break-words">
                {t.details}
              </p>
              {t.target && (
                <p className="nook-muted mt-3">Perfil envolvido: @{t.target}</p>
              )}
              {canManage && (
                <form
                  className="mt-5 space-y-4"
                  onSubmit={(e) => void review(e, t)}
                >
                  <label className="nook-field">
                    Anotações internas
                    <textarea
                      name="notes"
                      defaultValue={t.internal_notes}
                      maxLength={8000}
                      rows={3}
                      className="nook-input"
                    />
                  </label>
                  <label className="nook-field">
                    Resposta para quem enviou o relato
                    <textarea
                      name="response"
                      defaultValue={t.response}
                      maxLength={3000}
                      rows={3}
                      className="nook-input"
                    />
                  </label>
                  <label className="nook-field">
                    Situação
                    <select
                      name="status"
                      defaultValue={
                        t.status === "pending" ? "in_review" : t.status
                      }
                      className="nook-input"
                    >
                      <option value="in_review">Em análise</option>
                      <option value="resolved">Resolvido</option>
                      <option value="dismissed">Encerrado</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button className="nook-primary" disabled={busy}>
                      Registrar análise
                    </button>
                  </div>
                </form>
              )}
              {canManage && t.target_user_id && (
                <div className="mt-3">
                  <WarningAction sourceType="support" sourceId={t.id} />
                </div>
              )}
            </details>
          ))}
        </section>
      ) : (
        <section className="space-y-4">
          <p className="nook-muted">
            O acesso é registrado. Apenas a mensagem escolhida na denúncia é
            disponibilizada, preservando o restante da conversa.
          </p>
          {!chats.length && (
            <p className="nook-card nook-muted">Nenhuma denúncia de chat.</p>
          )}
          {chats.map((r) => (
            <article key={r.id} className="nook-card">
              <p className="nook-eyebrow">
                {labels[r.status]} ·{" "}
                {new Date(r.created_at).toLocaleDateString("pt-BR")}
              </p>
              <p className="mt-3 text-sm whitespace-pre-wrap break-words">
                {r.reason}
              </p>
              {r.evidence && (
                <blockquote className="mt-4 border-l-2 border-pink-200/30 pl-4 text-sm text-white/70 whitespace-pre-wrap break-words">
                  {r.evidence.body || "Mensagem com anexo"}
                  {r.evidence.has_attachment && (
                    <p className="nook-muted mt-2">
                      Inclui um anexo protegido.
                    </p>
                  )}
                </blockquote>
              )}
              {canManage && (
                <div className="flex flex-wrap gap-3 mt-5">
                  {r.evidence && (
                    <WarningAction sourceType="chat" sourceId={r.id} />
                  )}
                  {r.status === "pending" && (
                    <button
                      disabled={busy}
                      className="discovery-secondary"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const res = await fetch("/api/chat/reports", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: r.id }),
                          });
                          if (!res.ok) throw Error();
                          await load();
                        } catch {
                          setError("Não foi possível registrar a revisão.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Marcar como revisada
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
