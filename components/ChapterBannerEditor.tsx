"use client";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { contentMediaUrl } from "@/lib/security/content-media";
export default function ChapterBannerEditor({
  chapterId,
  value,
  onChange,
}: {
  chapterId: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(file?: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      if (file) body.set("file", file);
      else body.set("remove", "true");
      const r = await fetch(`/api/chapters/${chapterId}/banner`, {
        method: "PUT",
        body,
      });
      const data = await r.json();
      if (!r.ok)
        throw Error(data.error || "Não foi possível alterar o banner.");
      onChange(data.banner_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <ImagePlus size={17} className="text-[#ff9bca]" />
        Banner do capítulo
      </h2>
      <p className="mt-2 text-xs leading-6 text-white/50">
        Aparece acima do título. Imagens no texto podem ser inseridas pela barra
        do editor, na posição do cursor.
      </p>
      {value && (
        <img
          src={contentMediaUrl(value)}
          alt="Banner do capítulo"
          className="mt-3 aspect-[3/1] w-full rounded-xl object-cover"
        />
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) void save(e.target.files[0]);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="nook-choice mt-3 w-full"
      >
        {busy ? "Salvando…" : value ? "Substituir banner" : "Adicionar banner"}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="mt-2 min-h-11 px-2 text-xs text-rose-200"
        >
          Remover banner
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-rose-200">
          {error}
        </p>
      )}
    </section>
  );
}
