/**
 * @file Institute admin panel — sitemap, users, usage stats.
 *
 * Visible only to users with role 'institute_admin' or 'super_admin'. The
 * frontend hides the entry point and the backend enforces authorization
 * (a non-admin who navigates here directly will see a 403 fallback).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    AdminUserRow,
    adminService,
    SitemapNode,
    SitemapResponse,
    UsageStatsResponse,
} from '../services/adminService';
import { ApiError } from '../services/apiClient';
import { ADMIN_ROLES } from '../types';
import Card from './Card';
import Loader from './Loader';
import Button from './Button';
import { useAppContext } from '../App';

type AdminTab = 'overview' | 'users' | 'sitemap';

const AdminPanel: React.FC = () => {
    const { currentUser } = useAppContext();
    const [tab, setTab] = useState<AdminTab>('overview');

    if (!currentUser || !ADMIN_ROLES.includes(currentUser.role)) {
        return (
            <Card>
                <div className="p-6 text-center">
                    <h2 className="text-xl font-bold mb-2">Admin access required</h2>
                    <p className="text-slate-600 dark:text-slate-400">
                        This area is only available to institute administrators.
                    </p>
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-700">
                {(['overview', 'users', 'sitemap'] as AdminTab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={
                            'px-4 py-2 text-sm font-medium rounded-t-md focus:outline-none ' +
                            (tab === t
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700')
                        }
                    >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>

            {tab === 'overview' && <OverviewTab />}
            {tab === 'users' && <UsersTab />}
            {tab === 'sitemap' && <SitemapTab />}
        </div>
    );
};

// -- Overview tab -- //

const OverviewTab: React.FC = () => {
    const [stats, setStats] = useState<UsageStatsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        adminService
            .getUsageStats()
            .then(setStats)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load stats'));
    }, []);

    if (error) return <Card><div className="p-6 text-red-600">{error}</div></Card>;
    if (!stats) return <Loader text="Loading institute stats..." />;

    const StatBox: React.FC<{ label: string; value: number | string; sub?: string }> = ({ label, value, sub }) => (
        <Card>
            <div className="p-4">
                <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
                <div className="text-3xl font-bold mt-1">{value}</div>
                {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</div>}
            </div>
        </Card>
    );

    return (
        <div className="space-y-6">
            <Card>
                <div className="p-6">
                    <h2 className="text-2xl font-bold">{stats.institute.name}</h2>
                    <div className="text-slate-500 dark:text-slate-400">
                        Plan: <span className="font-semibold uppercase">{stats.institute.plan_tier}</span>
                        {' · '}Slug: <code>{stats.institute.slug}</code>
                        {' · '}Seats: {stats.institute.max_users}
                    </div>
                </div>
            </Card>

            <div>
                <h3 className="text-lg font-semibold mb-3">Users</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatBox label="Total users" value={stats.users.total} />
                    <StatBox label="Active" value={stats.users.active} />
                    <StatBox label="Pro" value={stats.users.pro} sub={`of ${stats.users.total} total`} />
                    <StatBox
                        label="Roles"
                        value={Object.keys(stats.users.by_role).length}
                        sub={Object.entries(stats.users.by_role).map(([r, c]) => `${r}: ${c}`).join(' · ')}
                    />
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-3">Practice sessions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatBox
                        label="Writing"
                        value={stats.sessions.writing.count}
                        sub={`avg band ${stats.sessions.writing.avg_band || 'n/a'}`}
                    />
                    <StatBox label="Speaking (analyzed)" value={stats.sessions.speaking_analyzed} />
                    <StatBox label="Reading" value={stats.sessions.reading} />
                    <StatBox label="Listening" value={stats.sessions.listening} />
                </div>
            </div>
        </div>
    );
};

// -- Users tab -- //

const UsersTab: React.FC = () => {
    const [users, setUsers] = useState<AdminUserRow[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await adminService.listUsers({ search: search || undefined, limit: 50 });
            setUsers(r.users);
            setTotal(r.total);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // intentionally only on mount; "Search" button triggers reload
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onGrantPro = async (email: string) => {
        try {
            await adminService.grantPro({ user_email: email, days: 30 });
            await load();
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Grant failed');
        }
    };

    const onRevokePro = async (email: string) => {
        try {
            await adminService.revokePro({ user_email: email });
            await load();
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Revoke failed');
        }
    };

    return (
        <Card>
            <div className="p-4">
                <div className="flex items-center space-x-2 mb-4">
                    <input
                        type="search"
                        placeholder="Search by email or name"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                        className="flex-1 px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-700"
                    />
                    <Button onClick={load}>Search</Button>
                </div>
                {error && <div className="text-red-600 mb-3">{error}</div>}
                {loading ? (
                    <Loader text="Loading users..." />
                ) : (
                    <>
                        <div className="text-sm text-slate-500 mb-2">Showing {users.length} of {total}</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-slate-500 dark:text-slate-400">
                                    <tr>
                                        <th className="py-2">Email</th>
                                        <th className="py-2">Name</th>
                                        <th className="py-2">Role</th>
                                        <th className="py-2">Plan</th>
                                        <th className="py-2">Joined</th>
                                        <th className="py-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="border-t border-slate-200 dark:border-slate-700">
                                            <td className="py-2 font-mono text-xs">{u.email}</td>
                                            <td className="py-2">{u.name || '—'}</td>
                                            <td className="py-2">{u.role}</td>
                                            <td className="py-2">
                                                {u.subscription_plan === 'pro' ? (
                                                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">
                                                        PRO
                                                    </span>
                                                ) : (
                                                    'Free'
                                                )}
                                            </td>
                                            <td className="py-2 text-xs">{u.date_joined.slice(0, 10)}</td>
                                            <td className="py-2">
                                                {u.subscription_plan === 'pro' ? (
                                                    <button
                                                        onClick={() => onRevokePro(u.email)}
                                                        className="text-xs text-red-600 hover:underline"
                                                    >
                                                        Revoke Pro
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => onGrantPro(u.email)}
                                                        className="text-xs text-blue-600 hover:underline"
                                                    >
                                                        Grant Pro (30d)
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </Card>
    );
};

// -- Sitemap tab -- //

const SitemapTab: React.FC = () => {
    const [data, setData] = useState<SitemapResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        adminService
            .getSitemap()
            .then(setData)
            .catch((e: unknown) => {
                if (e instanceof ApiError) setError(e.message);
                else setError('Failed to load sitemap');
            });
    }, []);

    const flatCount = useMemo(() => {
        if (!data) return 0;
        const walk = (nodes: SitemapNode[]): number =>
            nodes.reduce((acc, n) => acc + 1 + walk(n.children || []), 0);
        return walk(data.sections);
    }, [data]);

    if (error) return <Card><div className="p-6 text-red-600">{error}</div></Card>;
    if (!data) return <Loader text="Loading sitemap..." />;

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-4">
                    <h2 className="text-xl font-bold mb-1">Platform Sitemap</h2>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        {flatCount} sections · viewing as {data.viewer.role}
                    </div>
                </div>
            </Card>
            <Card>
                <div className="p-4">
                    <SitemapTree nodes={data.sections} depth={0} />
                </div>
            </Card>
        </div>
    );
};

const SitemapTree: React.FC<{ nodes: SitemapNode[]; depth: number }> = ({ nodes, depth }) => (
    <ul className={depth === 0 ? 'space-y-3' : 'mt-2 ml-6 space-y-2 border-l border-slate-200 dark:border-slate-700 pl-4'}>
        {nodes.map((node) => (
            <li key={node.id}>
                <div className="flex items-baseline space-x-2">
                    <span className="font-semibold">{node.title}</span>
                    <code className="text-xs text-slate-500 dark:text-slate-400">{node.path}</code>
                    {node.admin_only && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ADMIN
                        </span>
                    )}
                </div>
                {node.description && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">{node.description}</div>
                )}
                {node.api_endpoints && node.api_endpoints.length > 0 && (
                    <details className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <summary className="cursor-pointer">API ({node.api_endpoints.length})</summary>
                        <ul className="ml-4 mt-1 space-y-0.5">
                            {node.api_endpoints.map((ep) => (
                                <li key={ep}><code>{ep}</code></li>
                            ))}
                        </ul>
                    </details>
                )}
                {node.children && node.children.length > 0 && (
                    <SitemapTree nodes={node.children} depth={depth + 1} />
                )}
            </li>
        ))}
    </ul>
);

export default AdminPanel;
