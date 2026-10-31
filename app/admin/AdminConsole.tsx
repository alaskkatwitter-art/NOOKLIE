'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

type Department = {
  id: string; name: string; slug: string; description: string;
  sort_order: number; status: 'active' | 'archived';
};
type Permission = { code: string; name: string; description: string };
type Role = {
  id: string; department_id: string; name: string; description: string;
  badge_title: string | null; badge_description: string | null;
  status: 'active' | 'archived'; permission_codes: string[];
};
type Member = {
  id: string; user_id: string; department_id: string; role_id: string;
  status: 'active' | 'removed'; assigned_at: string; removed_at: string | null;
  removal_reason: string | null;
  profile: { username: string; display_name: string | null; avatar_url: string | null } | null;
  role: { name: string; badge_title: string | null } | null;
  department: { name: string } | null;
};
type Candidate = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
type AuditEntry = {
  id: string; action: string; subject_type: string; subject_id: string | null;
  details: Record<string, unknown>; created_at: string;
  actor: { username: string; display_name: string | null } | null;
};

const tabs = [
  ['overview', 'Visão geral'],
  ['departments', 'Departamentos'],
  ['roles', 'Cargos e permissões'],
  ['members', 'Equipe'],
  ['audit', 'Histórico'],
] as const;
type Tab = (typeof tabs)[number][0];

const inputClass = 'w-full rounded-xl border border-white/10 bg-[#100b12] px-3 py-3 text-sm text-white outline-none focus:border-[#ff78b9]/60';
const primaryButton = 'rounded-xl bg-[#ff78b9] px-4 py-3 text-sm font-bold text-[#1b1018] transition hover:brightness-110 disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-[#ff78b9]/40 disabled:opacity-50';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
  return data as T;
}

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminConsole({ isPlatformAdmin, canManageMembers, manageableDepartmentIds }: { isPlatformAdmin: boolean; canManageMembers: boolean; manageableDepartmentIds: string[] }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<{ users: number | null; departments: number; roles: number; members: number } | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [memberStatus, setMemberStatus] = useState<'active' | 'removed'>('active');
  const [search, setSearch] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentSlug, setDepartmentSlug] = useState('');
  const [departmentDescription, setDepartmentDescription] = useState('');
  const [departmentOrder, setDepartmentOrder] = useState('0');
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleDepartment, setRoleDepartment] = useState('');
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [badgeTitle, setBadgeTitle] = useState('');
  const [badgeDescription, setBadgeDescription] = useState('');
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadDepartments = useCallback(async () => {
    const data = await request<{ departments: Department[] }>('/api/admin/manage?resource=departments');
    setDepartments(data.departments);
  }, []);
  const loadRoles = useCallback(async () => {
    const data = await request<{ roles: Role[]; permissions: Permission[] }>('/api/admin/manage?resource=roles');
    setRoles(data.roles);
    setPermissions(data.permissions);
    if (!roleDepartment && data.roles[0]) setRoleDepartment(data.roles[0].department_id);
  }, [roleDepartment]);
  const loadMembers = useCallback(async () => {
    const data = await request<{ members: Member[] }>('/api/admin/manage?resource=members&status=' + memberStatus);
    setMembers(data.members);
  }, [memberStatus]);
  const loadAudit = useCallback(async () => {
    const data = await request<{ entries: AuditEntry[] }>('/api/admin/manage?resource=audit');
    setAudit(data.entries);
  }, []);
  const loadOverview = useCallback(async () => {
    const data = await request<{ stats: { users: number | null; departments: number; roles: number; members: number } }>('/api/admin/overview');
    setStats(data.stats);
  }, []);

  useEffect(() => {
    let active = true;
    setError('');
    const work = tab === 'overview' ? loadOverview()
      : tab === 'departments' ? loadDepartments()
      : tab === 'roles' ? Promise.all([loadDepartments(), loadRoles()]).then(() => undefined)
      : tab === 'members' ? Promise.all([loadDepartments(), loadRoles(), loadMembers()]).then(() => undefined)
      : loadAudit();
    work.catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, memberStatus, loadOverview, loadDepartments, loadRoles, loadMembers, loadAudit]);


  function resetDepartmentForm() {
    setEditingDepartment(null);
    setDepartmentName('');
    setDepartmentSlug('');
    setDepartmentDescription('');
    setDepartmentOrder('0');
  }

  function editDepartment(department: Department) {
    setEditingDepartment(department);
    setDepartmentName(department.name);
    setDepartmentSlug(department.slug);
    setDepartmentDescription(department.description);
    setDepartmentOrder(String(department.sort_order));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const body = {
        resource: 'department',
        id: editingDepartment?.id,
        name: departmentName,
        slug: departmentSlug,
        description: departmentDescription,
        sort_order: Number(departmentOrder) || 0,
        status: editingDepartment?.status || 'active',
      };
      await request('/api/admin/manage', { method: editingDepartment ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setMessage(editingDepartment ? 'Departamento atualizado.' : 'Departamento criado.');
      resetDepartmentForm();
      await loadDepartments();
      await loadOverview();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar departamento.'); }
    finally { setBusy(false); }
  }

  async function toggleDepartment(department: Department) {
    if (!window.confirm((department.status === 'active' ? 'Arquivar' : 'Reativar') + ' o departamento ' + department.name + '?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/api/admin/manage', { method: 'PATCH', body: JSON.stringify({
        resource: 'department', id: department.id, name: department.name, slug: department.slug,
        description: department.description, sort_order: department.sort_order,
        status: department.status === 'active' ? 'archived' : 'active',
      }) });
      setMessage('Status do departamento atualizado.');
      await loadDepartments(); await loadOverview();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar.'); }
    finally { setBusy(false); }
  }

  function editRole(role: Role) {
    setEditingRole(role);
    setRoleDepartment(role.department_id);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setBadgeTitle(role.badge_title || '');
    setBadgeDescription(role.badge_description || '');
    setPermissionCodes(role.permission_codes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetRoleForm() {
    setEditingRole(null); setRoleName(''); setRoleDescription('');
    setBadgeTitle(''); setBadgeDescription(''); setPermissionCodes([]);
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const body = {
        resource: 'role', id: editingRole?.id, department_id: roleDepartment, name: roleName,
        description: roleDescription, badge_title: badgeTitle, badge_description: badgeDescription,
        status: editingRole?.status || 'active', permission_codes: permissionCodes,
      };
      await request('/api/admin/manage', { method: editingRole ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setMessage(editingRole ? 'Cargo atualizado.' : 'Cargo criado.');
      resetRoleForm(); await loadRoles(); await loadOverview();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar cargo.'); }
    finally { setBusy(false); }
  }

  async function toggleRole(role: Role) {
    if (!window.confirm((role.status === 'active' ? 'Arquivar' : 'Reativar') + ' o cargo ' + role.name + '?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/api/admin/manage', { method: 'PATCH', body: JSON.stringify({
        resource: 'role', id: role.id, name: role.name, description: role.description,
        badge_title: role.badge_title || '', badge_description: role.badge_description || '',
        status: role.status === 'active' ? 'archived' : 'active', permission_codes: role.permission_codes,
      }) });
      setMessage('Status do cargo atualizado.'); await loadRoles(); await loadOverview();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar cargo.'); }
    finally { setBusy(false); }
  }

  async function searchCandidates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await request<{ candidates: Candidate[] }>('/api/admin/manage?resource=candidates&q=' + encodeURIComponent(search));
      setCandidates(data.candidates);
      setSelectedCandidate(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha na busca.'); }
    finally { setBusy(false); }
  }

  async function appointMember() {
    if (!selectedCandidate || !selectedRoleId) return;
    if (!window.confirm('Nomear ' + (selectedCandidate.display_name || selectedCandidate.username) + ' para este cargo e enviar a notificação?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/api/admin/manage', { method: 'POST', body: JSON.stringify({
        resource: 'member', user_id: selectedCandidate.user_id, role_id: selectedRoleId,
      }) });
      setMessage('Nomeação realizada e notificação enviada.');
      setSelectedCandidate(null); setCandidates([]); setSearch('');
      await loadMembers(); await loadOverview();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao nomear integrante.'); }
    finally { setBusy(false); }
  }

  async function removeMember(member: Member) {
    const label = member.profile?.display_name || member.profile?.username || 'este integrante';
    if (!window.confirm('Remover ' + label + ' do cargo ' + (member.role?.name || '') + '? O histórico será mantido.')) return;
    const reason = window.prompt('Motivo da remoção (opcional):') || '';
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/api/admin/manage', { method: 'DELETE', body: JSON.stringify({
        resource: 'member', id: member.id, reason, confirm: true,
      }) });
      setMessage('Integrante removido. O histórico foi preservado.');
      await loadMembers(); await loadOverview();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao remover integrante.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#100b12] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/perfil" className="text-xs font-semibold text-[#ff9aca] hover:text-white">← Voltar ao perfil</Link>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-[#ff78b9]/70">NOOKLIE • ADMINISTRAÇÃO</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Painel da equipe</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
              Gerencie departamentos, cargos e integrantes com segurança. Ações importantes pedem confirmação e ficam registradas.
            </p>
          </div>
          {isPlatformAdmin && <span className="rounded-full border border-[#ff78b9]/30 bg-[#ff78b9]/10 px-3 py-2 text-xs font-bold text-[#ff9aca]">Administração principal</span>}
        </div>

        <nav aria-label="Seções administrativas" className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" onClick={() => { if (tab !== key) { setLoading(true); setTab(key); } setError(''); setMessage(''); }}
              className={tab === key ? 'shrink-0 rounded-full bg-[#ff78b9] px-4 py-2.5 text-xs font-bold text-[#1b1018]' : 'shrink-0 rounded-full border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/60 hover:text-white'}>
              {label}
            </button>
          ))}
        </nav>

        {error && <div role="alert" className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-2xl border border-green-400/20 bg-green-400/5 p-4 text-sm text-green-200">{message}</div>}
        {loading && <p className="mb-4 text-sm text-white/40">Carregando…</p>}

        {tab === 'overview' && (
          <section>
            <h2 className="mb-4 text-xl font-bold">Visão geral</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Usuários', stats?.users === null || stats?.users === undefined ? 'Restrito' : String(stats.users)],
                ['Departamentos ativos', String(stats?.departments ?? '—')],
                ['Cargos ativos', String(stats?.roles ?? '—')],
                ['Integrantes ativos', String(stats?.members ?? '—')],
              ].map(([label, value]) => (
                <article key={label} className="rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
                  <p className="text-xs text-white/45">{label}</p><p className="mt-2 text-2xl font-black text-[#ff9aca]">{value}</p>
                </article>
              ))}
            </div>
            <p className="mt-5 rounded-2xl border border-white/10 bg-[#191219] p-4 text-sm leading-6 text-white/50">
              Selecione uma seção para administrar. Os dados aparecem conforme o seu cargo e departamento.
            </p>
          </section>
        )}

        {tab === 'departments' && (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
              <h2 className="text-xl font-bold">Departamentos</h2>
              <p className="mb-4 mt-1 text-sm text-white/45">Crie novos grupos ou reative departamentos arquivados.</p>
              <div className="space-y-3">
                {departments.map((department) => (
                  <article key={department.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#100b12] p-4">
                    <div className="min-w-0">
                      <p className="font-bold">{department.name} <span className="ml-1 text-[10px] uppercase text-white/35">{department.status === 'active' ? 'Ativo' : 'Arquivado'}</span></p>
                      <p className="mt-1 break-all text-xs text-white/35">/{department.slug} · {department.description || 'Sem descrição'}</p>
                    </div>
                    {isPlatformAdmin && <div className="flex gap-2">
                      <button type="button" className={secondaryButton} onClick={() => editDepartment(department)}>Editar</button>
                      <button type="button" disabled={busy} className={secondaryButton} onClick={() => toggleDepartment(department)}>{department.status === 'active' ? 'Arquivar' : 'Reativar'}</button>
                    </div>}
                  </article>
                ))}
                {!departments.length && <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/40">Nenhum departamento disponível para seu acesso.</p>}
              </div>
            </div>
            {isPlatformAdmin && <form onSubmit={saveDepartment} className="h-fit space-y-3 rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
              <h2 className="text-xl font-bold">{editingDepartment ? 'Editar departamento' : 'Novo departamento'}</h2>
              <label className="block text-xs text-white/55">Nome<input className={inputClass + ' mt-1'} required maxLength={80} value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} /></label>
              <label className="block text-xs text-white/55">Identificador da URL<input className={inputClass + ' mt-1'} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={departmentSlug} onChange={(event) => setDepartmentSlug(event.target.value)} placeholder="equipe-editorial" /></label>
              <label className="block text-xs text-white/55">Descrição<textarea className={inputClass + ' mt-1'} rows={3} maxLength={1000} value={departmentDescription} onChange={(event) => setDepartmentDescription(event.target.value)} /></label>
              <label className="block text-xs text-white/55">Ordem de exibição<input className={inputClass + ' mt-1'} type="number" value={departmentOrder} onChange={(event) => setDepartmentOrder(event.target.value)} /></label>
              <div className="flex gap-2"><button disabled={busy} className={primaryButton}>{busy ? 'Salvando…' : editingDepartment ? 'Salvar mudanças' : 'Criar departamento'}</button>{editingDepartment && <button type="button" onClick={resetDepartmentForm} className={secondaryButton}>Cancelar</button>}</div>
            </form>}
          </section>
        )}

        {tab === 'roles' && (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
            <div className="rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
              <h2 className="text-xl font-bold">Cargos</h2><p className="mb-4 mt-1 text-sm text-white/45">Os selos e permissões acompanham o cargo cadastrado.</p>
              <div className="space-y-3">
                {roles.map((role) => <article key={role.id} className="rounded-xl border border-white/5 bg-[#100b12] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-bold">{role.name} <span className="ml-1 text-[10px] uppercase text-white/35">{role.status === 'active' ? 'Ativo' : 'Arquivado'}</span></p>
                      <p className="mt-1 text-xs text-[#ff9aca]">{departments.find((department) => department.id === role.department_id)?.name || 'Departamento'}</p>
                      <p className="mt-2 text-xs text-white/40">{role.description || 'Sem descrição'}</p>
                      {role.badge_title && <p className="mt-2 text-xs text-white/55">Selo: {role.badge_title}{role.badge_description ? ' · ' + role.badge_description : ''}</p>}
                      <p className="mt-2 text-[10px] text-white/30">{role.permission_codes.length} permissões</p>
                    </div>
                    {isPlatformAdmin && <div className="flex gap-2">
                      <button type="button" className={secondaryButton} onClick={() => editRole(role)}>Editar</button>
                      <button type="button" disabled={busy} className={secondaryButton} onClick={() => toggleRole(role)}>{role.status === 'active' ? 'Arquivar' : 'Reativar'}</button>
                    </div>}
                  </div>
                </article>)}
                {!roles.length && <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/40">Nenhum cargo disponível para seu acesso.</p>}
              </div>
            </div>
            {isPlatformAdmin && <form onSubmit={saveRole} className="h-fit space-y-3 rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
              <h2 className="text-xl font-bold">{editingRole ? 'Editar cargo' : 'Novo cargo'}</h2>
              <label className="block text-xs text-white/55">Departamento<select className={inputClass + ' mt-1'} required value={roleDepartment} onChange={(event) => setRoleDepartment(event.target.value)}><option value="">Selecione</option>{departments.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="block text-xs text-white/55">Nome do cargo<input className={inputClass + ' mt-1'} required maxLength={80} value={roleName} onChange={(event) => setRoleName(event.target.value)} /></label>
              <label className="block text-xs text-white/55">Descrição<textarea className={inputClass + ' mt-1'} rows={2} maxLength={1000} value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} /></label>
              <label className="block text-xs text-white/55">Texto do selo<input className={inputClass + ' mt-1'} maxLength={80} value={badgeTitle} onChange={(event) => setBadgeTitle(event.target.value)} placeholder="Moderador do Nooklie" /></label>
              <label className="block text-xs text-white/55">Descrição do selo<input className={inputClass + ' mt-1'} maxLength={120} value={badgeDescription} onChange={(event) => setBadgeDescription(event.target.value)} /></label>
              <fieldset className="rounded-xl border border-white/10 p-3">
                <legend className="px-1 text-xs font-bold text-white/70">Permissões deste cargo</legend>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {permissions.map((permission) => <label key={permission.code} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/[0.03]">
                    <input type="checkbox" checked={permissionCodes.includes(permission.code)} onChange={(event) => setPermissionCodes((current) => event.target.checked ? [...current, permission.code] : current.filter((code) => code !== permission.code))} />
                    <span><span className="block text-xs font-semibold">{permission.name}</span><span className="block text-[10px] text-white/35">{permission.description}</span></span>
                  </label>)}
                  {!permissions.length && <p className="text-xs text-white/35">Nenhuma permissão de departamento disponível.</p>}
                </div>
              </fieldset>
              <div className="flex gap-2"><button disabled={busy || !roleDepartment} className={primaryButton}>{busy ? 'Salvando…' : editingRole ? 'Salvar mudanças' : 'Criar cargo'}</button>{editingRole && <button type="button" onClick={resetRoleForm} className={secondaryButton}>Cancelar</button>}</div>
            </form>}
          </section>
        )}

        {tab === 'members' && (
          <section className="space-y-5">
            {canManageMembers && <form onSubmit={searchCandidates} className="rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
              <h2 className="text-xl font-bold">Nomear integrante</h2><p className="mb-4 mt-1 text-sm text-white/45">Busque pelo nome de usuário. A nomeação envia uma notificação e fica no histórico.</p>
              <div className="flex flex-col gap-2 sm:flex-row"><input className={inputClass} minLength={2} maxLength={40} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário" /><button className={secondaryButton} disabled={busy || search.trim().length < 2}>Buscar</button></div>
              {candidates.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{candidates.map((candidate) => <button key={candidate.user_id} type="button" onClick={() => setSelectedCandidate(candidate)} className={selectedCandidate?.user_id === candidate.user_id ? 'flex items-center gap-3 rounded-xl border border-[#ff78b9]/60 bg-[#ff78b9]/10 p-3 text-left' : 'flex items-center gap-3 rounded-xl border border-white/10 p-3 text-left'}>
                {candidate.avatar_url ? <img src={candidate.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">✦</span>}
                <span><span className="block text-sm font-bold">{candidate.display_name || candidate.username}</span><span className="block text-xs text-white/40">@{candidate.username}</span></span>
              </button>)}</div>}
              {selectedCandidate && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><select required className={inputClass} value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}><option value="">Selecione o cargo</option>{roles.filter((role) => role.status === 'active' && (isPlatformAdmin || manageableDepartmentIds.includes(role.department_id))).map((role) => <option key={role.id} value={role.id}>{role.name} · {departments.find((item) => item.id === role.department_id)?.name || ''}</option>)}</select><button type="button" disabled={busy || !selectedRoleId} className={primaryButton} onClick={() => { if (selectedCandidate && selectedRoleId) void appointMember(); }}>Confirmar nomeação</button></div>}
            </form>}
            <div className="rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Integrantes e histórico</h2><p className="mt-1 text-sm text-white/45">Remoções preservam o registro da participação.</p></div><div className="flex gap-2"><button type="button" onClick={() => { if (memberStatus !== 'active') setLoading(true); setMemberStatus('active'); }} className={memberStatus === 'active' ? primaryButton : secondaryButton}>Ativos</button><button type="button" onClick={() => { if (memberStatus !== 'removed') setLoading(true); setMemberStatus('removed'); }} className={memberStatus === 'removed' ? primaryButton : secondaryButton}>Histórico</button></div></div>
              <div className="space-y-3">
                {members.map((member) => <article key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#100b12] p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {member.profile?.avatar_url ? <img src={member.profile.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">✦</span>}
                    <div className="min-w-0"><p className="truncate text-sm font-bold">{member.profile?.display_name || member.profile?.username || 'Conta'}{member.profile?.username ? <span className="ml-1 text-xs font-normal text-white/35">@{member.profile.username}</span> : null}</p>
                      <p className="mt-1 text-xs text-[#ff9aca]">{member.role?.badge_title || member.role?.name} · {member.department?.name}</p>
                      <p className="mt-1 text-[10px] text-white/35">Desde {dateLabel(member.assigned_at)}{member.removed_at ? ' · removido ' + dateLabel(member.removed_at) : ''}{member.removal_reason ? ' · ' + member.removal_reason : ''}</p>
                    </div>
                  </div>
                  {(isPlatformAdmin || manageableDepartmentIds.includes(member.department_id)) && member.status === 'active' && <button type="button" disabled={busy} className={secondaryButton} onClick={() => void removeMember(member)}>Remover</button>}
                </article>)}
                {!members.length && <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/40">{memberStatus === 'active' ? 'Nenhum integrante ativo.' : 'Nenhuma participação anterior.'}</p>}
              </div>
            </div>
          </section>
        )}

        {tab === 'audit' && (
          <section className="rounded-2xl border border-white/10 bg-[#191219] p-4 sm:p-6">
            <h2 className="text-xl font-bold">Histórico administrativo</h2><p className="mb-4 mt-1 text-sm text-white/45">Registro somente para consulta; ações e alterações são preservadas.</p>
            <div className="space-y-3">{audit.map((entry) => <article key={entry.id} className="rounded-xl border border-white/5 bg-[#100b12] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{entry.action}</p><time className="text-xs text-white/35">{dateLabel(entry.created_at)}</time></div>
              <p className="mt-1 text-xs text-white/50">{entry.actor?.display_name || entry.actor?.username || 'Sistema'} · {entry.subject_type}{entry.subject_id ? ' · ' + entry.subject_id : ''}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-white/35">{JSON.stringify(entry.details, null, 2)}</pre>
            </article>)}{!audit.length && <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/40">Ainda não há ações registradas.</p>}</div>
          </section>
        )}
      </div>
    </main>
  );
}
