"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Flag, ShieldBan, VolumeX } from "lucide-react";
export default function Page() {
  return (
    <Suspense>
      <ProfileControl />
    </Suspense>
  );
}
function ProfileControl() {
  const { username } = useParams<{ username: string }>();
  const params = useSearchParams();
  const id = params.get("id") || "";
  const action = params.get("acao") || "report";
  const [blocked, setBlocked] = useState(false),
    [muted, setMuted] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/profile/control?target=" + encodeURIComponent(id), {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            r.status === 401
              ? "Entre na sua conta para continuar."
              : "Não foi possível carregar as opções.",
          );
        const d = await r.json();
        if (!c.signal.aborted) {
          setBlocked(d.blocked);
          setMuted(d.muted);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [id]);
  const report = action === "report";
  const block = action === "block";
  const valid = ["report", "block", "mute"].includes(action);
  const Icon = report ? Flag : block ? ShieldBan : VolumeX;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const res = await fetch(
        report ? "/api/reports" : "/api/profile/control",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            report
              ? {
                  content_type: "profile",
                  content_id: id,
                  reason: f.get("reason"),
                  details: f.get("details"),
                }
              : {
                  target: id,
                  action: block
                    ? blocked
                      ? "unblock"
                      : "block"
                    : muted
                      ? "unmute"
                      : "mute",
                },
          ),
        },
      );
      const d = await res.json().catch(() => null);
      if (!res.ok) throw Error(d?.error || "Não foi possível concluir.");
      setDone(
        report
          ? "Denúncia enviada. A equipe responsável vai analisar o seu relato."
          : block
            ? blocked
              ? "Perfil desbloqueado."
              : "Perfil bloqueado. Você não receberá novas mensagens dessa pessoa."
            : muted
              ? "Perfil deixou de estar silenciado."
              : "Perfil silenciado. As publicações não aparecerão no seu Feed.",
      );
      if (block) setBlocked(!blocked);
      else if (!report) setMuted(!muted);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="nook-page">
      <div className="max-w-xl mx-auto">
        <p className="nook-eyebrow">Sua experiência, suas escolhas</p>
        <h1 className="mt-2 flex items-center gap-3">
          <Icon size={26} />
          {report
            ? "Denunciar perfil"
            : block
              ? "Bloquear perfil"
              : "Silenciar perfil"}
        </h1>
        <p className="nook-muted mt-3">@{username}</p>
        <div className="nook-card mt-6">
          {valid ? (
            <form onSubmit={submit} className="space-y-5">
              {report ? (
                <>
                  <p className="nook-muted">
                    Conte o que aconteceu. Seu relato é privado e será analisado
                    pela administração ou por moderadores autorizados.
                  </p>
                  <label className="nook-field">
                    Motivo
                    <select name="reason" className="nook-input" required>
                      <option value="harassment">Assédio ou abuso</option>
                      <option value="spam">Spam</option>
                      <option value="inappropriate">Conteúdo inadequado</option>
                      <option value="copyright">Direitos autorais</option>
                      <option value="safety">Segurança</option>
                      <option value="other">Outro</option>
                    </select>
                  </label>
                  <label className="nook-field">
                    Seu relato
                    <textarea
                      className="nook-input"
                      name="details"
                      rows={5}
                      maxLength={3000}
                      placeholder="Inclua detalhes que ajudem a equipe a entender a situação."
                    />
                  </label>
                </>
              ) : (
                <p className="nook-muted">
                  {block
                    ? "O bloqueio impede a troca de mensagens e o acesso ao conteúdo entre vocês enquanto estiverem conectados. As conexões de seguidores serão removidas. Você pode desbloquear depois."
                    : "Silenciar esconde as publicações, stories e notificações dessa pessoa, sem deixar de seguir. Ela não será avisada. Você pode desfazer quando quiser."}
                </p>
              )}
              {done ? (
                <p className="nook-status" role="status">
                  {done}
                </p>
              ) : (
                <button className="nook-primary" disabled={busy || !loaded}>
                  {busy
                    ? "Salvando…"
                    : report
                      ? "Enviar denúncia"
                      : block
                        ? blocked
                          ? "Desbloquear perfil"
                          : "Confirmar bloqueio"
                        : muted
                          ? "Deixar de silenciar"
                          : "Confirmar silêncio"}
                </button>
              )}
            </form>
          ) : (
            <p>Opção não encontrada.</p>
          )}
          {error && (
            <p role="alert" className="nook-status mt-4">
              {error}
            </p>
          )}
        </div>
        <Link
          className="discovery-secondary mt-5"
          href={"/perfil/" + encodeURIComponent(username)}
        >
          Ver perfil
        </Link>
      </div>
    </main>
  );
}
