import React, { useMemo, useState } from 'react';
import { UserPlus, KeyRound, Search, ShieldCheck, Briefcase, UserCheck, GraduationCap } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// O'z-o'zidan ro'yxatdan o'tish yopilgan - akkauntni faqat admin yaratadi va
// rolni o'zi belgilaydi. Barcha amallar `security definer` RPC orqali bajariladi
// (supabase/admin_user_management.sql), ular ichida is_platform_admin() tekshiriladi.
const ROLES = [
    { id: 'TALABA', label: 'Talaba', icon: GraduationCap, variant: 'default' },
    { id: 'TYUTOR', label: 'Tyutor', icon: UserCheck, variant: 'warning' },
    { id: 'RAHBARIYAT', label: 'Rahbariyat', icon: Briefcase, variant: 'info' },
    { id: 'ADMINISTRATOR', label: 'Administrator', icon: ShieldCheck, variant: 'danger' },
];
const roleMeta = (id) => ROLES.find(r => r.id === id) || ROLES[0];

// Tasodifiy, aytishga qulay parol - admin uni foydalanuvchiga beradi.
const suggestPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
};

const UserAccountsPanel = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const bump = () => setVersion(v => v + 1);

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState(null); // { username, password } - yaratilgandan keyin ko'rsatiladi

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [form, setForm] = useState({ username: '', fullName: '', password: suggestPassword(), role: 'TALABA' });

    const [pwdTarget, setPwdTarget] = useState(null);
    const [newPassword, setNewPassword] = useState('');

    const accounts = useMemo(() => db.getAllUserAccounts(), [version]);
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return accounts.filter(a =>
            (!q || String(a.username || '').toLowerCase().includes(q) || String(a.fullName || '').toLowerCase().includes(q))
            && (!roleFilter || a.role === roleFilter)
        );
    }, [accounts, search, roleFilter]);

    const counts = useMemo(() => {
        const map = {};
        accounts.forEach(a => { map[a.role] = (map[a.role] || 0) + 1; });
        return map;
    }, [accounts]);

    const handleCreate = async () => {
        setError(''); setBusy(true);
        try {
            await db.adminCreateUser({
                username: form.username.trim().toLowerCase(),
                password: form.password,
                fullName: form.fullName.trim(),
                role: form.role,
            });
            setNotice({ username: form.username.trim().toLowerCase(), password: form.password });
            setIsCreateOpen(false);
            setForm({ username: '', fullName: '', password: suggestPassword(), role: 'TALABA' });
            bump();
        } catch (e) { setError(e.message || 'Xatolik yuz berdi'); } finally { setBusy(false); }
    };

    const handleRoleChange = async (account, role) => {
        setError(''); setBusy(true);
        try { await db.adminSetUserRole(account.id, role); bump(); }
        catch (e) { setError(e.message || 'Xatolik yuz berdi'); } finally { setBusy(false); }
    };

    const handleResetPassword = async () => {
        setError(''); setBusy(true);
        try {
            await db.adminResetUserPassword(pwdTarget.id, newPassword);
            setNotice({ username: pwdTarget.username, password: newPassword });
            setPwdTarget(null); setNewPassword('');
        } catch (e) { setError(e.message || 'Xatolik yuz berdi'); } finally { setBusy(false); }
    };

    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Foydalanuvchi akkauntlari</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        O'z-o'zidan ro'yxatdan o'tish yopilgan — akkauntni siz yaratasiz va rolni o'zingiz belgilaysiz.
                    </p>
                </div>
                <Button variant="primary" icon={UserPlus} onClick={() => { setIsCreateOpen(true); setError(''); }}>
                    Yangi akkaunt
                </Button>
            </div>

            {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

            {notice && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="text-sm font-bold text-emerald-800 mb-1">Akkaunt tayyor — ma'lumotni foydalanuvchiga bering</p>
                    <p className="text-sm text-emerald-900 font-mono">Login: {notice.username}</p>
                    <p className="text-sm text-emerald-900 font-mono">Parol: {notice.password}</p>
                    <p className="text-xs text-emerald-700 mt-2">
                        Bu parol boshqa ko'rsatilmaydi — hozir nusxalab oling. Kerak bo'lsa keyin qayta belgilaysiz.
                    </p>
                    <button type="button" onClick={() => setNotice(null)} className="mt-2 text-xs font-bold text-emerald-700 hover:text-emerald-900">
                        Yopish
                    </button>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Login yoki F.I.Sh. bo'yicha qidirish..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                </div>
                <button type="button" onClick={() => setRoleFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${!roleFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                    Hammasi ({accounts.length})
                </button>
                {ROLES.map(r => (
                    <button key={r.id} type="button" onClick={() => setRoleFilter(f => f === r.id ? '' : r.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${roleFilter === r.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                        {r.label} ({counts[r.id] || 0})
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-gray-400 uppercase">
                        <tr>
                            <th className="p-3">Login</th>
                            <th className="p-3">F.I.Sh.</th>
                            <th className="p-3 w-52">Rol</th>
                            <th className="p-3 w-32">Parol</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rows.length === 0 ? (
                            <tr><td colSpan={4} className="p-10 text-center text-gray-400">Akkaunt topilmadi.</td></tr>
                        ) : rows.map(a => {
                            const isSelf = a.username === user?.username;
                            return (
                                <tr key={a.id} className="hover:bg-slate-50/70">
                                    <td className="p-3 font-mono text-[11px] text-gray-700">
                                        {a.username}
                                        {isSelf && <span className="ml-1.5 text-[10px] text-indigo-600 font-bold">(siz)</span>}
                                    </td>
                                    <td className="p-3 font-semibold text-gray-800">{a.fullName || '—'}</td>
                                    <td className="p-3">
                                        {isSelf ? (
                                            <Badge variant={roleMeta(a.role).variant} size="sm">{roleMeta(a.role).label}</Badge>
                                        ) : (
                                            <select
                                                value={a.role} disabled={busy}
                                                onChange={e => handleRoleChange(a, e.target.value)}
                                                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                                            >
                                                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                            </select>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <button
                                            type="button" disabled={busy}
                                            onClick={() => { setPwdTarget(a); setNewPassword(suggestPassword()); setError(''); }}
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                                        >
                                            <KeyRound size={12} /> Almashtirish
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Yangi akkaunt */}
            <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Yangi akkaunt yaratish" size="sm">
                <div className="space-y-4">
                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</p>}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Login</label>
                        <input
                            type="text" value={form.username}
                            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                            placeholder="masalan: aliyev.sardor"
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Faqat lotin harflari, raqam va . _ - belgilari</p>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">F.I.Sh.</label>
                        <input
                            type="text" value={form.fullName}
                            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Parol</label>
                        <div className="flex gap-2 mt-1">
                            <input
                                type="text" value={form.password}
                                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                            />
                            <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, password: suggestPassword() }))}>
                                Yangilash
                            </Button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Rol</label>
                        <select
                            value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                    </div>
                    <Button variant="primary" className="w-full" disabled={busy} onClick={handleCreate}>
                        {busy ? 'Yaratilmoqda...' : 'Yaratish'}
                    </Button>
                </div>
            </Modal>

            {/* Parolni almashtirish */}
            <Modal isOpen={!!pwdTarget} onClose={() => setPwdTarget(null)} title="Parolni almashtirish" size="sm">
                {pwdTarget && (
                    <div className="space-y-4">
                        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</p>}
                        <p className="text-sm text-gray-600">
                            <span className="font-mono font-bold">{pwdTarget.username}</span> uchun yangi parol:
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                            />
                            <Button variant="outline" size="sm" onClick={() => setNewPassword(suggestPassword())}>Yangilash</Button>
                        </div>
                        <Button variant="primary" className="w-full" disabled={busy} onClick={handleResetPassword}>
                            {busy ? 'Saqlanmoqda...' : 'Parolni saqlash'}
                        </Button>
                    </div>
                )}
            </Modal>
        </Card>
    );
};

export default UserAccountsPanel;
