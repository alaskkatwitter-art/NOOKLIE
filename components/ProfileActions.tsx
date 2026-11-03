"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { MoreHorizontal, Flag, ShieldBan, VolumeX } from "lucide-react";
export default function ProfileActions({
  profileId,
  username,
}: {
  profileId: string;
  username: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(e: MouseEvent) {
      if (!menu.current?.contains(e.target as Node))
        menu.current?.removeAttribute("open");
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") menu.current?.removeAttribute("open");
    }
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={menu} className="profile-more">
      <summary
        className="shell-icon"
        aria-label={"Mais opções para @" + username}
      >
        <MoreHorizontal size={22} />
      </summary>
      <div className="profile-more-popover">
        {(
          [
            ["report", "Denunciar perfil", Flag],
            ["block", "Bloquear perfil", ShieldBan],
            ["mute", "Silenciar perfil", VolumeX],
          ] as const
        ).map(([action, label, Icon]) => (
          <Link
            key={action as string}
            href={
              "/perfil/" +
              encodeURIComponent(username) +
              "/acoes?acao=" +
              action +
              "&id=" +
              profileId
            }
          >
            <Icon size={17} />
            {label as string}
          </Link>
        ))}
      </div>
    </details>
  );
}
