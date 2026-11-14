import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../context'

interface OverviewStats {
  totalUsers: number
  activeSessionsCount: number
  onlineSockets: number
  pendingReports: number
  totalBans: number
  totalSuspensions: number
}

interface ReportItem {
  id: string
  reason: string
  details?: string
  status: 'OPEN' | 'REVIEWING' | 'ACTIONED' | 'DISMISSED'
  createdAt: string
  reporter: {
    id: string
    email: string
    name?: string
    profile?: { currentNickname?: string }
  }
  reported: {
    id: string
    email: string
    name?: string
    status: string
    profile?: { currentNickname?: string }
  }
  chatSession?: {
    id: string
    mode: string
    startedAt: string
    endedAt?: string
    endedReason?: string
  }
}

interface UserItem {
  id: string
  email: string
  name?: string
  role: string
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'
  suspendedUntil?: string
  createdAt: string
  lastLoginAt?: string
  profile?: {
    currentNickname?: string
  }
  _count?: {
    reportsReceived: number
    moderationActionsReceived: number
  }
}

interface ModerationLogItem {
  id: string
  action: string
  reason: string
  createdAt: string
  expiresAt?: string
  admin: { id: string; email: string; name?: string }
  targetUser: { id: string; email: string; name?: string; status: string }
  report?: { id: string; reason: string }
}

export default function AdminDashboard() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'users' | 'audit'>('overview')
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [reports, setReports] = useState<ReportItem[]>([])
  const [reportFilter, setReportFilter] = useState<string>('ALL')
  const [usersList, setUsersList] = useState<UserItem[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [auditLogs, setAuditLogs] = useState<ModerationLogItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)

  // Moderation Action Modal state
  const [moderationModalOpen, setModerationModalOpen] = useState(false)
  const [targetUserForMod, setTargetUserForMod] = useState<{ id: string; email: string; nickname?: string } | null>(null)
  const [associatedReportId, setAssociatedReportId] = useState<string | undefined>(undefined)
  const [modAction, setModAction] = useState<'WARN' | 'SUSPEND' | 'BAN' | 'UNBAN' | 'DISMISS'>('WARN')
  const [modReason, setModReason] = useState('')
  const [modDurationHours, setModDurationHours] = useState(24)
  const [isSubmittingMod, setIsSubmittingMod] = useState(false)
  const [modModalError, setModModalError] = useState<string | null>(null)

  // Check admin role
  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'admin') {
      navigate('/admin/login')
    }
  }, [isAuthenticated, user?.role, navigate])

  const loadOverview = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await apiClient.get<{ ok: boolean; stats: OverviewStats; recentActions: ModerationLogItem[] }>('/admin/overview')
      if (res?.stats) {
        setStats(res.stats)
      }
      if (res?.recentActions) {
        setAuditLogs(res.recentActions)
      }
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to load metrics')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadReports = useCallback(async () => {
    try {
      setIsLoading(true)
      const params: Record<string, string> = {}
      if (reportFilter !== 'ALL') {
        params.status = reportFilter
      }
      const res = await apiClient.get<{ ok: boolean; reports: ReportItem[] }>('/admin/reports', { params })
      if (res?.reports) {
        setReports(res.reports)
      }
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setIsLoading(false)
    }
  }, [reportFilter])

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const params: Record<string, string> = {}
      if (userSearchQuery.trim()) {
        params.search = userSearchQuery.trim()
      }
      const res = await apiClient.get<{ ok: boolean; users: UserItem[] }>('/admin/users', { params })
      if (res?.users) {
        setUsersList(res.users)
      }
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }, [userSearchQuery])

  const loadAuditLogs = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await apiClient.get<{ ok: boolean; actions: ModerationLogItem[] }>('/admin/audit-logs')
      if (res?.actions) {
        setAuditLogs(res.actions)
      }
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to load audit logs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'overview') loadOverview()
    if (activeTab === 'reports') loadReports()
    if (activeTab === 'users') loadUsers()
    if (activeTab === 'audit') loadAuditLogs()
  }, [activeTab, loadOverview, loadReports, loadUsers, loadAuditLogs])

  async function handleDismissReport(reportId: string) {
    try {
      await apiClient.put(`/admin/reports/${reportId}`, { status: 'DISMISSED' })
      loadReports()
      loadOverview()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to dismiss report')
    }
  }

  function openModerationModal(
    target: { id: string; email: string; nickname?: string },
    reportId?: string,
    initialAction: 'WARN' | 'SUSPEND' | 'BAN' | 'UNBAN' | 'DISMISS' = 'WARN'
  ) {
    setTargetUserForMod(target)
    setAssociatedReportId(reportId)
    setModAction(initialAction)
    setModReason('')
    setModDurationHours(24)
    setModModalError(null)
    setModerationModalOpen(true)
  }

  async function handleExecuteModeration(e: React.FormEvent) {
    e.preventDefault()
    if (!targetUserForMod) return
    if (!modReason.trim()) {
      setModModalError('Please specify a valid reason for this moderation action.')
      return
    }

    try {
      setIsSubmittingMod(true)
      setModModalError(null)
      await apiClient.post(`/admin/users/${targetUserForMod.id}/moderate`, {
        action: modAction,
        reason: modReason.trim(),
        durationHours: modAction === 'SUSPEND' ? Number(modDurationHours) : undefined,
        reportId: associatedReportId,
      })

      setModerationModalOpen(false)
      if (activeTab === 'overview') loadOverview()
      if (activeTab === 'reports') loadReports()
      if (activeTab === 'users') loadUsers()
      if (activeTab === 'audit') loadAuditLogs()
    } catch (err: unknown) {
      setModModalError(err instanceof Error ? err.message : 'Failed to execute moderation action')
    } finally {
      setIsSubmittingMod(false)
    }
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between overflow-x-hidden">
      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#FFF5E6] border-b-2 border-on-surface shadow-[0_2px_0px_#1c1b1b] shrink-0">
        <div className="h-14 sm:h-16 max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-1 select-none">
              <span className="font-headline-md text-xl font-bold tracking-tight text-on-surface">
                KothaKoi
              </span>
              <span className="font-headline-md text-xl font-bold text-primary">.</span>
              <span className="font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-surface-container text-error border border-on-surface ml-1 font-bold">
                ADMIN
              </span>
            </Link>
            <span className="hidden md:inline-block text-xs font-mono text-on-surface-variant/80 border-l border-on-surface/20 pl-3">
              Moderation Dashboard
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs font-mono text-on-surface-variant">
              👤 {user?.email}
            </span>
            <Link
              to="/"
              className="px-2.5 py-1 text-xs font-bold text-on-surface bg-surface border border-on-surface rounded-lg hover:bg-secondary-container transition-all"
            >
              Public Site
            </Link>
            <button
              onClick={() => logout().then(() => navigate('/admin/login'))}
              className="px-2.5 py-1 text-xs font-bold text-error bg-surface-container border border-on-surface rounded-lg hover:bg-error-container transition-all flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">logout</span>
              <span>Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Navigation Tabs ───────────────────────────────────────── */}
      <div className="bg-surface-container-low border-b-2 border-on-surface/20 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-primary text-primary font-bold bg-surface rounded-t-lg'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">dashboard</span>
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 relative ${
              activeTab === 'reports'
                ? 'border-primary text-primary font-bold bg-surface rounded-t-lg'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">flag</span>
            <span>Reports</span>
            {stats && stats.pendingReports > 0 && (
              <span className="px-1.5 py-0.2 bg-error text-white font-mono text-[10px] rounded-full">
                {stats.pendingReports}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'border-primary text-primary font-bold bg-surface rounded-t-lg'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">group</span>
            <span>Users</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-primary text-primary font-bold bg-surface rounded-t-lg'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span>Audit Log</span>
          </button>
        </div>
        {isLoading && (
          <div className="flex items-center gap-1.5 pb-2 text-xs text-on-surface-variant font-mono">
            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        )}
      </div>
      </div>

      {/* ── Main Dashboard Body ──────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {errorNotice && (
          <div className="p-3 bg-error-container text-on-error-container border border-on-surface rounded-xl text-xs font-bold flex items-center justify-between">
            <span>{errorNotice}</span>
            <button onClick={() => setErrorNotice(null)} className="text-xs">✕</button>
          </div>
        )}

        {/* ── TAB 1: OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
                <span className="text-[10px] font-bold uppercase text-on-surface-variant block">Total Users</span>
                <span className="text-2xl font-bold font-mono text-on-surface">{stats?.totalUsers ?? '—'}</span>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
                <span className="text-[10px] font-bold uppercase text-on-surface-variant block">Active Sessions</span>
                <span className="text-2xl font-bold font-mono text-emerald-700">{stats?.activeSessionsCount ?? '—'}</span>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
                <span className="text-[10px] font-bold uppercase text-on-surface-variant block">Online Sockets</span>
                <span className="text-2xl font-bold font-mono text-primary">{stats?.onlineSockets ?? '—'}</span>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
                <span className="text-[10px] font-bold uppercase text-on-surface-variant block">Pending Reports</span>
                <span className="text-2xl font-bold font-mono text-error">{stats?.pendingReports ?? '—'}</span>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
                <span className="text-[10px] font-bold uppercase text-on-surface-variant block">Banned Users</span>
                <span className="text-2xl font-bold font-mono text-on-surface-variant">{stats?.totalBans ?? '—'}</span>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
                <span className="text-[10px] font-bold uppercase text-on-surface-variant block">Suspensions</span>
                <span className="text-2xl font-bold font-mono text-amber-700">{stats?.totalSuspensions ?? '—'}</span>
              </div>
            </div>

            {/* Quick Actions & Recent Log */}
            <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-on-surface/20 pb-3">
                <h3 className="font-headline-md text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">gavel</span>
                  Recent Moderation Actions
                </h3>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  View All Actions →
                </button>
              </div>

              {auditLogs.length === 0 ? (
                <p className="text-xs text-on-surface-variant py-4 text-center">No moderation actions recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-on-surface/15 text-on-surface-variant font-bold">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Admin</th>
                        <th className="py-2 px-3">Target User</th>
                        <th className="py-2 px-3">Action</th>
                        <th className="py-2 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-on-surface/10">
                      {auditLogs.slice(0, 5).map((log) => (
                        <tr key={log.id} className="hover:bg-surface-container-low">
                          <td className="py-2 px-3 font-mono text-[11px]">
                            {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2 px-3 font-mono">{log.admin.email}</td>
                          <td className="py-2 px-3 font-mono">{log.targetUser.email}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              log.action === 'BAN' ? 'bg-error text-white' : log.action === 'SUSPEND' ? 'bg-amber-100 text-amber-800 border border-amber-500' : 'bg-surface-container text-on-surface'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant max-w-xs truncate">{log.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: REPORTS ── */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest p-4 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface">Filter Status:</span>
                {['ALL', 'OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setReportFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      reportFilter === st
                        ? 'bg-primary-container text-on-surface border-on-surface shadow-[1px_1px_0px_#1c1b1b]'
                        : 'bg-surface text-on-surface-variant border-on-surface/30 hover:border-on-surface'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <button
                onClick={loadReports}
                className="px-3 py-1 bg-surface-container text-xs font-bold rounded-lg border border-on-surface hover:bg-secondary-container"
              >
                Refresh
              </button>
            </div>

            {reports.length === 0 ? (
              <div className="p-8 text-center bg-surface-container-lowest rounded-xl border-2 border-on-surface text-xs text-on-surface-variant">
                No reports found matching status &quot;{reportFilter}&quot;.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-4 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-error/10 border border-error text-error text-[10px] font-bold rounded">
                          {rep.reason}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          rep.status === 'OPEN' ? 'bg-amber-100 text-amber-800 border border-amber-600' :
                          rep.status === 'ACTIONED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-600' :
                          'bg-surface-container text-on-surface-variant border border-on-surface/30'
                        }`}>
                          {rep.status}
                        </span>
                        <span className="text-[11px] font-mono text-on-surface-variant">
                          {new Date(rep.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="text-xs text-on-surface">
                        <span className="text-on-surface-variant">Reported: </span>
                        <strong className="font-mono">{rep.reported.email}</strong>{' '}
                        {rep.reported.profile?.currentNickname && (
                          <span className="text-on-surface-variant font-mono">
                            (Alias: &quot;{rep.reported.profile.currentNickname}&quot;)
                          </span>
                        )}
                        <span className="text-on-surface-variant ml-2">by: </span>
                        <span className="font-mono text-on-surface-variant">{rep.reporter.email}</span>
                      </div>

                      {rep.details && (
                        <p className="text-xs p-2.5 bg-surface rounded-lg border border-on-surface/20 text-on-surface italic">
                          &quot;{rep.details}&quot;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {rep.status !== 'ACTIONED' && (
                        <button
                          onClick={() => openModerationModal(
                            { id: rep.reported.id, email: rep.reported.email, nickname: rep.reported.profile?.currentNickname },
                            rep.id,
                            'WARN'
                          )}
                          className="px-3 py-1.5 bg-primary-container text-on-surface font-bold text-xs rounded-xl border border-on-surface shadow-[1px_1px_0px_#1c1b1b] hover:bg-[#ff8638]"
                        >
                          Take Action
                        </button>
                      )}
                      {rep.status === 'OPEN' && (
                        <button
                          onClick={() => handleDismissReport(rep.id)}
                          className="px-3 py-1.5 bg-surface-container text-on-surface-variant font-bold text-xs rounded-xl border border-on-surface hover:text-on-surface"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: USERS ── */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-surface-container-lowest p-4 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b]">
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search students by email, name, or nickname..."
                className="flex-1 px-3 py-2 bg-surface text-on-surface text-xs rounded-lg border-2 border-on-surface focus:outline-none"
              />
              <button
                onClick={loadUsers}
                className="px-4 py-2 bg-[#1c1b1b] text-white font-bold text-xs rounded-lg border border-on-surface shadow-[2px_2px_0px_#888]"
              >
                Search
              </button>
            </div>

            <div className="bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FFF5E6] border-b-2 border-on-surface/20 text-on-surface font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Student Email</th>
                      <th className="py-2.5 px-3">Alias</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Joined</th>
                      <th className="py-2.5 px-3 text-right">Moderation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-on-surface/10">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-surface-container-low">
                        <td className="py-2.5 px-3 font-mono font-medium">{u.email}</td>
                        <td className="py-2.5 px-3">{u.profile?.currentNickname || '—'}</td>
                        <td className="py-2.5 px-3 font-mono text-[10px] uppercase font-bold">{u.role}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            u.status === 'BANNED' ? 'bg-error text-white' :
                            u.status === 'SUSPENDED' ? 'bg-amber-100 text-amber-800 border border-amber-600' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-on-surface-variant font-mono text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-1">
                          <button
                            onClick={() => openModerationModal(
                              { id: u.id, email: u.email, nickname: u.profile?.currentNickname },
                              undefined,
                              u.status === 'BANNED' ? 'UNBAN' : 'WARN'
                            )}
                            className="px-2.5 py-1 bg-surface-container hover:bg-secondary-container text-on-surface font-bold text-[11px] rounded border border-on-surface"
                          >
                            Moderate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: AUDIT LOG ── */}
        {activeTab === 'audit' && (
          <div className="bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-on-surface/20 pb-3">
              <h3 className="font-headline-md text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">history</span>
                Comprehensive Moderation Audit Trail
              </h3>
              <button
                onClick={loadAuditLogs}
                className="px-3 py-1 bg-surface-container text-xs font-bold rounded-lg border border-on-surface"
              >
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-on-surface/15 text-on-surface-variant font-bold">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Admin</th>
                    <th className="py-2.5 px-3">Target Student</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Reason &amp; Expiration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface/10">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-container-low">
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{log.admin.email}</td>
                      <td className="py-2.5 px-3 font-mono">{log.targetUser.email}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          log.action === 'BAN' ? 'bg-error text-white' :
                          log.action === 'SUSPEND' ? 'bg-amber-100 text-amber-800 border border-amber-600' :
                          'bg-surface-container text-on-surface'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-on-surface-variant">
                        <span>{log.reason}</span>
                        {log.expiresAt && (
                          <span className="block text-[10px] font-mono text-amber-800">
                            Expires: {new Date(log.expiresAt).toLocaleString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ── Action Modal: Warn / Suspend / Ban / Unban ───────────── */}
      {moderationModalOpen && targetUserForMod && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#FFFDF9] max-w-md w-full rounded-2xl border-2 border-on-surface shadow-[6px_6px_0px_#1c1b1b] p-6 relative flex flex-col gap-4">
            <button
              onClick={() => setModerationModalOpen(false)}
              className="absolute top-4 right-4 text-on-surface hover:text-error text-sm font-bold"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 border-b border-on-surface/20 pb-2">
              <span className="material-symbols-outlined text-primary text-[22px]">gavel</span>
              <h3 className="font-headline-md text-base font-bold text-on-surface">
                Moderate Student Account
              </h3>
            </div>

            <div className="text-xs space-y-1">
              <div>Target: <strong className="font-mono">{targetUserForMod.email}</strong></div>
              {targetUserForMod.nickname && (
                <div className="text-on-surface-variant">Chat Alias: &quot;{targetUserForMod.nickname}&quot;</div>
              )}
            </div>

            {modModalError && (
              <div className="p-2.5 bg-error-container text-on-error-container text-xs font-bold rounded-lg border border-on-surface">
                {modModalError}
              </div>
            )}

            <form onSubmit={handleExecuteModeration} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Action Type</label>
                <select
                  value={modAction}
                  onChange={(e) => setModAction(e.target.value as any)}
                  className="w-full p-2 bg-surface text-on-surface text-xs rounded-lg border-2 border-on-surface font-bold focus:outline-none"
                >
                  <option value="WARN">WARN — Issue Formal Warning</option>
                  <option value="SUSPEND">SUSPEND — Temporary Account Lockout</option>
                  <option value="BAN">BAN — Permanent Platform Exclusion</option>
                  <option value="UNBAN">UNBAN — Restore Account</option>
                  <option value="DISMISS">DISMISS — Dismiss Associated Report</option>
                </select>
              </div>

              {modAction === 'SUSPEND' && (
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Suspension Duration (Hours)</label>
                  <select
                    value={modDurationHours}
                    onChange={(e) => setModDurationHours(Number(e.target.value))}
                    className="w-full p-2 bg-surface text-on-surface text-xs rounded-lg border-2 border-on-surface font-bold focus:outline-none"
                  >
                    <option value={12}>12 Hours</option>
                    <option value={24}>24 Hours (1 Day)</option>
                    <option value={48}>48 Hours (2 Days)</option>
                    <option value={72}>72 Hours (3 Days)</option>
                    <option value={168}>168 Hours (1 Week)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">
                  Reason for Moderation (Logged in Audit Trail)
                </label>
                <textarea
                  required
                  rows={3}
                  value={modReason}
                  onChange={(e) => setModReason(e.target.value)}
                  placeholder="Provide detailed justification for this disciplinary action..."
                  className="w-full p-2 bg-surface text-on-surface text-xs rounded-lg border-2 border-on-surface resize-none focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-on-surface/20">
                <button
                  type="button"
                  onClick={() => setModerationModalOpen(false)}
                  disabled={isSubmittingMod}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-on-surface bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMod}
                  className="px-4 py-1.5 bg-[#1c1b1b] text-white text-xs font-bold rounded-lg border border-on-surface shadow-[2px_2px_0px_#888] disabled:opacity-50"
                >
                  {isSubmittingMod ? 'Executing...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-3 text-center text-xs text-on-surface-variant font-label-sm">
        KothaKoi Moderation Engine • Real-time Safety &amp; Audit Integrity
      </footer>
    </div>
  )
}
