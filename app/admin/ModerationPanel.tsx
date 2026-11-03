"use client";

import WarningAction from "@/components/WarningAction";
import { useCallback, useEffect, useState } from "react";

type Report = {
  id: string;
  content_type: "profile" | "post" | "story";
  reason: string;
  details: string;
  content_hidden: boolean;
  status: "pending" | "in_review" | "resolved" | "dismissed";
  internal_notes: string;
  created_at: string;
  reporter: { username: string; display_name: string | null } | null;
  target: { username: string; display_name: string | null } | null;
  content: { title?: string; body?: string } | null;
};

const reasons: Record<string, string> = {
  harassment: "Assédio ou abuso",
  spam: "Spam",
  inappropriate: "Conteúdo inadequado",
  copyright: "Direitos autorais",
  safety: "Segurança",
  other: "Outro",
};

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

export default function ModerationPanel({ canManage }: { canManage: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const data = await api("/api/admin/reports");
    setReports(data.reports || []);
    setNotes(
      Object.fromEntries(
        (data.reports || []).map((report: Report) => [
          report.id,
          report.internal_notes || "",
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    void load().catch((cause: unknown) =>
      setError(
        cause instanceof Error ? cause.message : "Falha ao carregar denúncias.",
      ),
    );
  }, [load]);

  async function update(
    report: Report,
    status: "in_review" | "resolved" | "dismissed",
    content_action: "none" | "hide" | "restore" = "none",
  ) {
    if (!canManage) return;
    if (
      status !== "in_review" &&
      !window.confirm(
        content_action === "hide"
          ? "Resolver e ocultar este conteúdo para a comunidade?"
          : content_action === "restore"
            ? "Resolver e restaurar este conteúdo?"
            : status === "resolved"
              ? "Marcar esta denúncia como resolvida?"
              : "Dispensar esta denúncia?",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/api/admin/reports", {
        method: "PATCH",
        body: JSON.stringify({
          id: report.id,
          status,
          content_action,
          internal_notes: notes[report.id] || "",
          confirm: status !== "in_review",
        }),
      });
      setMessage("Denúncia atualizada e ação registrada no histórico.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao atualizar denúncia.",
      );
    } finally {
      setBusy(false);
    }
  }

  const labels: Record<string, string> = {
    pending: "Pendente",
    in_review: "Em análise",
    resolved: "Resolvida",
    dismissed: "Dispensada",
  };
  const kinds: Record<string, string> = {
    profile: "Perfil",
    post: "Publicação",
    story: "História",
  };
  const visible = reports.filter(
    (r) =>
      filter === "all" ||
      (filter === "open"
        ? !["resolved", "dismissed"].includes(r.status)
        : ["resolved", "dismissed"].includes(r.status)),
  );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Denúncias da comunidade</h2>
          <p className="nook-muted mt-1">
            Abra um relato para analisar os detalhes e registrar uma decisão.
          </p>
        </div>
        <label className="nook-field">
          <span className="sr-only">Filtrar denúncias</span>
          <select
            className="nook-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="open">Em aberto</option>
            <option value="closed">Finalizadas</option>
            <option value="all">Todas</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="nook-status">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="nook-status">
          {message}
        </p>
      )}
      {!visible.length && (
        <p className="nook-card nook-muted">Nenhuma denúncia nesta seleção.</p>
      )}
      {visible.map((report) => (
        <details key={report.id} className="nook-card">
          <summary className="cursor-pointer">
            <span className="text-sm font-bold">
              {report.target?.display_name ||
                report.target?.username ||
                "Conta indisponível"}
            </span>
            <span className="block mt-1 text-xs text-white/50">
              {kinds[report.content_type]} ·{" "}
              {reasons[report.reason] || report.reason} ·{" "}
              {new Date(report.created_at).toLocaleDateString("pt-BR")}
            </span>
            <span className="inline-block mt-3 rounded-full border border-white/10 px-3 py-1 text-[11px] text-pink-200/70">
              {labels[report.status]}
            </span>
          </summary>
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="nook-muted text-xs">
              Enviado por @{report.reporter?.username || "conta indisponível"} ·
              Conteúdo {report.content_hidden ? "oculto" : "visível"}
            </p>
            {report.content?.title && (
              <p className="mt-3 font-semibold text-sm">
                {report.content.title}
              </p>
            )}
            {report.content?.body && (
              <blockquote className="mt-3 border-l-2 border-pink-200/20 pl-3 text-sm text-white/70 whitespace-pre-wrap break-words">
                {report.content.body}
              </blockquote>
            )}
            {report.details && (
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-white/75">
                {report.details}
              </p>
            )}
            {canManage && (
              <div className="mt-5 space-y-4">
                <WarningAction sourceType="report" sourceId={report.id} />
                {!["resolved", "dismissed"].includes(report.status) && (
                  <>
                    <label className="nook-field">
                      Observações internas
                      <textarea
                        value={notes[report.id] || ""}
                        onChange={(e) =>
                          setNotes((current) => ({
                            ...current,
                            [report.id]: e.target.value,
                          }))
                        }
                        maxLength={8000}
                        rows={3}
                        className="nook-input"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={busy}
                        className="discovery-secondary"
                        onClick={() => void update(report, "in_review")}
                      >
                        Em análise
                      </button>
                      <button
                        disabled={busy}
                        className="nook-primary"
                        onClick={() => void update(report, "resolved")}
                      >
                        Resolver
                      </button>
                      <button
                        disabled={busy}
                        className="discovery-secondary"
                        onClick={() =>
                          void update(
                            report,
                            "resolved",
                            report.content_hidden ? "restore" : "hide",
                          )
                        }
                      >
                        Resolver e{" "}
                        {report.content_hidden ? "restaurar" : "ocultar"}
                      </button>
                      <button
                        disabled={busy}
                        className="discovery-secondary"
                        onClick={() => void update(report, "dismissed")}
                      >
                        Dispensar
                      </button>
                    </div>
                  </>
                )}
                {report.status === "resolved" && report.content_hidden && (
                  <button
                    disabled={busy}
                    className="discovery-secondary"
                    onClick={() => void update(report, "resolved", "restore")}
                  >
                    Restaurar conteúdo
                  </button>
                )}
              </div>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}
