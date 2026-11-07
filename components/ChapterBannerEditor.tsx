"use client";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import ChapterBanner from "./ChapterBanner";
import { chapterBannerTypes, maxChapterBannerBytes } from "@/lib/stories/chapter-banner";
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
  const [youtube, setYoutube] = useState("");
  async function save(media?: File | string) {
    if (media instanceof File && media.size > maxChapterBannerBytes) {
      setError("Escolha uma imagem ou vídeo de até 4 MB.");
      if (input.current) input.current.value = "";
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      if (typeof media === "string") body.set("youtube", media);
      else if (media) body.set("file", media);
      else body.set("remove", "true");
      const r = await fetch(`/api/chapters/${chapterId}/banner`, {
        method: "PUT",
        body,
      });
      const data = await r.json().catch(() => null);
      if (!r.ok)
        throw Error(data?.error || "Não foi possível alterar o banner.");
      onChange(data.banner_url);
      setYoutube("");
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
      <p className="mt-2 text-xs leading-6 text-white/65">
        Adicione uma imagem, um vídeo MP4 ou WebM de até 4 MB ou um link do YouTube. O banner aparece acima do título.
      </p>
      {value && <ChapterBanner value={value} className="mt-3 max-h-40 w-full rounded-xl" />}
      <input
        ref={input}
        type="file"
        accept={chapterBannerTypes.join(",")}
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
        {busy ? "Salvando…" : "Enviar da galeria"}
      </button>
      <label className="mt-3 block text-xs text-white/75">
        Link do YouTube
        <input type="url" value={youtube} onChange={event => setYoutube(event.target.value)} maxLength={512}
          className="nook-input mt-2 w-full" placeholder="https://youtu.be/…" />
      </label>
      <button type="button" disabled={busy || !youtube.trim()} onClick={() => void save(youtube)} className="nook-choice mt-2 w-full disabled:opacity-50">
        Usar vídeo do YouTube
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
