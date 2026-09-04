import React, { useState } from 'react';
import { Award, Plus, ShieldCheck, FileText, ExternalLink, AlertTriangle, Users, User } from 'lucide-react';
import Badge from '../common/Badge';
import Pagination from '../common/Pagination';
import ClubAchievementForm from './ClubAchievementForm';
import { db } from '../../services/db';
import {
    ACHIEVEMENT_SCOPES, ACHIEVEMENT_STATUS, placeIcon, placeLabel, levelLabel,
} from '../../config/clubAchievements';

const PAGE_SIZE_OPTIONS = [12, 24, 48, 'all'];

// KLUB YUTUQLARI.
//
// Bu ro'yxat ilgari TO'QIB CHIQARILGAN ma'lumot ko'rsatardi. Endi ikkita
// haqiqiy manbadan keladi va har yozuvda manbasi OCHIQ yozilgan:
//
//   "Platformadagi hujjat" - musobaqa yakunlangan, bayonnoma tasdiqlangan,
//      diplom berilgan. Yutuq o'sha diplomdan tug'ilgan va uning ro'yxatga
//      olish raqami ko'rsatiladi - ya'ni har kim tekshirib ko'ra oladi.
//   "Tashqi yutuq" - universitetdan tashqarida qozonilgan, koordinator
//      kiritgan, dalil biriktirilgan, administrator tasdiqlagan.
//
// Manbani yashirish yaramaydi: ikkalasining ishonchlilik darajasi boshqa.
const SCOPE_ICONS = { club: Award, team: Users, member: User };

const ClubAchievementsTab = ({ club, items = [], canManage = false, isAdmin = false, onChanged }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
    const [showForm, setShowForm] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');

    const openEvidence = async (row) => {
        const url = await db.getClubAchievementEvidenceUrl(row.evidencePath);
        if (url) window.open(url, '_blank', 'noopener');
        else setError("Hujjatni ochib bo'lmadi — havola muddati tugagan bo'lishi mumkin.");
    };

    const review = async (row, action) => {
        setError('');
        let comment = '';
        if (action !== 'approve') {
            comment = window.prompt(
                action === 'return'
                    ? "Nimani to'ldirish kerak?"
                    : 'Rad etish sababi:'
            ) || '';
            if (!comment.trim()) return;
        }
        setBusyId(row.id);
        try {
            await db.reviewClubAchievement({
                achievementId: row.id, action, comment,
                reviewedBy: 'admin',
            });
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (row) => {
        if (!window.confirm(`"${row.title}" yutug'i o'chirilsinmi? Dalil hujjati ham o'chadi.`)) return;
        setBusyId(row.id);
        try {
            await db.deleteClubAchievement(row.id);
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusyId(null);
        }
    };

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const visible = pageSize === 'all' ? items : items.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl leading-relaxed">
                    Klubning va uning tarkibidagilarning yutuqlari. Platformada o'tkazilgan
                    musobaqalar bo'yicha yutuqlar <b>berilgan diplomdan avtomatik</b> chiqadi;
                    universitetdan tashqarida qozonilgani esa dalil bilan kiritiladi va
                    tasdiqlanadi.
                </p>
                {canManage && (
                    <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shrink-0"
                    >
                        <Plus size={14} /> Tashqi yutuq qo'shish
                    </button>
                )}
            </div>

            {error && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                </p>
            )}

            {items.length === 0 ? (
                <div className="text-center py-10 text-sm text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                    <p>Hozircha yutuqlar qayd etilmagan</p>
                    <p className="text-xs mt-1.5 max-w-md mx-auto">
                        Klub musobaqada sovrin olib, diplom berilganda yutuq shu yerda
                        o'zi paydo bo'ladi.
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {visible.map(item => {
                            const ScopeIcon = SCOPE_ICONS[item.scope] || Award;
                            const isInternal = item.source === 'internal';
                            const statusMeta = ACHIEVEMENT_STATUS[item.status];
                            return (
                                <div
                                    key={item.id}
                                    className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm p-4 space-y-2 ${
                                        item.status === 'approved'
                                            ? 'border-gray-100 dark:border-gray-700'
                                            : 'border-amber-200 dark:border-amber-900/40'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-2xl shrink-0" title={placeLabel(item.place)}>
                                            {placeIcon(item.place)}
                                        </span>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                {placeLabel(item.place)}
                                            </span>
                                            <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">
                                                {levelLabel(item.level)}
                                            </span>
                                        </div>
                                    </div>

                                    <p className="font-bold text-gray-900 dark:text-gray-100 leading-snug">{item.title}</p>

                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                        <ScopeIcon size={12} className="shrink-0" />
                                        {item.scope === 'team'
                                            ? (item.teamName || 'Jamoa')
                                            : item.scope === 'member'
                                                ? (item.studentNames || []).join(', ') || "Klub a'zosi"
                                                : ACHIEVEMENT_SCOPES.club.label}
                                    </p>

                                    <p className="text-xs text-gray-400">
                                        {item.date ? new Date(item.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
                                        {item.organizer ? ` · ${item.organizer}` : ''}
                                    </p>

                                    {/* MANBA - ishonchlilik darajasi shu yerda ko'rinadi. */}
                                    <div className="pt-1.5 border-t border-gray-50 dark:border-gray-700 space-y-1.5">
                                        {isInternal ? (
                                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                                <ShieldCheck size={12} className="shrink-0" />
                                                Rasmiy hujjat
                                                {item.registrationNumber && (
                                                    <span className="font-mono text-gray-400">{item.registrationNumber}</span>
                                                )}
                                            </p>
                                        ) : (
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
                                                    <FileText size={12} className="shrink-0" /> Tashqi yutuq
                                                </span>
                                                {statusMeta && item.status !== 'approved' && (
                                                    <Badge variant={statusMeta.tone} size="sm">{statusMeta.label}</Badge>
                                                )}
                                            </div>
                                        )}

                                        {!isInternal && canManage && item.evidencePath && (
                                            <button
                                                type="button"
                                                onClick={() => openEvidence(item)}
                                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                            >
                                                Dalilni ochish <ExternalLink size={10} />
                                            </button>
                                        )}

                                        {!isInternal && item.comment && item.status !== 'approved' && (
                                            <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-1.5">
                                                {item.comment}
                                            </p>
                                        )}

                                        {/* Tasdiqlash - faqat administrator. Koordinator o'z
                                            yozuvini o'zi tasdiqlay olmaydi. */}
                                        {!isInternal && isAdmin && item.status === 'pending' && (
                                            <div className="flex gap-1.5 pt-1">
                                                <button
                                                    type="button" disabled={busyId === item.id}
                                                    onClick={() => review(item, 'approve')}
                                                    className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 disabled:opacity-50"
                                                >
                                                    Tasdiqlash
                                                </button>
                                                <button
                                                    type="button" disabled={busyId === item.id}
                                                    onClick={() => review(item, 'return')}
                                                    className="px-2 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold hover:bg-amber-200 disabled:opacity-50"
                                                >
                                                    Qaytarish
                                                </button>
                                                <button
                                                    type="button" disabled={busyId === item.id}
                                                    onClick={() => review(item, 'reject')}
                                                    className="px-2 py-1.5 rounded-lg bg-red-100 text-red-700 text-[11px] font-bold hover:bg-red-200 disabled:opacity-50"
                                                >
                                                    Rad etish
                                                </button>
                                            </div>
                                        )}

                                        {!isInternal && canManage && item.status !== 'approved' && (
                                            <button
                                                type="button" disabled={busyId === item.id}
                                                onClick={() => remove(item)}
                                                className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50"
                                            >
                                                O'chirish
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        pageSize={pageSize}
                        onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                        totalItems={items.length}
                    />
                </>
            )}

            {showForm && (
                <ClubAchievementForm
                    club={club}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); onChanged?.(); }}
                />
            )}
        </div>
    );
};

export default ClubAchievementsTab;
