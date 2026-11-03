"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
export default function DeleteStoryButton({
  storyId,
  title,
}: {
  storyId: string;
  title: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stories/" + storyId, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Não foi possível excluir.");
      dialog.current?.close();
      router.replace("/minhas-historias");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
        className="mt-5 flex min-h-11 items-center gap-2 rounded-xl border border-rose-300/20 px-4 py-3 text-sm text-rose-200"
      >
        <Trash2 size={17} />
        Deletar história
      </button>
      <dialog
        ref={dialog}
        className="nook-dialog"
        aria-labelledby="delete-story-title"
        onClose={() => setPassword("")}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <h2 id="delete-story-title" className="text-xl font-bold">
          Deletar “{title}”?
        </h2>
        <p className="mt-4 text-sm leading-7 text-white/70">
          A história e todos os seus capítulos e comentários serão excluídos
          permanentemente. Digite a senha da sua conta para confirmar.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
          className="mt-5 space-y-4"
        >
          <label className="block text-sm">
            Senha da conta
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              maxLength={200}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/20 bg-black/20 px-4"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-200">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
              className="nook-choice"
            >
              Cancelar
            </button>
            <button
              disabled={busy || !password}
              className="min-h-11 rounded-full bg-rose-300 px-5 font-bold text-[#25121e]"
            >
              {busy ? "Excluindo…" : "Excluir permanentemente"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
