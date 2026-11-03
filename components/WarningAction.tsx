"use client";
import { useRef, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
export default function WarningAction({
  sourceType,
  sourceId,
  targetName,
}: {
  sourceType: "report" | "support" | "chat";
  sourceId: string;
  targetName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={done}
        onClick={() => dialog.current?.showModal()}
        className="discovery-secondary"
      >
        <ShieldAlert size={16} />
        {done ? "Advertência enviada" : "Aplicar advertência"}
      </button>
      <dialog ref={dialog} className="nook-dialog">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason");
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/moderation/warnings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source_type: sourceType,
                  source_id: sourceId,
                  reason,
                }),
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              setDone(true);
              dialog.current?.close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Aplicar advertência</h2>
            <button
              type="button"
              className="shell-icon"
              aria-label="Fechar"
              onClick={() => dialog.current?.close()}
            >
              <X size={20} />
            </button>
          </div>
          {targetName && (
            <p className="nook-status break-words">
              Conta que receberá a advertência: <strong>@{targetName}</strong>
            </p>
          )}
          <p className="nook-muted">
            A conta responsável receberá uma notificação com a sua orientação.
            Esta decisão ficará registrada no histórico de moderação.
          </p>
          <label className="nook-field">
            Motivo e orientação
            <textarea
              required
              name="reason"
              minLength={10}
              maxLength={2000}
              rows={5}
              className="nook-input"
            />
          </label>
          {error && (
            <p role="alert" className="nook-status">
              {error}
            </p>
          )}
          <button disabled={busy} className="nook-primary">
            {busy ? "Enviando…" : "Confirmar e notificar"}
          </button>
        </form>
      </dialog>
    </>
  );
}
