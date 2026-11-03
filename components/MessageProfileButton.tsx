"use client";
import { MessageCircle, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function MessageProfileButton({
  profileId,
}: {
  profileId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: profileId }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      router.push("/chat?thread=" + data.thread_id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir a conversa.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Conversar com este perfil"
        title="Conversar"
        disabled={busy}
        onClick={start}
        className="shell-icon border border-white/15 disabled:opacity-40"
      >
        {busy ? <LoaderCircle size={19} /> : <MessageCircle size={19} />}
      </button>
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl bg-[#332239] p-3 text-xs text-rose-100 shadow-xl"
        >
          {error}
        </p>
      )}
    </div>
  );
}
