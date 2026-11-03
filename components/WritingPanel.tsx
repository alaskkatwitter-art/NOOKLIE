"use client";
import { useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  Quote,
  MoreHorizontal,
  Expand,
  Shrink,
  Eye,
  Pencil,
  Minus,
} from "lucide-react";
import FormattedSynopsis from "./FormattedSynopsis";
export default function WritingPanel({
  value,
  onChange,
  maxLength = 2000,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false),
    [preview, setPreview] = useState(false);
  function insert(before: string, after = "") {
    const input = ref.current;
    if (!input || preview) return;
    const { selectionStart: start, selectionEnd: end } = input;
    const next =
      value.slice(0, start) +
      before +
      value.slice(start, end) +
      after +
      value.slice(end);
    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, end + before.length);
    });
  }
  return (
    <div className="writing-panel">
      <div
        className="writing-toolbar"
        role="toolbar"
        aria-label="Ferramentas da sinopse"
      >
        <button
          type="button"
          title="Negrito"
          aria-label="Negrito"
          disabled={preview}
          onClick={() => insert("**", "**")}
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          title="Itálico"
          aria-label="Itálico"
          disabled={preview}
          onClick={() => insert("*", "*")}
        >
          <Italic size={17} />
        </button>
        <button
          type="button"
          title="Subtítulo"
          aria-label="Subtítulo"
          disabled={preview}
          onClick={() => insert("\n## ")}
        >
          <Heading2 size={18} />
        </button>
        <details className="writing-more">
          <summary aria-label="Mais opções de formatação" title="Mais opções">
            <MoreHorizontal size={19} />
          </summary>
          <div>
            <button
              type="button"
              disabled={preview}
              onClick={(e) => {
                insert("“", "”");
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <Quote size={16} />
              Citação
            </button>
            <button
              type="button"
              disabled={preview}
              onClick={(e) => {
                insert("\n— ");
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <Minus size={16} />
              Diálogo
            </button>
            <button
              type="button"
              disabled={preview}
              onClick={(e) => {
                insert("\n\n✦ ✦ ✦\n\n");
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <Minus size={16} />
              Separador
            </button>
          </div>
        </details>
        <span className="flex-1" />
        <button
          type="button"
          title={expanded ? "Reduzir painel" : "Ampliar painel"}
          aria-label={expanded ? "Reduzir painel" : "Ampliar painel"}
          aria-pressed={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Shrink size={17} /> : <Expand size={17} />}
        </button>
        <button
          type="button"
          title={preview ? "Editar sinopse" : "Visualizar sinopse"}
          aria-label={preview ? "Editar sinopse" : "Visualizar sinopse"}
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? <Pencil size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {preview ? (
        <div
          className={
            "p-4 text-sm leading-7 " + (expanded ? "min-h-80" : "min-h-40")
          }
        >
          <FormattedSynopsis text={value || "Sua sinopse aparecerá aqui."} />
        </div>
      ) : (
        <textarea
          ref={ref}
          aria-label="Sinopse da história"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={expanded ? 20 : 7}
          placeholder="Apresente seu universo e convide o leitor a entrar…"
          className="w-full resize-y bg-transparent p-4 text-sm leading-7 outline-none focus:ring-2 focus:ring-inset focus:ring-[#e4a0c4]"
        />
      )}
      <div className="writing-counter">
        <span>
          {value.trim() ? value.trim().split(/\s+/).length : 0} palavras
        </span>
        <span>
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
