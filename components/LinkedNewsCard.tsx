import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import { isNewsArticle, newsArticles } from '@/lib/news/articles';
export default function LinkedNewsCard({ slug }: { slug?: string | null }) {
  if (!isNewsArticle(slug)) return null;
  const article = newsArticles[slug];
  return (
    <Link
      href={'/noticias/' + slug}
      className="my-4 flex gap-4 rounded-2xl border border-pink-300/20 bg-gradient-to-br from-pink-400/10 to-transparent p-4 hover:border-pink-300/50"
    >
      <Newspaper className="mt-1 shrink-0 text-pink-300" size={28} />
      <span>
        <span className="text-xs font-bold uppercase tracking-wider text-pink-300">
          Jornal Nooklie
        </span>
        <strong className="mt-1 block text-base text-white">
          {article.title}
        </strong>
        <span className="mt-2 block text-sm leading-6 text-white/60">
          {article.description}
        </span>
      </span>
    </Link>
  );
}
