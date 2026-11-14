import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Download, KeyRound, Mail, Shield, Users } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { FeatureDefinition, LanguageCode, UserSession } from '../types/sortsight.ts';
import {
  AlertBanner,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  KpiCard,
  LoadingSkeleton,
  Panel,
  SectionHeader,
  StatusTag,
  Tabs,
} from '../components/ui/DesignSystem.tsx';
import { useToast } from '../components/ui/ToastProvider.tsx';

export const TeamManagementView: React.FC = () => {
  const { pushToast } = useToast();
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [roles, setRoles] = useState<Array<{ role_name: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleName, setRoleName] = useState('operator');

  const load = () => {
    setLoading(true);
    apiRequest<{ members: Array<Record<string, unknown>>; roles: typeof roles }>('/organizations/members')
      .then((r) => {
        setMembers(r.members);
        setRoles(r.roles);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/organizations/members', {
        method: 'POST',
        body: JSON.stringify({ email, fullName, roleName }),
      });
      pushToast({ tone: 'success', title: 'Member provisioned', description: `${fullName} (${roleName}) added and audited.` });
      setEmail('');
      setFullName('');
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Provisioning blocked', description: err instanceof Error ? err.message : 'Admin permission required.' });
    }
  };

  const updateRole = async (membershipId: string, nextRole: string) => {
    try {
      await apiRequest(`/organizations/members/${membershipId}`, {
        method: 'PUT',
        body: JSON.stringify({ roleName: nextRole }),
      });
      pushToast({ tone: 'success', title: 'RBAC role updated', description: `Assigned ${nextRole}` });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Role update failed', description: err instanceof Error ? err.message : 'Admin permission required.' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="h-6 w-6 text-emerald-600" />
          Team &amp; Role-Based Access Control
        </h1>
        <p className="text-xs text-slate-500 mt-1">Manage organization operators, QA reviewers, analysts, and facility managers with strict RBAC isolation.</p>
      </div>

      <Panel>
        <form onSubmit={addMember} className="flex flex-wrap gap-3 text-xs items-center">
          <input type="email" required placeholder="Member Email" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
          <input type="text" required placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
          <select value={roleName} onChange={(e) => setRoleName(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono">
            {roles.map((r) => <option key={r.role_name} value={r.role_name}>{r.role_name}</option>)}
          </select>
          <Button type="submit" variant="primary" size="sm">Add Member</Button>
        </form>
      </Panel>

      <Panel>
        <SectionHeader title="Organization Members" badge={<StatusTag tone="teal">{members.length} users</StatusTag>} />
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <DataTable
            rows={members}
            rowKey={(m) => String(m.membership_id)}
            pageSize={10}
            columns={[
              { key: 'name', header: 'Member', sortValue: (m) => String(m.full_name), render: (m) => <span className="font-semibold text-xs">{String(m.full_name)}</span> },
              { key: 'email', header: 'Email', render: (m) => <span className="font-mono text-xs">{String(m.email)}</span> },
              { key: 'fac', header: 'Assigned Facility', render: (m) => <span className="text-xs text-slate-600 dark:text-slate-400">{String(m.facility_name || 'Organization-Wide')}</span> },
              {
                key: 'role',
                header: 'Role',
                render: (m) => (
                  <select
                    value={String(m.role_name)}
                    onChange={(e) => updateRole(String(m.membership_id), e.target.value)}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono text-xs"
                  >
                    {roles.map((r) => <option key={r.role_name} value={r.role_name}>{r.role_name}</option>)}
                  </select>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
};

export const NotificationsView: React.FC<{ onRefreshCount: () => void }> = ({ onRefreshCount }) => {
  const { pushToast } = useToast();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const load = () => {
    setLoading(true);
    Promise.all([
      apiRequest<{ notifications: Array<Record<string, unknown>>; smtpConfigured: boolean }>('/notifications').then((r) => {
        setItems(r.notifications);
        setSmtpConfigured(r.smtpConfigured);
        onRefreshCount();
      }),
      apiRequest<{ members: Array<Record<string, unknown>> }>('/organizations/members')
        .then((r) => setMembers(r.members))
        .catch(() => {}),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const acknowledgeAlert = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({}) });
      pushToast({ tone: 'info', title: 'Alert acknowledged' });
      load();
    } catch {
      pushToast({ tone: 'critical', title: 'Could not acknowledge alert' });
    }
  };

  const resolveAlert = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) });
      pushToast({ tone: 'success', title: 'Alert resolved & archived' });
      load();
    } catch {
      pushToast({ tone: 'critical', title: 'Could not resolve alert' });
    }
  };

  const assignAlert = async (id: string, assignedToUserId: string) => {
    try {
      await apiRequest(`/notifications/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToUserId: assignedToUserId || null }),
      });
      pushToast({ tone: 'success', title: 'Alert assignee updated' });
      load();
    } catch {
      pushToast({ tone: 'critical', title: 'Assignment failed' });
    }
  };

  const triggerTestEmail = async () => {
    try {
      const res = await apiRequest<{ note: string }>('/notifications/test-email', {
        method: 'POST',
        body: JSON.stringify({ subject: 'SortSight Alert Verification' }),
      });
      pushToast({ tone: 'info', title: 'Test Email Alert Dispatched', description: res.note });
      load();
    } catch {
      pushToast({ tone: 'critical', title: 'Dispatch failed' });
    }
  };

  const openCount = items.filter((n) => (n.status || 'open') === 'open').length;
  const criticalOpen = items.filter((n) => (n.status || 'open') === 'open' && n.severity === 'critical').length;
  const ackCount = items.filter((n) => n.status === 'acknowledged').length;
  const resolvedCount = items.filter((n) => n.status === 'resolved').length;

  const filtered = items.filter((n) => {
    const st = String(n.status || 'open');
    const sev = String(n.severity || 'info');
    if (statusFilter !== 'all' && st !== statusFilter) return false;
    if (severityFilter !== 'all' && sev !== severityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="h-6 w-6 text-emerald-600" />
            Intelligent Alert Management Center
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Deduplicated operational alerts with acknowledge/resolve workflows, operator assignment, and audit logging. SMTP:{' '}
            {smtpConfigured ? 'Configured' : 'Simulated Log Mode'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={triggerTestEmail}>
          <Mail className="h-3.5 w-3.5" /> Test Email Dispatch
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Open Alerts" value={openCount} subtext="Requires triage" tone={openCount > 0 ? 'amber' : 'emerald'} provenance="LIVE" />
        <KpiCard label="Critical Open" value={criticalOpen} subtext="Immediate safety priority" tone={criticalOpen > 0 ? 'rose' : 'emerald'} provenance="LIVE" />
        <KpiCard label="Acknowledged" value={ackCount} subtext="In active investigation" tone="teal" provenance="LIVE" />
        <KpiCard label="Resolved" value={resolvedCount} subtext="Closed with audit log" tone="neutral" provenance="LIVE" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { id: 'all' as const, label: 'All Alerts', count: items.length },
            { id: 'open' as const, label: 'Open', count: openCount },
            { id: 'acknowledged' as const, label: 'Acknowledged', count: ackCount },
            { id: 'resolved' as const, label: 'Resolved', count: resolvedCount },
          ]}
          activeId={statusFilter}
          onChange={setStatusFilter}
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No alerts match current filters" description="All alerts in this view have been acknowledged or resolved." />
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const id = String(n.id);
            const sev = String(n.severity || 'info');
            const st = String(n.status || 'open');
            const occ = Number(n.occurrence_count || 1);
            return (
              <Panel key={id} className="text-xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusTag tone={sev === 'critical' ? 'rose' : sev === 'warning' ? 'amber' : 'teal'}>
                        {sev.toUpperCase()}
                      </StatusTag>
                      <StatusTag tone={st === 'resolved' ? 'emerald' : st === 'acknowledged' ? 'teal' : 'amber'}>
                        {st.toUpperCase()}
                      </StatusTag>
                      {occ > 1 && <StatusTag tone="neutral">{occ}× occurrences (Grouped)</StatusTag>}
                      {n.facility_name ? <StatusTag tone="neutral">{String(n.facility_name)}</StatusTag> : null}
                      <span className="font-mono text-[11px] text-slate-500">{String(n.created_at)}</span>
                    </div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-white pt-0.5">{String(n.title)}</div>
                    <div className="text-slate-600 dark:text-slate-300 leading-relaxed">{String(n.message)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {members.length > 0 && (
                      <select
                        value={String(n.assigned_to_user_id || '')}
                        onChange={(e) => assignAlert(id, e.target.value)}
                        aria-label="Assign alert owner"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={String(m.user_id)} value={String(m.user_id)}>
                            {String(m.full_name)}
                          </option>
                        ))}
                      </select>
                    )}
                    {st === 'open' && (
                      <Button size="sm" variant="secondary" onClick={() => acknowledgeAlert(id)}>
                        Acknowledge
                      </Button>
                    )}
                    {st !== 'resolved' && (
                      <Button size="sm" variant="primary" onClick={() => resolveAlert(id)}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DeveloperCenterView: React.FC = () => {
  const { pushToast } = useToast();
  const [keys, setKeys] = useState<Array<Record<string, unknown>>>([]);
  const [webhooks, setWebhooks] = useState<Array<Record<string, unknown>>>([]);
  const [deliveries, setDeliveries] = useState<Array<Record<string, unknown>>>([]);
  const [openapi, setOpenapi] = useState<Record<string, unknown> | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKeyOnce, setCreatedKeyOnce] = useState('');
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('https://example.invalid/hooks/sortsight');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const load = () => {
    apiRequest<{ apiKeys: Array<Record<string, unknown>> }>('/admin/api-keys').then((r) => setKeys(r.apiKeys)).catch(() => {});
    apiRequest<{ webhooks: Array<Record<string, unknown>>; deliveries: Array<Record<string, unknown>> }>('/webhooks').then((r) => {
      setWebhooks(r.webhooks);
      setDeliveries(r.deliveries);
    }).catch(() => {});
    apiRequest<Record<string, unknown>>('/openapi.json').then(setOpenapi).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ apiKeyPlaintextOnce: string }>('/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName }),
      });
      setCreatedKeyOnce(res.apiKeyPlaintextOnce);
      setNewKeyName('');
      pushToast({ tone: 'success', title: 'API key generated', description: 'Copy the secret key now — it will not be shown again.' });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Key creation failed', description: err instanceof Error ? err.message : 'Admin permission required' });
    }
  };

  const confirmRevokeKey = async () => {
    if (!revokeTarget) return;
    try {
      await apiRequest(`/admin/api-keys/${revokeTarget}`, { method: 'DELETE' });
      pushToast({ tone: 'warning', title: 'API key revoked' });
      setRevokeTarget(null);
      load();
    } catch {
      pushToast({ tone: 'critical', title: 'Revoke failed' });
      setRevokeTarget(null);
    }
  };

  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/webhooks', {
        method: 'POST',
        body: JSON.stringify({ name: whName, targetUrl: whUrl, events: ['hazard.detected', 'review.escalated'] }),
      });
      pushToast({ tone: 'success', title: 'Webhook endpoint registered', description: whName });
      setWhName('');
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Webhook registration failed', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const testWebhook = async (id: string) => {
    try {
      await apiRequest(`/webhooks/${id}/test`, { method: 'POST', body: JSON.stringify({}) });
      pushToast({ tone: 'info', title: 'Signed test payload dispatched', description: 'Check delivery log below.' });
      load();
    } catch {
      pushToast({ tone: 'critical', title: 'Webhook test failed' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-emerald-600" />
          API, Webhooks &amp; Developer Center
        </h1>
        <p className="text-xs text-slate-500 mt-1">Manage SHA-256 hashed API keys, HMAC-signed webhook endpoints, and OpenAPI v1 documentation.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel className="space-y-4 text-xs">
          <SectionHeader title="API Keys (SHA-256 Hashed)" />
          <form onSubmit={createKey} className="flex gap-2">
            <input type="text" required placeholder="Key Name (e.g. Plant SCADA Client)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            <Button type="submit" variant="primary" size="sm">Generate Key</Button>
          </form>
          {createdKeyOnce && (
            <AlertBanner
              tone="warning"
              title="Copy Plaintext Key Now (Shown Once)"
              message={createdKeyOnce}
            />
          )}
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={String(k.id)} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <div>
                  <div className="font-semibold">{String(k.name)}</div>
                  <div className="font-mono text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>{String(k.key_prefix)}...</span>
                    <StatusTag tone={k.is_revoked ? 'rose' : 'emerald'}>{k.is_revoked ? 'REVOKED' : 'ACTIVE'}</StatusTag>
                  </div>
                </div>
                {!k.is_revoked && (
                  <Button size="sm" variant="danger" onClick={() => setRevokeTarget(String(k.id))}>Revoke</Button>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-4 text-xs">
          <SectionHeader title="Signed Webhooks (AES-256-GCM Secret Storage)" />
          <form onSubmit={createWebhook} className="flex flex-wrap gap-2">
            <input type="text" required placeholder="Webhook Name" value={whName} onChange={(e) => setWhName(e.target.value)} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            <input type="url" required value={whUrl} onChange={(e) => setWhUrl(e.target.value)} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
            <Button type="submit" variant="secondary" size="sm">Register</Button>
          </form>
          <div className="space-y-2">
            {webhooks.map((w) => (
              <div key={String(w.id)} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 gap-2">
                <div className="truncate pr-2">
                  <div className="font-semibold">{String(w.name)}</div>
                  <div className="font-mono text-slate-500 truncate">{String(w.target_url)}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => testWebhook(String(w.id))}>Test Dispatch</Button>
              </div>
            ))}
          </div>
          {deliveries.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 font-mono text-[11px] text-slate-500">
              Latest delivery: {String(deliveries[0].event_type)} ({String(deliveries[0].delivery_status)})
            </div>
          )}
        </Panel>
      </div>

      {openapi && (
        <Panel>
          <SectionHeader title="OpenAPI v1 Specification (/api/v1/openapi.json)" badge={<StatusTag tone="teal">REST v1</StatusTag>} />
          <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-lg overflow-x-auto max-h-72">
            {JSON.stringify(openapi, null, 2)}
          </pre>
        </Panel>
      )}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={confirmRevokeKey}
        title="Revoke API Key"
        description="Any external SCADA or edge scripts authenticating with this API key will immediately receive HTTP 401 Unauthorized responses."
        confirmLabel="Revoke Key"
        tone="danger"
      />
    </div>
  );
};

export const SecuritySettingsProfileAdminView: React.FC<{
  mode: 'security' | 'settings' | 'profile' | 'admin';
  user: UserSession;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
}> = ({ mode, user, language, onChangeLanguage }) => {
  const { pushToast } = useToast();
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [auditFilter, setAuditFilter] = useState('');
  const [features, setFeatures] = useState<FeatureDefinition[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [org, setOrg] = useState<Record<string, unknown> | null>(null);
  const [retentionDays, setRetentionDays] = useState(365);
  const [storeImages, setStoreImages] = useState(true);
  const [featureSearch, setFeatureSearch] = useState('');
  const [fullName, setFullName] = useState(user.fullName);

  useEffect(() => {
    if (mode === 'security') {
      apiRequest<{ logs: Array<Record<string, unknown>> }>('/admin/audit-logs').then((r) => setAuditLogs(r.logs)).catch(() => {});
    }
    if (mode === 'admin') {
      apiRequest<{ features: FeatureDefinition[] }>('/features').then((r) => setFeatures(r.features)).catch(() => {});
      apiRequest<Record<string, unknown>>('/health').then(setHealth).catch(() => {});
    }
    if (mode === 'settings') {
      apiRequest<{ organization: Record<string, unknown> }>('/organizations/current').then((r) => {
        setOrg(r.organization);
        setRetentionDays(Number(r.organization.privacy_retention_days || 365));
        setStoreImages(Boolean(r.organization.store_detection_images));
      }).catch(() => {});
    }
  }, [mode]);

  const saveOrgPrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/organizations/current', {
        method: 'PUT',
        body: JSON.stringify({ privacyRetentionDays: retentionDays, storeDetectionImages: storeImages }),
      });
      pushToast({ tone: 'success', title: 'Organization privacy controls saved' });
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Update failed', description: err instanceof Error ? err.message : 'Admin permission required' });
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/users/me/preferences', {
        method: 'PUT',
        body: JSON.stringify({ fullName, preferredLanguage: language }),
      });
      pushToast({ tone: 'success', title: 'Profile & language preferences saved' });
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Save failed', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const downloadBackup = async () => {
    try {
      const bundle = await apiRequest<Record<string, unknown>>('/admin/backup');
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sortsight_tenant_backup_${user.organizationId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ tone: 'success', title: 'Tenant backup bundle exported' });
    } catch {
      pushToast({ tone: 'critical', title: 'Backup export failed' });
    }
  };

  if (mode === 'security') {
    const filteredLogs = auditLogs.filter((l) => {
      const q = auditFilter.trim().toLowerCase();
      return (
        !q ||
        String(l.actor_email).toLowerCase().includes(q) ||
        String(l.action).toLowerCase().includes(q) ||
        String(l.resource_type).toLowerCase().includes(q)
      );
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="h-6 w-6 text-emerald-600" />
              Security &amp; Audit Center
            </h1>
            <p className="text-xs text-slate-500 mt-1">Immutable organization-scoped audit log of authentication, reviews, alerts, handovers, and admin changes.</p>
          </div>
          <input
            type="text"
            value={auditFilter}
            onChange={(e) => setAuditFilter(e.target.value)}
            placeholder="Search actor, action, or resource..."
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
          />
        </div>

        <Panel>
          <DataTable
            rows={filteredLogs}
            rowKey={(l) => String(l.id)}
            pageSize={12}
            columns={[
              { key: 'ts', header: 'Timestamp', render: (l) => <span className="font-mono text-xs text-slate-500">{String(l.created_at)}</span> },
              { key: 'actor', header: 'Actor', render: (l) => <span className="font-mono text-xs">{String(l.actor_email)}</span> },
              { key: 'action', header: 'Action', render: (l) => <StatusTag tone="teal">{String(l.action)}</StatusTag> },
              { key: 'res', header: 'Resource', render: (l) => <span className="font-mono text-xs">{String(l.resource_type)} ({String(l.resource_id || '—')})</span> },
              { key: 'det', header: 'Details', render: (l) => <span className="font-mono text-[11px] text-slate-500 max-w-xs block truncate">{String(l.details_json)}</span> },
            ]}
          />
        </Panel>
      </div>
    );
  }

  if (mode === 'settings') {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Organization &amp; Data Privacy Settings</h1>
        <Panel className="max-w-2xl">
          <form onSubmit={saveOrgPrivacy} className="space-y-4 text-xs">
            <div>
              <div className="text-slate-500">Active Tenant ID</div>
              <div className="font-mono font-semibold mt-0.5 text-slate-900 dark:text-white">{String(org?.id || user.organizationId)}</div>
            </div>
            <div>
              <label className="block font-medium mb-1">Detection Retention Window (Days)</label>
              <input type="number" min={7} max={3650} value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value))} className="w-40 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
            </div>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={storeImages} onChange={(e) => setStoreImages(e.target.checked)} />
              Allow persistence of inspection frame thumbnails in tenant storage
            </label>
            <Button type="submit" variant="primary" size="sm">Save Organization Settings</Button>
          </form>
        </Panel>
      </div>
    );
  }

  if (mode === 'profile') {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">User Profile &amp; Localization</h1>
        <Panel className="max-w-xl">
          <form onSubmit={saveProfile} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium mb-1">Full Name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            </div>
            <div>
              <label className="block font-medium mb-1">Preferred Interface Language</label>
              <select value={language} onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2">
                <option value="en">English (EN)</option>
                <option value="sv">Svenska (SV)</option>
                <option value="de">Deutsch (DE)</option>
                <option value="es">Español (ES)</option>
                <option value="ja">日本語 (JA)</option>
              </select>
            </div>
            <Button type="submit" variant="primary" size="sm">Save Preferences</Button>
          </form>
        </Panel>
      </div>
    );
  }

  // Admin Control Panel + 154-Feature Registry Explorer
  const filteredFeatures = features.filter((f) => {
    const q = featureSearch.trim().toLowerCase();
    return !q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || String(f.id) === q;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Admin Control Panel &amp; 154-Feature Traceability
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            System health monitoring, tenant data backup export, and complete requirement-to-code registry.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={downloadBackup}>
          <Download className="h-3.5 w-3.5" /> Export Tenant Backup (JSON)
        </Button>
      </div>

      {health && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="API Health" value={String(health.status).toUpperCase()} subtext="Express + SQLite" tone="emerald" provenance="LIVE" />
          <KpiCard
            label="AI Vision Provider"
            value={(health.aiProvider as Record<string, unknown>)?.geminiConfigured ? 'Gemini 4 Hydrogen' : 'Edge Fallback'}
            subtext={(health.aiProvider as Record<string, unknown>)?.geminiConfigured ? 'Cloud Vision + Edge Fallback' : 'Local deterministic analyzer'}
            tone="teal"
            provenance="LIVE"
          />
          <KpiCard label="PLC / Automation Gateway" value={String(health.hardwareMode).toUpperCase()} subtext="Hardware boundary isolated" tone="amber" provenance="SIMULATED" />
        </div>
      )}

      <Panel>
        <SectionHeader
          title={`All 154 Mandatory Features Registry (${filteredFeatures.length})`}
          action={
            <input
              type="text"
              value={featureSearch}
              onChange={(e) => setFeatureSearch(e.target.value)}
              placeholder="Filter by ID, name, or category..."
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs"
            />
          }
        />
        <DataTable
          rows={filteredFeatures}
          rowKey={(f) => String(f.id)}
          pageSize={15}
          columns={[
            { key: 'id', header: 'ID', sortValue: (f) => f.id, render: (f) => <span className="font-mono text-xs text-slate-500">{f.id}</span> },
            { key: 'name', header: 'Feature', sortValue: (f) => f.name, render: (f) => <span className="font-medium text-xs">{f.name}</span> },
            { key: 'ui', header: 'UI Route', render: (f) => <span className="font-mono text-xs">{f.uiLocation}</span> },
            { key: 'api', header: 'API Endpoint', render: (f) => <span className="font-mono text-xs text-slate-500">{f.apiEndpoint}</span> },
            { key: 'note', header: 'Boundary / Status', render: (f) => <span className="text-xs text-slate-500">{f.externalBoundary || 'Implemented end-to-end'}</span> },
          ]}
        />
      </Panel>
    </div>
  );
};
