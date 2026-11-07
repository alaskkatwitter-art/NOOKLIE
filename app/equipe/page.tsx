import Link from 'next/link';
import { discoveryDb } from '@/lib/discovery/server';
import { getPublicProfileIds } from '@/lib/moderation/content-visibility';
import AccountBadge from '@/components/AccountBadge';

export const metadata = { title: 'Equipe do Nooklie' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const [members, departments, roles, admins] = await Promise.all([
    discoveryDb.from('team_memberships').select('user_id,department_id,role_id').eq('status', 'active'),
    discoveryDb.from('departments').select('id,name').eq('status', 'active').order('sort_order'),
    discoveryDb.from('team_roles').select('id,name').eq('status', 'active'),
    discoveryDb.from('platform_admins').select('user_id'),
  ]);
  if (members.error || departments.error || roles.error || admins.error) {
    console.error('public team', members.error || departments.error || roles.error || admins.error);
    return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-bold">Equipe do Nooklie</h1><p role="alert">Não foi possível carregar a equipe agora.</p></main>;
  }

  const ids = [...new Set([...members.data, ...admins.data].map(member => member.user_id))];
  const [profiles, visible] = await Promise.all([
    ids.length ? discoveryDb.from('profiles').select('user_id,username,display_name,avatar_url,verified,is_official').in('user_id', ids) : Promise.resolve({ data: [], error: null }),
    getPublicProfileIds(discoveryDb, ids, null),
  ]);
  if (profiles.error) throw profiles.error;
  const profileById = new Map(profiles.data.filter(profile => visible.has(profile.user_id)).map(profile => [profile.user_id, profile]));
  const roleById = new Map(roles.data.map(role => [role.id, role.name]));
  const groups = [
    { id: 'admins', name: 'Administração', members: admins.data.map(member => ({ userId: member.user_id, role: 'Administração' })) },
    ...departments.data.map(department => ({
      ...department,
      members: members.data.filter(member => member.department_id === department.id && roleById.has(member.role_id))
        .map(member => ({ userId: member.user_id, role: roleById.get(member.role_id)! })),
    })),
  ].map(group => ({ ...group, members: group.members.filter(member => profileById.has(member.userId)) }))
    .filter(group => group.members.length > 0);

  return <main className="mx-auto min-h-screen max-w-5xl space-y-8 p-5 text-white sm:p-8">
    <header className="rounded-3xl border border-pink-300/20 bg-gradient-to-br from-pink-300/15 to-purple-400/5 p-6">
      <Link href="/sobre" className="text-sm text-pink-200">Sobre o Nooklie</Link>
      <h1 className="mt-2 text-3xl font-black">Equipe do Nooklie</h1>
      <p className="mt-2 text-white/75">Conheça quem cuida da plataforma e da comunidade.</p>
    </header>
    {groups.length === 0 && <p>A equipe ainda não tem perfis públicos disponíveis.</p>}
    {groups.map(group => <section key={group.id} className="space-y-3">
      <h2 className="text-xl font-bold">{group.name}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {group.members.map(member => {
          const profile = profileById.get(member.userId)!;
          return <li key={member.userId + member.role}>
            <Link href={'/perfil/' + encodeURIComponent(profile.username)} className="flex items-center gap-3 rounded-2xl border border-white/15 p-4 hover:border-pink-300/50">
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" /> :
                <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-pink-300/15">{profile.username.charAt(0).toUpperCase()}</span>}
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-bold">{profile.display_name || profile.username}<AccountBadge account={profile} /></span>
                <span className="block break-words text-sm text-white/65">@{profile.username} · {member.role}</span>
              </span>
            </Link>
          </li>;
        })}
      </ul>
    </section>)}
  </main>;
}
