"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
function clock(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return (
    Math.floor(value / 60) +
    ":" +
    String(Math.floor(value % 60)).padStart(2, "0")
  );
}
export default function ChatAudio({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setError("");
  }, [src]);
  return (
    <div className="chat-audio">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError("Não foi possível reproduzir o áudio.")}
      />
      <button
        type="button"
        aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
        onClick={async () => {
          if (!audio.current) return;
          try {
            if (playing) audio.current.pause();
            else await audio.current.play();
          } catch {
            setError("Toque novamente para reproduzir.");
          }
        }}
      >
        {playing ? <Pause size={19} /> : <Play size={19} />}
      </button>
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor={"seek-" + src}>
          Posição do áudio
        </label>
        <input
          id={"seek-" + src}
          type="range"
          min="0"
          max={
            Number.isFinite(duration) && duration > 0
              ? duration
              : Math.max(time, 1)
          }
          step="0.1"
          value={time}
          disabled={!Number.isFinite(duration) || duration <= 0}
          onChange={(e) => {
            if (audio.current)
              audio.current.currentTime = Number(e.target.value);
          }}
        />
        <div className="flex justify-between text-[10px] opacity-65">
          <span>{clock(time)}</span>
          <span>{clock(duration)}</span>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
