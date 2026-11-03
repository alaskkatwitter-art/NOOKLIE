"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  Users,
  Plus,
  Image as ImageIcon,
  Sticker,
  Mic,
  Send,
  Square,
  X,
  MoreHorizontal,
  Reply,
  Flag,
  ShieldBan,
  Trash2,
  Info,
} from "lucide-react";
import { contentMediaUrl } from "@/lib/security/content-media";
import { chatSafetyNotice, needsSupport } from "@/lib/chat/safety";
import ChatAudio from "@/components/ChatAudio";
type Peer = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};
type Thread = {
  id: string;
  kind: "direct" | "group";
  name: string | null;
  initiator_id: string;
  recipient_id: string | null;
  status: string;
  blocked?: boolean;
  blocked_by_me?: boolean;
  peer?: Peer;
};
type Message = {
  id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  media_type: string | null;
  is_sticker: boolean;
  reply_to: string | null;
  created_at: string;
  read_at: string | null;
};
type Member = { profile_id: string; status: string; profile: Peer | null };
function Avatar({
  peer,
  group = false,
}: {
  peer?: Peer | null;
  group?: boolean;
}) {
  return (
    <span className="chat-avatar">
      {group ? (
        <Users size={20} />
      ) : peer?.avatar_url ? (
        <img src={contentMediaUrl(peer.avatar_url)} alt="" />
      ) : (
        peer?.username[0]?.toUpperCase() || <MessageCircle size={20} />
      )}
    </span>
  );
}
export default function ChatClient() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("thread") || "";
  const [threads, setThreads] = useState<Thread[]>([]),
    [thread, setThread] = useState<Thread | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [me, setMe] = useState(""),
    [tab, setTab] = useState("inbox"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [body, setBody] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [sticker, setSticker] = useState(false),
    [reply, setReply] = useState<Message | null>(null),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [more, setMore] = useState(false),
    [ready, setReady] = useState(false),
    [reportedMessage, setReportedMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    stickerInput = useRef<HTMLInputElement>(null),
    audioInput = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    ticker = useRef<ReturnType<typeof setInterval> | null>(null),
    scroll = useRef<HTMLDivElement>(null),
    report = useRef<HTMLDialogElement>(null),
    group = useRef<HTMLDialogElement>(null),
    bottom = useRef<HTMLDivElement>(null);
  const intent = useRef(false),
    cancelRecording = useRef(false),
    starting = useRef(false),
    pointer = useRef("mouse"),
    activeThread = useRef(selected),
    mounted = useRef(true),
    pinned = useRef(true);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [list, res] = await Promise.all([
          fetch("/api/chat", { cache: "no-store", signal }),
          selected
            ? fetch("/api/chat?thread=" + selected, {
                cache: "no-store",
                signal,
              })
            : Promise.resolve(null),
        ]);
        if (list.status === 401) {
          router.replace("/login");
          return;
        }
        if (!list.ok) throw Error("Não foi possível carregar suas conversas.");
        const l = await list.json();
        if (signal?.aborted || activeThread.current !== selected) return;
        setThreads(l.threads || []);
        setMe(l.me);
        setReady(true);
        if (res) {
          if (!res.ok) throw Error("Esta conversa não está disponível.");
          const d = await res.json();
          if (signal?.aborted || activeThread.current !== selected) return;
          setThread({
            ...d.thread,
            peer: l.threads.find((t: Thread) => t.id === selected)?.peer,
          });
          setMembers(d.members || []);
          setMessages((old) => {
            const older = old.filter(
              (m) =>
                !d.messages.some((n: Message) => n.id === m.id) &&
                m.created_at < (d.messages[0]?.created_at || ""),
            );
            return [...older, ...d.messages];
          });
          setMore(Boolean(d.has_more));
        } else {
          setThread(null);
          setMessages([]);
          setMembers([]);
        }
        setError("");
      } catch (e) {
        if (!signal?.aborted && activeThread.current === selected)
          setError((e as Error).message);
      }
    },
    [router, selected],
  );
  function stopRecord(cancel = false) {
    intent.current = false;
    if (cancel) cancelRecording.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  useEffect(() => {
    activeThread.current = selected;
    cancelRecording.current = true;
    intent.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    setThread(null);
    setMessages([]);
    setReply(null);
    setFile(null);
    setSticker(false);
    setBody("");
    setNotice("");
    pinned.current = true;
    const c = new AbortController();
    void refresh(c.signal);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(c.signal);
    }, 5000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [refresh, selected]);
  useEffect(() => {
    if (pinned.current) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      intent.current = false;
      cancelRecording.current = true;
      if (recordTimer.current) clearTimeout(recordTimer.current);
      if (ticker.current) clearInterval(ticker.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function action(value: string) {
    if (!thread) return;
    setBusy(true);
    setError("");
    try {
      const profileAction =
        thread.kind === "direct" && ["block", "unblock"].includes(value);
      const target =
        thread.initiator_id === me ? thread.recipient_id : thread.initiator_id;
      const r = await fetch(
        profileAction ? "/api/profile/control" : "/api/chat",
        {
          method: profileAction ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            profileAction
              ? { target, action: value }
              : { thread_id: thread.id, action: value },
          ),
        },
      );
      if (!r.ok) throw Error("Não foi possível concluir esta ação.");
      if (value === "leave" || (thread.kind === "group" && value === "deny"))
        router.push("/chat");
      else await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(attachment?: File) {
    if (!thread || busy) return;
    const threadId = thread.id;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("thread_id", threadId);
      form.set("body", attachment ? "" : body);
      if (reply && !attachment) form.set("reply_to", reply.id);
      const chosen = attachment || file;
      if (chosen) form.set("file", chosen);
      if (sticker && !attachment) form.set("sticker", "true");
      const r = await fetch("/api/chat", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível enviar.");
      if (activeThread.current !== threadId) return;
      setBody("");
      setFile(null);
      setSticker(false);
      setReply(null);
      if (input.current) input.current.value = "";
      if (stickerInput.current) stickerInput.current.value = "";
      pinned.current = true;
      await refresh();
    } catch (e) {
      if (mounted.current) {
        if (attachment && activeThread.current === threadId) {
          setFile(attachment);
          setSticker(false);
        }
        setError((e as Error).message);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  async function choose(chosen: File | null, asSticker = false) {
    if (!chosen) return;
    setError("");
    if (chosen.size > 3 * 1024 * 1024) {
      setError("Escolha um arquivo de até 3 MB.");
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        chosen.type,
      )
    ) {
      setError("Escolha uma imagem JPG, PNG, WEBP ou GIF.");
      return;
    }
    // GIF and sticker files retain their original bytes, including animation/transparency.
    if (asSticker || chosen.type === "image/gif") {
      setFile(chosen);
      setSticker(asSticker);
      return;
    }
    try {
      const bitmap = await createImageBitmap(chosen);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.88),
      );
      if (!blob) throw Error();
      setFile(new File([blob], "imagem.webp", { type: "image/webp" }));
      setSticker(false);
    } catch {
      setError("Não foi possível ler esta imagem.");
    }
  }
  async function startRecord(held: boolean) {
    if (starting.current || recorder.current?.state === "recording" || busy)
      return;
    intent.current = true;
    cancelRecording.current = false;
    starting.current = true;
    setRecording(true);
    setSeconds(0);
    setError("");
    const threadId = selected;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error("Seu navegador não permite gravar áudio.");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      stream.current = media;
      if (
        !mounted.current ||
        activeThread.current !== threadId ||
        cancelRecording.current ||
        (held && !intent.current)
      ) {
        media.getTracks().forEach((t) => t.stop());
        if (mounted.current) setRecording(false);
        return;
      }
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      const started = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (recordTimer.current) clearTimeout(recordTimer.current);
        if (ticker.current) clearInterval(ticker.current);
        media.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        intent.current = false;
        if (!mounted.current) return;
        setRecording(false);
        if (
          cancelRecording.current ||
          activeThread.current !== threadId ||
          Date.now() - started < 250
        )
          return;
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (!blob.size) return;
        if (blob.size > 3 * 1024 * 1024) {
          setError("Áudio muito grande. Grave um trecho mais curto.");
          return;
        }
        void sendRef.current(new File([blob], "audio", { type: rec.mimeType }));
      };
      rec.start();
      ticker.current = setInterval(
        () => setSeconds(Math.floor((Date.now() - started) / 1000)),
        1000,
      );
      recordTimer.current = setTimeout(() => stopRecord(), 120000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Permita acesso ao microfone para gravar uma mensagem."
          : (e as Error).name === "NotFoundError"
            ? "Nenhum microfone foi encontrado. Você pode anexar um áudio pelas opções da conversa."
            : "Não foi possível gravar. Confira o microfone ou envie um arquivo de áudio.",
      );
    } finally {
      starting.current = false;
    }
  }
  async function older() {
    if (!messages.length) return;
    setBusy(true);
    try {
      const r = await fetch(
        "/api/chat?thread=" +
          selected +
          "&before=" +
          encodeURIComponent(messages[0].created_at),
        { cache: "no-store" },
      );
      if (!r.ok) throw Error();
      const d = await r.json();
      pinned.current = false;
      const height = scroll.current?.scrollHeight || 0;
      setMessages((current) => [...d.messages, ...current]);
      setMore(d.has_more);
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop += scroll.current.scrollHeight - height;
      });
    } catch {
      setError("Não foi possível carregar as mensagens anteriores.");
    } finally {
      setBusy(false);
    }
  }
  const list = threads.filter((t) =>
    tab === "requests"
      ? t.status === "pending" && (t.kind === "group" || t.recipient_id === me)
      : tab === "spam"
        ? t.kind === "direct" && t.status === "spam" && t.recipient_id === me
        : t.status === "accepted" ||
          (t.kind === "direct" &&
            t.initiator_id === me &&
            t.status === "pending"),
  );
  const groupChat = thread?.kind === "group";
  const peerName = groupChat
    ? thread.name
    : thread?.peer?.display_name || thread?.peer?.username || "Conversa";
  return (
    <main className="chat-page">
      <div className="chat-layout">
        <aside
          className={"chat-sidebar " + (selected ? "chat-sidebar-hidden" : "")}
        >
          <div className="chat-list-heading">
            <div>
              <p className="nook-eyebrow">Seu cantinho</p>
              <h1>Mensagens</h1>
            </div>
            <button
              type="button"
              className="shell-icon"
              aria-label="Criar grupo de até 15 pessoas"
              onClick={() => group.current?.showModal()}
            >
              <Plus size={23} />
            </button>
          </div>
          <div
            className="chat-tabs"
            role="group"
            aria-label="Caixas de mensagens"
          >
            {[
              ["inbox", "Conversas"],
              ["requests", "Convites"],
              ["spam", "Spam"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}

                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="chat-thread-list">
            {list.map((t) => (
              <Link
                key={t.id}
                href={"/chat?thread=" + t.id}
                className={
                  "chat-thread " + (selected === t.id ? "is-active" : "")
                }
              >
                <Avatar peer={t.peer} group={t.kind === "group"} />
                <div className="min-w-0">
                  <p>
                    {t.kind === "group"
                      ? t.name
                      : t.peer?.display_name || t.peer?.username}
                  </p>
                  <span>
                    {t.status === "accepted"
                      ? t.kind === "group"
                        ? "Grupo privado"
                        : "@" + t.peer?.username
                      : t.status === "spam"
                        ? "Spam"
                        : "Convite para conversar"}
                  </span>
                </div>
              </Link>
            ))}
            {ready && !list.length && (
              <div className="p-6 nook-muted">
                {tab === "requests"
                  ? "Seus novos convites aparecerão aqui."
                  : "Nenhuma conversa por aqui. Abra um perfil para conversar ou crie um grupo."}
              </div>
            )}
          </div>
          <details className="chat-about">
            <summary>
              <Info size={14} />
              Sobre o chat
            </summary>
            <p>
              {chatSafetyNotice} As mensagens são protegidas no armazenamento;
              não há criptografia de ponta a ponta.
            </p>
          </details>
        </aside>
        <section
          className={
            "chat-conversation " + (!selected ? "chat-empty-mobile" : "")
          }
          aria-label="Conversa"
        >
          {thread ? (
            <>
              <header className="chat-header">
                <Link
                  className="shell-icon chat-list-toggle"
                  href="/chat"
                  aria-label="Lista de conversas"
                >
                  <MessageCircle size={21} />
                </Link>
                <Avatar peer={thread.peer} group={groupChat} />
                <div className="min-w-0 flex-1">
                  {groupChat ? (
                    <h2 className="truncate font-bold text-sm">{peerName}</h2>
                  ) : (
                    <Link
                      className="truncate block font-bold text-sm"
                      href={"/perfil/" + thread.peer?.username}
                    >
                      {peerName}
                    </Link>
                  )}
                  <p className="text-[11px] text-white/45">
                    {groupChat ? "Grupo · até 15 pessoas" : "Conversa privada"}
                  </p>
                </div>
                <details className="chat-options">
                  <summary
                    className="shell-icon"
                    aria-label="Opções da conversa"
                  >
                    <MoreHorizontal size={22} />
                  </summary>
                  <div>
                    {groupChat ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void action("leave")}
                      >
                        <Users size={16} />
                        Sair do grupo
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            thread.blocked_by_me ? "unblock" : "block",
                          )
                        }
                      >
                        <ShieldBan size={16} />
                        {thread.blocked_by_me
                          ? "Desbloquear"
                          : "Bloquear perfil"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReportedMessage(null);
                        report.current?.showModal();
                      }}
                    >
                      <Flag size={16} />
                      Denunciar conversa
                    </button>
                  </div>
                </details>
              </header>
              {groupChat && members.length > 0 && (
                <details className="chat-members">
                  <summary>
                    <Users size={13} />
                    {members.filter((m) => m.status === "accepted").length}{" "}
                    participantes · ver pessoas
                  </summary>
                  <div>
                    {members.map((m) => (
                      <span key={m.profile_id}>
                        @{m.profile?.username}
                        {m.status === "pending" ? " · convidado" : ""}
                      </span>
                    ))}
                  </div>
                </details>
              )}
              {thread.blocked ? (
                <p className="p-6 nook-muted">
                  Esta conversa está bloqueada. Mensagens e anexos ficam
                  indisponíveis enquanto houver um bloqueio.
                </p>
              ) : (
                <>
                  {thread.status !== "accepted" && (
                    <div className="chat-invite">
                      {groupChat || thread.recipient_id === me ? (
                        <>
                          <h3>
                            {groupChat
                              ? "Você recebeu um convite para este grupo"
                              : "Quer conversar com esta pessoa?"}
                          </h3>
                          <p>
                            Você escolhe se quer participar. Mensagens e anexos
                            ficam disponíveis depois da aceitação.
                          </p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <button
                              disabled={busy}
                              onClick={() => void action("accept")}
                              className="nook-primary"
                            >
                              {groupChat
                                ? "Entrar no grupo"
                                : "Aceitar conversa"}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void action("deny")}
                              className="discovery-secondary"
                            >
                              Recusar
                            </button>
                            {thread.status === "accepted" &&
                              !thread.blocked && (
                                <button
                                  type="button"
                                  disabled={busy || recording}
                                  onClick={() => audioInput.current?.click()}
                                >
                                  <Mic size={16} />
                                  Enviar arquivo de áudio
                                </button>
                              )}
                          </div>
                        </>
                      ) : (
                        <p>
                          Seu convite foi enviado. Aguarde a outra pessoa
                          aceitar para começar a conversa.
                        </p>
                      )}
                    </div>
                  )}
                  <div
                    ref={scroll}
                    className="chat-messages"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      pinned.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                    }}
                  >
                    {more && (
                      <button
                        type="button"
                        onClick={() => void older()}
                        disabled={busy}
                        className="discovery-secondary mx-auto block"
                      >
                        Mensagens anteriores
                      </button>
                    )}
                    {messages.map((m) => {
                      const mine = m.sender_id === me;
                      const quoted = messages.find((n) => n.id === m.reply_to);
                      const author = members.find(
                        (v) => v.profile_id === m.sender_id,
                      )?.profile;
                      return (
                        <div
                          key={m.id}
                          className={"chat-message-row " + (mine ? "mine" : "")}
                        >
                          <article
                            className={
                              "chat-bubble " +
                              (m.is_sticker ? "is-sticker" : "")
                            }
                          >
                            {groupChat && !mine && (
                              <p className="chat-sender">
                                @{author?.username || "participante"}
                              </p>
                            )}
                            {m.reply_to && (
                              <blockquote>
                                {quoted?.body?.slice(0, 120) ||
                                  "Mensagem anterior ou anexo"}
                              </blockquote>
                            )}
                            {m.media_url &&
                              (m.media_type?.startsWith("image/") ? (
                                <a
                                  href={m.media_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={
                                    m.is_sticker
                                      ? "Abrir figurinha"
                                      : "Abrir imagem"
                                  }
                                >
                                  <img
                                    src={contentMediaUrl(m.media_url)}
                                    alt={
                                      m.is_sticker
                                        ? "Figurinha enviada"
                                        : "Imagem enviada"
                                    }
                                    className={
                                      m.is_sticker
                                        ? "chat-sticker"
                                        : "chat-photo"
                                    }
                                    loading="lazy"
                                  />
                                </a>
                              ) : (
                                <ChatAudio src={m.media_url} />
                              ))}
                            {m.body && (
                              <p className="chat-message-text">{m.body}</p>
                            )}
                            <footer className="chat-message-meta">
                              <time dateTime={m.created_at}>
                                {new Date(m.created_at).toLocaleTimeString(
                                  "pt-BR",
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                                {mine && m.read_at && !groupChat
                                  ? " · Lida"
                                  : ""}
                              </time>
                              <details className="chat-message-menu">
                                <summary aria-label="Opções da mensagem">
                                  <MoreHorizontal size={15} />
                                </summary>
                                <div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      setReply(m);
                                      e.currentTarget
                                        .closest("details")
                                        ?.removeAttribute("open");
                                    }}
                                  >
                                    <Reply size={15} />
                                    Responder
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      setReportedMessage(m.id);
                                      report.current?.showModal();
                                      e.currentTarget
                                        .closest("details")
                                        ?.removeAttribute("open");
                                    }}
                                  >
                                    <Flag size={15} />
                                    Denunciar
                                  </button>
                                </div>
                              </details>
                            </footer>
                            {mine && needsSupport(m.body) && (
                              <aside className="chat-support">
                                Se precisar de apoio, procure uma pessoa de
                                confiança ou um serviço de ajuda da sua região.
                                Em perigo imediato, procure um serviço de
                                emergência. Você também pode falar com a{" "}
                                <Link href="/ouvidoria">ouvidoria</Link>. Este
                                aviso automático não envia a conversa à equipe.
                              </aside>
                            )}
                          </article>
                        </div>
                      );
                    })}
                    <div ref={bottom} />
                  </div>
                  {thread.status === "accepted" && (
                    <form
                      className="chat-compose"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                      }}
                    >
                      {reply && (
                        <div className="chat-compose-context">
                          <span>
                            Respondendo: {reply.body.slice(0, 100) || "Anexo"}
                          </span>
                          <button
                            type="button"
                            aria-label="Cancelar resposta"
                            onClick={() => setReply(null)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                      {file && (
                        <div className="chat-compose-context">
                          <span>
                            {sticker
                              ? "Figurinha pronta"
                              : file.type.startsWith("audio/")
                                ? "Áudio pronto"
                                : "Imagem pronta"}{" "}
                            · {(file.size / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            aria-label="Remover anexo"
                            onClick={() => {
                              setFile(null);
                              setSticker(false);
                            }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                      <input
                        ref={input}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        hidden
                        onChange={(e) => {
                          void choose(e.target.files?.[0] || null);
                          e.target.value = "";
                        }}
                      />
                      <input
                        ref={audioInput}
                        type="file"
                        accept="audio/*"
                        hidden
                        onChange={(e) => {
                          const chosen = e.target.files?.[0];
                          e.target.value = "";
                          if (!chosen) return;
                          if (
                            !chosen.type.startsWith("audio/") ||
                            chosen.size > 3 * 1024 * 1024
                          ) {
                            setError("Escolha um áudio de até 3 MB.");
                            return;
                          }
                          setFile(chosen);
                          setSticker(false);
                          setError("");
                        }}
                      />
                      <input
                        ref={stickerInput}
                        type="file"
                        accept="image/png,image/webp,image/gif"
                        hidden
                        onChange={(e) => {
                          void choose(e.target.files?.[0] || null, true);
                          e.target.value = "";
                        }}
                      />
                      <div className="chat-compose-bar">
                        {recording ? (
                          <>
                            <span className="chat-record-indicator" />
                            <span className="flex-1 text-xs">
                              Gravando · {Math.floor(seconds / 60)}:
                              {String(seconds % 60).padStart(2, "0")}
                            </span>
                            <button
                              type="button"
                              className="shell-icon"
                              aria-label="Descartar gravação"
                              onClick={() => stopRecord(true)}
                            >
                              <Trash2 size={19} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="shell-icon"
                              aria-label="Enviar imagem da galeria"
                              disabled={busy}
                              onClick={() => input.current?.click()}
                            >
                              <ImageIcon size={21} />
                            </button>
                            <label className="sr-only" htmlFor="chat-message">
                              Mensagem
                            </label>
                            <textarea
                              id="chat-message"
                              rows={1}
                              maxLength={4000}
                              placeholder="Mensagem…"
                              value={body}
                              onChange={(e) => setBody(e.target.value)}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  !e.shiftKey &&
                                  window.matchMedia("(pointer:fine)").matches
                                ) {
                                  e.preventDefault();
                                  void send();
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="shell-icon"
                              aria-label="Enviar figurinha estática ou animada"
                              title="Figurinhas PNG, WEBP ou GIF"
                              disabled={busy}
                              onClick={() => stickerInput.current?.click()}
                            >
                              <Sticker size={21} />
                            </button>
                          </>
                        )}
                        {(body.trim() || file) && !recording ? (
                          <button
                            className="chat-send"
                            aria-label="Enviar mensagem"
                            disabled={busy}
                          >
                            <Send size={19} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={
                              "shell-icon chat-mic " +
                              (recording ? "is-recording" : "")
                            }
                            disabled={busy}
                            aria-label={
                              recording
                                ? "Parar e enviar áudio"
                                : "Gravar áudio: segure no celular; clique para começar no computador"
                            }
                            aria-pressed={recording}
                            title="Segure para gravar. No computador, clique para iniciar e finalizar."
                            onPointerDown={(e) => {
                              pointer.current = e.pointerType;
                              if (e.pointerType !== "mouse") {
                                e.preventDefault();
                                e.currentTarget.setPointerCapture(e.pointerId);
                                void startRecord(true);
                              }
                            }}
                            onPointerUp={(e) => {
                              if (e.pointerType !== "mouse") stopRecord();
                            }}
                            onPointerCancel={() => stopRecord(true)}
                            onClick={(e) => {
                              if (
                                e.detail === 0 ||
                                pointer.current === "mouse"
                              ) {
                                if (recording) stopRecord();
                                else void startRecord(false);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") stopRecord(true);
                            }}
                          >
                            {recording ? (
                              <Square size={18} />
                            ) : (
                              <Mic size={21} />
                            )}
                          </button>
                        )}
                      </div>
                      {recording && (
                        <p className="chat-record-hint">
                          Solte para enviar no celular. No computador, clique
                          para finalizar. Até 2 minutos.
                        </p>
                      )}
                    </form>
                  )}
                </>
              )}
            </>
          ) : selected ? (
            <div className="chat-empty">
              <p className="nook-muted">Carregando conversa…</p>
            </div>
          ) : (
            <div className="chat-empty">
              <span className="chat-empty-icon">
                <MessageCircle size={34} />
              </span>
              <h2>Conversas que aproximam</h2>
              <p>
                Escolha uma conversa para começar
                <br />
                ou reúna suas pessoas em um grupo.
              </p>
              <button
                type="button"
                className="nook-primary mt-5"
                onClick={() => group.current?.showModal()}
              >
                <Users size={17} />
                Criar grupo
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="chat-feedback">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="chat-feedback">
              {notice}
            </p>
          )}
        </section>
      </div>
      <dialog ref={group} className="nook-dialog">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const f = new FormData(e.currentTarget);
              const usernames = String(f.get("people") || "")
                .split(/[\s,;]+/)
                .map((n) => n.replace(/^@/, "").toLowerCase())
                .filter(Boolean);
              const r = await fetch("/api/chat/groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: f.get("name"), usernames }),
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              group.current?.close();
              setTab("inbox");
              router.push("/chat?thread=" + d.thread_id);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Um grupo para vocês</h2>
            <button
              type="button"
              className="shell-icon"
              aria-label="Fechar"
              onClick={() => group.current?.close()}
            >
              <X size={20} />
            </button>
          </div>
          <p className="nook-muted">
            Até 15 pessoas, contando você. Cada pessoa recebe um convite e
            decide se quer entrar.
          </p>
          <label className="nook-field">
            Nome do grupo
            <input
              name="name"
              required
              maxLength={60}
              className="nook-input"
              placeholder="O nome desse cantinho"
            />
          </label>
          <label className="nook-field">
            Quem você quer convidar?
            <textarea
              name="people"
              required
              maxLength={450}
              className="nook-input"
              rows={3}
              placeholder="@username, @outrapessoa"
            />
          </label>
          <p className="nook-muted text-xs">
            Informe até 14 usernames separados por vírgula.
          </p>
          {error && (
            <p role="alert" className="nook-status">
              {error}
            </p>
          )}
          <button disabled={busy} className="nook-primary">
            <Users size={17} />
            {busy ? "Criando…" : "Criar e enviar convites"}
          </button>
        </form>
      </dialog>
      <dialog ref={report} className="nook-dialog">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!thread) return;
            setBusy(true);
            setError("");
            try {
              const f = new FormData(e.currentTarget);
              const r = await fetch("/api/chat/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  thread_id: thread.id,
                  message_id: reportedMessage,
                  reason: f.get("reason"),
                }),
              });
              if (!r.ok) throw Error("Não foi possível enviar a denúncia.");
              report.current?.close();
              setNotice(
                "Denúncia enviada. A equipe responsável vai analisar o seu relato.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Relatar uma situação</h2>
            <button
              type="button"
              className="shell-icon"
              aria-label="Fechar"
              onClick={() => report.current?.close()}
            >
              <X size={20} />
            </button>
          </div>
          <p className="nook-muted">
            {reportedMessage
              ? "Apenas a mensagem selecionada será compartilhada com a equipe."
              : "Seu relato será compartilhado com a equipe. Para incluir uma mensagem, use as opções dela na conversa."}
          </p>
          <label className="nook-field">
            O que aconteceu?
            <textarea
              required
              name="reason"
              minLength={3}
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
          <button className="nook-primary" disabled={busy}>
            Enviar denúncia
          </button>
        </form>
      </dialog>
    </main>
  );
}
