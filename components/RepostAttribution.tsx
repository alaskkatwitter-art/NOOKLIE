import Link from 'next/link';
import AccountBadge from './AccountBadge';
import { contentMediaUrl } from '@/lib/security/content-media';
export type RepostAuthor = {
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
  verified?: boolean;
  is_official?: boolean;
};
export default function RepostAttribution({
  author,
  comment,
}: {
  author: RepostAuthor;
  comment: string | null;
}) {
  return (
    <div className="flex gap-3 py-3">
      <Link
        href={'/perfil/' + encodeURIComponent(author.username)}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-300/15 text-pink-200"
      >
        {author.avatar_url ? (
          <img
            src={contentMediaUrl(author.avatar_url)}
            alt={'Foto de @' + author.username}
            className="h-full w-full object-cover"
          />
        ) : (
          author.username[0]?.toUpperCase()
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={'/perfil/' + encodeURIComponent(author.username)}
          className="font-bold text-white"
        >
          {author.display_name || author.username}
          <AccountBadge account={author} />
          <span className="ml-2 text-xs font-normal text-white/45">
            @{author.username}
          </span>
        </Link>
        <p className="text-xs text-pink-200">
          Nooklou {comment ? 'com comentário' : 'esta publicação'}
        </p>
        {comment && (
          <p className="mt-2 whitespace-pre-wrap break-words leading-7">
            {comment}
          </p>
        )}
      </div>
    </div>
  );
}
