'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type Category = { id: string; name: string; slug: string };
type CatalogTag = {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  category: Category | null;
};
type CurrentUser = { id: string; username: string } | null;

type Props = { currentUser: CurrentUser };

const ratings = [
  { value: 'Livre', label: 'Livre' },
  { value: '10', label: '10 anos' },
  { value: '12', label: '12 anos' },
  { value: '14', label: '14 anos' },
  { value: '16', label: '16 anos' },
  { value: '18', label: '18 anos' },
];

function filterClass() {
  return 'rounded-xl border border-white/10 bg-[#100b12] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#ff78b9]/50';
}

export default function TagFilters({ currentUser }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const included = params.getAll('includeTag');
  const excluded = params.getAll('excludeTag');

  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<CatalogTag[]>([]);
  const [remoteSuggestions, setRemoteSuggestions] = useState<CatalogTag[] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [tagName, setTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState('freeform');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [creatingTag, setCreatingTag] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const response = await fetch('/api/tags', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar as tags.');
        if (!cancelled) {
          setCategories(Array.isArray(data.categories) ? data.categories : []);
          setCatalog(Array.isArray(data.tags) ? data.tags : []);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as tags.');
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    }
    void loadCatalog();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!tagSearch.trim() && !categoryFilter) {
      setRemoteSuggestions(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const query = new URLSearchParams();
      if (tagSearch.trim()) query.set('q', tagSearch.trim());
      if (categoryFilter) query.set('category', categoryFilter);
      try {
        const response = await fetch(`/api/tags?${query.toString()}`, { cache: 'no-store' });
        const data = await response.json();
        if (response.ok && !cancelled) {
          setRemoteSuggestions(Array.isArray(data.tags) ? data.tags : []);
        }
      } catch {
        if (!cancelled) setRemoteSuggestions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tagSearch, categoryFilter]);

  useEffect(() => {
    if (categories.length && !categories.some((category) => category.slug === newTagCategory)) {
      setNewTagCategory(categories.find((category) => category.slug === 'freeform')?.slug || categories[0].slug);
    }
  }, [categories, newTagCategory]);

  function navigate(next: URLSearchParams) {
    next.delete('page');
    const serialized = next.toString();
    router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
  }

  function setSingleFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    navigate(next);
  }

  function setTagFilter(slug: string, mode: 'includeTag' | 'excludeTag') {
    const next = new URLSearchParams(params);
    const opposite = mode === 'includeTag' ? 'excludeTag' : 'includeTag';
    const active = next.getAll(mode);
    const other = next.getAll(opposite);
    const exists = active.includes(slug);

    if (exists) {
      next.delete(mode);
      active.filter((item) => item !== slug).forEach((item) => next.append(mode, item));
    } else {
      if (active.length >= 12) {
        setError('Você pode incluir até 12 tags e excluir até 12 tags.');
        return;
      }
      next.delete(opposite);
      other.filter((item) => item !== slug).forEach((item) => next.append(opposite, item));
      next.append(mode, slug);
    }
    setError('');
    navigate(next);
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!currentUser) {
      router.push('/login');
      return;
    }

    const cleanName = tagName.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 50) {
      setError('A tag precisa ter entre 2 e 50 caracteres.');
      return;
    }

    setCreatingTag(true);
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, category: newTagCategory }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível publicar a tag.');

      const tag = data.tag as CatalogTag;
      setCatalog((current) => [tag, ...current.filter((item) => item.slug !== tag.slug)]);
      setTagName('');
      setTagSearch('');
      setCategoryFilter('');
      setMessage(data.created ? 'Tag publicada e já disponível no catálogo.' : 'Essa tag já estava no catálogo.');
      if (!included.includes(tag.slug)) setTagFilter(tag.slug, 'includeTag');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível publicar a tag.');
    } finally {
      setCreatingTag(false);
    }
  }

  const suggestions = remoteSuggestions ?? catalog
    .filter((tag) => {
      const matchesCategory = !categoryFilter || tag.category?.slug === categoryFilter;
      const matchesSearch = !tagSearch.trim() || tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .slice(0, 12);

  const tagsBySlug = new Map(catalog.map((tag) => [tag.slug, tag]));
  const activeTags = [
    ...included.map((slug) => ({ slug, mode: 'includeTag' as const })),
    ...excluded.map((slug) => ({ slug, mode: 'excludeTag' as const })),
  ];

  return (
    <section className="relative mb-10 rounded-3xl border border-white/10 bg-[#191219]/90 p-5 shadow-xl md:p-7">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff78b9]">Busca avançada</p>
          <h2 className="mt-2 text-2xl font-black">Encontre do seu jeito</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
            Todas as tags incluídas precisam combinar. Histórias com qualquer tag excluída ficam de fora.
          </p>
        </div>
        <button type="button" onClick={() => navigate(new URLSearchParams(params.get('q') ? `q=${encodeURIComponent(params.get('q') || '')}` : ''))} className="self-start rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/55 transition hover:border-[#ff78b9]/40 hover:text-white md:self-auto">
          Limpar filtros
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-xs text-white/45">
          Categoria da tag
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={filterClass()}>
            <option value="">Todas as categorias</option>
            {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-white/45">
          Classificação
          <select value={params.get('rating') || ''} onChange={(event) => setSingleFilter('rating', event.target.value)} className={filterClass()}>
            <option value="">Todas as classificações</option>
            {ratings.map((rating) => <option key={rating.value} value={rating.value}>{rating.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-white/45">
          Status da história
          <select value={params.get('status') || ''} onChange={(event) => setSingleFilter('status', event.target.value)} className={filterClass()}>
            <option value="">Qualquer status</option>
            <option value="Em andamento">Em andamento</option>
            <option value="Concluída">Concluída</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-white/45">
          Ordenar por
          <select value={params.get('sort') || 'updated'} onChange={(event) => setSingleFilter('sort', event.target.value === 'updated' ? '' : event.target.value)} className={filterClass()}>
            <option value="updated">Atualizadas recentemente</option>
            <option value="newest">Publicadas recentemente</option>
            <option value="title_asc">Título: A–Z</option>
            <option value="title_desc">Título: Z–A</option>
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div>
          <label className="grid gap-1.5 text-xs text-white/45">
            Procurar uma tag
            <input value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} maxLength={100} placeholder="Ex.: slow burn, fantasia, Harry Potter..." className={filterClass()} />
          </label>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
            {loadingCatalog ? (
              <p className="rounded-xl bg-white/[0.03] p-4 text-sm text-white/40">Carregando o catálogo...</p>
            ) : suggestions.length === 0 ? (
              <p className="rounded-xl bg-white/[0.03] p-4 text-sm text-white/40">Nenhuma tag encontrada. Você pode adicionar uma ao catálogo.</p>
            ) : suggestions.map((tag) => (
              <div key={tag.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/85">{tag.name}</p>
                  <p className="text-[11px] text-white/35">{tag.category?.name || 'Sem categoria'}</p>
                </div>
                <button type="button" onClick={() => setTagFilter(tag.slug, 'includeTag')} aria-pressed={included.includes(tag.slug)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${included.includes(tag.slug) ? 'bg-[#ff78b9] text-[#180d15]' : 'border border-white/10 text-white/55 hover:border-[#ff78b9]/50'}`}>
                  {included.includes(tag.slug) ? 'Incluída' : 'Incluir'}
                </button>
                <button type="button" onClick={() => setTagFilter(tag.slug, 'excludeTag')} aria-pressed={excluded.includes(tag.slug)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${excluded.includes(tag.slug) ? 'bg-red-400/20 text-red-200' : 'border border-white/10 text-white/45 hover:border-red-300/40'}`}>
                  {excluded.includes(tag.slug) ? 'Excluída' : 'Excluir'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-[#100b12]/70 p-4">
          <h3 className="text-sm font-bold">Adicionar uma tag ao catálogo</h3>
          <p className="mt-1 text-xs leading-5 text-white/40">Tags novas ficam disponíveis imediatamente para toda a comunidade.</p>
          <form onSubmit={createTag} className="mt-3 space-y-2.5">
            <label className="sr-only" htmlFor="new-tag-name">Nome da nova tag</label>
            <input id="new-tag-name" value={tagName} onChange={(event) => setTagName(event.target.value)} maxLength={50} minLength={2} required placeholder="Nome da tag" className={`${filterClass()} w-full`} />
            <label className="grid gap-1.5 text-xs text-white/45">
              Categoria
              <select value={newTagCategory} onChange={(event) => setNewTagCategory(event.target.value)} className={`${filterClass()} w-full`} required>
                {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={creatingTag || categories.length === 0} className="w-full rounded-xl bg-gradient-to-r from-[#ff68ae] to-[#ff91c4] px-4 py-2.5 text-sm font-bold text-[#180d15] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {creatingTag ? 'Publicando...' : currentUser ? 'Publicar tag' : 'Entre para publicar uma tag'}
            </button>
          </form>
          {message && <p role="status" className="mt-3 text-xs text-emerald-300">{message}</p>}
          {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
          {!currentUser && <Link href="/login" className="mt-2 inline-block text-xs text-[#ff9bca] underline">Entrar ou criar conta</Link>}
        </div>
      </div>

      {activeTags.length > 0 && (
        <div className="mt-5 border-t border-white/5 pt-4">
          <p className="mb-2 text-xs font-semibold text-white/45">Filtros ativos</p>
          <div className="flex flex-wrap gap-2">
            {activeTags.map(({ slug, mode }) => (
              <button key={`${mode}:${slug}`} type="button" onClick={() => setTagFilter(slug, mode)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${mode === 'includeTag' ? 'border-[#ff78b9]/25 bg-[#ff78b9]/10 text-[#ff9bca]' : 'border-red-300/20 bg-red-300/5 text-red-200'}`}>
                {mode === 'includeTag' ? 'Incluir' : 'Excluir'}: {tagsBySlug.get(slug)?.name || slug} ×
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
