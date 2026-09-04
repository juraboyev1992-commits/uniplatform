import React, { useMemo, useState } from 'react';
import {
    Shield, Plus, AlertTriangle, CheckCircle2, Sparkles, Trophy, ChevronLeft, Users, UserMinus,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import StatStrip from '../common/StatStrip';
import { getSportStats } from '../../utils/moduleStats';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { INDEX_CRITERIA } from '../../config/socialActivityIndex';

// TERMA JAMOALAR — sport yo'nalishidagi klub rahbarining ish maydoni (10-mezon).
//
// Nomzod TO'RT yo'l bilan keladi: tyutor tavsiyasi, talabaning o'z arizasi,
// tizimning taklifi va rahbarning o'zi qo'shgani. Birinchi uchtasi shu yerda
// ko'rib chiqiladi; to'rtinchisida ko'rib chiqadigan odamning o'zi qo'shgani
// uchun ikkinchi bosqich ortiqcha.
//
// Rahbar ISMNI emas, DALILNI ko'radi: sport musobaqalaridagi natijalari,
// sport klubidagi davomati, avvalgi terma jamoa a'zoliklari.
const SOURCE_LABELS = {
    tutor: 'Tyutor tavsiyasi',
    self: 'Talabaning arizasi',
    system: 'Tizim taklifi',
    head: "Rahbar qo'shgan",
};

const SportTeamsPanel = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [openId, setOpenId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [profileOf, setProfileOf] = useState(null);

    const teams = useMemo(() => db.getSportTeams(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => getSportStats(db), [version]);
    const open = teams.find(t => t.id === openId) || null;
    const students = useMemo(() => new Map(db.getMockStudents().map(s => [s.id, s])), []);

    const nominations = useMemo(
        () => (open ? db.getSportNominations({ teamId: open.id }) : []),
        [open, version]
    );
    const pending = nominations.filter(n => n.status === 'pending');
    const members = nominations.filter(n => n.status === 'approved');
    // Chiqarilganlar ro'yxatda ko'rinadi, lekin TARKIB soniga kirmaydi.
    const activeMembers = members.filter(n => !n.endedAt);

    const suggestions = useMemo(
        () => (open ? db.getSuggestedSportCandidates(open.id) : []),
        [open, version]
    );

    const profile = useMemo(
        () => (profileOf ? db.getSportCandidateProfile(profileOf) : null),
        [profileOf, version]
    );

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const [form, setForm] = useState({ name: '', sport: '', maxSize: '' });

    const [minPercentDraft, setMinPercentDraft] = useState(null);
    const savedMinPercent = useMemo(() => db.getSportSectionMinPercent(), [version]);
    const minPercent = minPercentDraft ?? savedMinPercent;

    return (
        <div className="space-y-4">
            {!db.isSportBackendReady() && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="shrink-0 mt-px" />
                    Jadvallar topilmadi. Supabase SQL Editor da{' '}
                    <code className="font-mono">supabase/sport_teams.sql</code> ni ishga tushiring.
                </p>
            )}
            {error && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="shrink-0 mt-px" /> {error}
                </p>
            )}
            {message && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                    <CheckCircle2 size={14} /> {message}
                </p>
            )}

            {!open ? (
                <>
                    <Card>
                        <div className="p-5 flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <Shield size={17} className="text-cyan-600" /> Terma jamoalar
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    10-mezon · terma jamoa a'zoligi eng yuqori daraja (5 ball)
                                </p>
                            </div>
                            <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowForm(true)}>
                                Jamoa yaratish
                            </Button>
                        </div>

                        {/* Umumiy holat - jamoalar ro'yxatidan oldin. Bo'sh
                            jamoa va javob kutayotgan nomzod ikkalasi ham
                            bajarilmagan ish, shuning uchun ogohlantirishda. */}
                        {teams.length > 0 && (
                            <div className="px-5 pb-5">
                                <StatStrip
                                    items={[
                                        { label: 'Jamoalar', value: stats.teams, tone: 'cyan', hint: `${stats.activeTeams} ta faol` },
                                        { label: "A'zolar", value: stats.members, tone: 'indigo', hint: `${stats.students} nafar talaba` },
                                        { label: "Tarkibi to'lgan", value: stats.fullTeams, tone: 'emerald' },
                                        { label: 'Nomzod navbati', value: stats.pending, tone: stats.pending > 0 ? 'amber' : 'gray' },
                                    ]}
                                    warnings={[
                                        stats.emptyTeams > 0 && `${stats.emptyTeams} ta jamoada tarkib yo'q`,
                                        stats.pending > 0 && `${stats.pending} ta nomzod javob kutmoqda`,
                                    ]}
                                />
                            </div>
                        )}
                    </Card>

                    {/* "MUNTAZAM SHUG'ULLANISH" CHEGARASI.
                        Metodikada bu so'z bor, foiz yo'q - shuning uchun
                        qiymat sozlamada turadi va universitet qarori deb
                        ochiq belgilanadi. */}
                    <Card>
                        <div className="p-5 space-y-2">
                            <h4 className="font-bold text-sm text-gray-700">
                                Sport seksiyasida «muntazam shug'ullanish» chegarasi
                            </h4>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-600">
                                    Klub tadbirlarining kamida
                                </span>
                                <input
                                    type="number" min={1} max={100}
                                    value={minPercent}
                                    onChange={e => setMinPercentDraft(e.target.value)}
                                    className="w-20 px-2 py-1.5 border border-gray-200 rounded-xl text-sm text-center"
                                />
                                <span className="text-xs text-gray-600">
                                    foiziga qatnashgan talaba muntazam hisoblanadi ({INDEX_CRITERIA.SPORTS.parts.find(p => p.key === 'section')?.points} ball)
                                </span>
                                {minPercentDraft !== null && (
                                    <Button
                                        variant="primary" size="sm" disabled={busy}
                                        onClick={() => run(async () => {
                                            await db.setSportSectionMinPercent(minPercent);
                                            setMinPercentDraft(null);
                                        }, 'Chegara saqlandi.')}
                                    >
                                        Saqlash
                                    </Button>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-400">
                                Metodikada «muntazam shug'ullanish» deyilgan, foiz ko'rsatilmagan —
                                miqdorni universitet belgilaydi.
                            </p>
                        </div>
                    </Card>

                    {teams.length === 0 ? (
                        <Card>
                            <p className="p-10 text-center text-sm text-gray-400">
                                Bu o'quv yili uchun terma jamoa yaratilmagan.
                            </p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {teams.map(t => {
                                const noms = db.getSportNominations({ teamId: t.id });
                                const ok = noms.filter(n => n.status === 'approved' && !n.endedAt).length;
                                const wait = noms.filter(n => n.status === 'pending').length;
                                return (
                                    <Card key={t.id}>
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h4 className="font-bold text-gray-900">{t.name}</h4>
                                                    {t.sport && <p className="text-xs text-gray-500 mt-0.5">{t.sport}</p>}
                                                </div>
                                                {wait > 0 && <Badge variant="warning" size="sm">{wait} nomzod</Badge>}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">
                                                Tarkib: <b>{ok}</b>{t.maxSize ? ` / ${t.maxSize}` : ''} ta a'zo
                                            </p>
                                            <Button
                                                variant="outline" size="sm" icon={Users}
                                                className="mt-3"
                                                onClick={() => setOpenId(t.id)}
                                            >
                                                Ochish
                                            </Button>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                <>
                    <Card>
                        <div className="p-5">
                            <button
                                type="button"
                                onClick={() => setOpenId(null)}
                                className="text-xs font-bold text-indigo-600 flex items-center gap-1 mb-3"
                            >
                                <ChevronLeft size={14} /> Jamoalarga
                            </button>
                            <h3 className="font-bold text-gray-900">{open.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                {open.sport ? `${open.sport} · ` : ''}{open.academicYear}
                                {' · '}
                                {activeMembers.length}{open.maxSize ? ` / ${open.maxSize}` : ''} ta a'zo
                            </p>
                        </div>
                    </Card>

                    {/* NOMZODLAR — tyutor, talaba yoki tizimdan kelganlar. */}
                    <Card>
                        <div className="p-5 space-y-3">
                            <h4 className="font-bold text-sm text-gray-700">
                                Ko'rib chiqilmagan nomzodlar ({pending.length})
                            </h4>
                            {pending.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Yangi nomzod yo'q.</p>
                            ) : pending.map(n => (
                                <div key={n.id} className="border border-amber-200 bg-amber-50/40 rounded-xl p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900">
                                                {students.get(n.studentId)?.fullName || n.studentId}
                                            </p>
                                            <p className="text-[11px] text-gray-500">
                                                {SOURCE_LABELS[n.source] || n.source}
                                                {n.nominatedBy ? ` · ${n.nominatedBy}` : ''}
                                            </p>
                                            {n.motivation && (
                                                <p className="text-[11px] text-gray-600 mt-1 italic">{n.motivation}</p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setProfileOf(n.studentId)}
                                            className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-700 hover:border-gray-300"
                                        >
                                            Sport manzarasi
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button" disabled={busy}
                                            onClick={() => run(() => db.reviewSportNomination({
                                                nominationId: n.id, action: 'approve', reviewedBy: user?.username,
                                            }), 'Tarkibga qabul qilindi.')}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100"
                                        >
                                            Qabul qilish
                                        </button>
                                        <button
                                            type="button" disabled={busy}
                                            onClick={() => {
                                                const comment = window.prompt('Rad etish sababi:');
                                                if (!comment) return;
                                                run(() => db.reviewSportNomination({
                                                    nominationId: n.id, action: 'reject',
                                                    comment, reviewedBy: user?.username,
                                                }), 'Rad etildi.');
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold hover:bg-rose-100"
                                        >
                                            Rad etish
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* TIZIMNING TAKLIFI — 550 talaba orasidan qidirmaslik uchun. */}
                    <Card>
                        <div className="p-5 space-y-3">
                            <div>
                                <h4 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-violet-500" /> Tizim taklif qiladi
                                </h4>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Sport musobaqalarida natijasi bor yoki sport klubida davomati bor talabalar
                                </p>
                            </div>
                            {suggestions.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Taklif qiladigan nomzod topilmadi.</p>
                            ) : (
                                <div className="space-y-1">
                                    {suggestions.map(({ student, attended, results }) => (
                                        <div key={student.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-gray-800 truncate">{student.fullName}</p>
                                                <p className="text-[11px] text-gray-400">
                                                    {results > 0 && (
                                                        <span className="text-amber-600 font-semibold">
                                                            {results} ta sovrinli o'rin ·{' '}
                                                        </span>
                                                    )}
                                                    {attended} ta sport tadbiri
                                                </p>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setProfileOf(student.id)}
                                                    className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-600"
                                                >
                                                    Batafsil
                                                </button>
                                                <button
                                                    type="button" disabled={busy}
                                                    onClick={() => run(() => db.nominateToSportTeam({
                                                        teamId: open.id, studentId: student.id,
                                                        source: 'head', nominatedBy: user?.username,
                                                    }), "Tarkibga qo'shildi.")}
                                                    className="px-2 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-[11px] font-bold hover:bg-cyan-100"
                                                >
                                                    Qo'shish
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* TARKIB */}
                    <Card>
                        <div className="p-5 space-y-2">
                            <h4 className="font-bold text-sm text-gray-700">
                                Tarkib ({activeMembers.length})
                            </h4>
                            {members.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Tarkib hali shakllanmagan.</p>
                            ) : members.map(n => (
                                <div key={n.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-800 truncate">
                                            {students.get(n.studentId)?.fullName || n.studentId}
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            {SOURCE_LABELS[n.source]} · {new Date(n.reviewedAt || n.createdAt).toLocaleDateString('uz-UZ')}
                                        </p>
                                        {n.endedAt && (
                                            <p className="text-[11px] text-rose-600 mt-0.5">
                                                Chiqarilgan: {n.endReason}
                                                {n.endedBy ? ` · ${n.endedBy}` : ''}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Badge variant={n.endedAt ? 'default' : 'success'} size="sm">
                                            {n.endedAt ? 'Chiqarilgan' : '5 ball'}
                                        </Badge>
                                        {/* Tarkibdan chiqarish. Yozuv O'CHIRILMAYDI -
                                            tarix qoladi va kim chiqargani ko'rinadi. */}
                                        {!n.endedAt && (
                                            <button
                                                type="button" disabled={busy}
                                                onClick={() => {
                                                    const reason = window.prompt('Chiqarish sababi:');
                                                    if (!reason) return;
                                                    run(() => db.removeFromSportTeam({
                                                        nominationId: n.id, reason, by: user?.username,
                                                    }), 'Tarkibdan chiqarildi.');
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg"
                                                title="Tarkibdan chiqarish"
                                            >
                                                <UserMinus size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            )}

            {/* NOMZODNING SPORT MANZARASI */}
            <Modal isOpen={!!profileOf} onClose={() => setProfileOf(null)} title="Nomzodning sport manzarasi">
                {profile && (
                    <div className="space-y-4">
                        <p className="text-sm font-bold text-gray-900">
                            {students.get(profileOf)?.fullName || profileOf}
                        </p>

                        <div>
                            <p className="text-[11px] font-bold uppercase text-gray-400 mb-1.5">
                                Sport musobaqalaridagi natijalar
                            </p>
                            {profile.results.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Tizimda natija qayd etilmagan.</p>
                            ) : profile.results.map((r, i) => (
                                <p key={i} className="text-xs text-gray-700 flex items-center gap-1.5">
                                    <Trophy size={11} className="text-amber-500" />
                                    {r.title} — {r.place}-o'rin
                                </p>
                            ))}
                        </div>

                        <div>
                            <p className="text-[11px] font-bold uppercase text-gray-400 mb-1.5">
                                Sport klublaridagi davomat
                            </p>
                            {profile.sportClubs.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Sport klubida qatnashuvi yo'q.</p>
                            ) : profile.sportClubs.map(c => (
                                <p key={c.clubId} className="text-xs text-gray-700">
                                    {c.clubName} — {c.held} tadbirdan {c.attended} tasi ({c.percent}%)
                                </p>
                            ))}
                        </div>

                        <div>
                            <p className="text-[11px] font-bold uppercase text-gray-400 mb-1.5">
                                Avvalgi terma jamoa a'zoliklari
                            </p>
                            {profile.history.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Avval a'zo bo'lmagan.</p>
                            ) : profile.history.map((h, i) => (
                                <p key={i} className="text-xs text-gray-700">
                                    {h.team}{h.sport ? ` (${h.sport})` : ''} — {h.academicYear}
                                </p>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>

            {/* JAMOA YARATISH */}
            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Terma jamoa yaratish">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Nomi *</label>
                            <input
                                type="text" value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Masalan: Universitet terma jamoasi"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Sport turi</label>
                            <input
                                type="text" value={form.sport}
                                onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                                placeholder="Voleybol, futbol, kurash..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                            Tarkib soni (ixtiyoriy)
                        </label>
                        <input
                            type="number" min={1} value={form.maxSize}
                            onChange={e => setForm(f => ({ ...f, maxSize: e.target.value }))}
                            placeholder="Cheklovsiz"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    {/* Mavsum - a'zolik jimgina keyingi yilga o'tmasligi uchun. */}
                    <p className="text-[11px] text-gray-400">
                        Jamoa joriy o'quv yiliga yaratiladi. Keyingi yil tarkib qaytadan
                        shakllantiriladi — o'tgan yilgi a'zolik ball bermaydi.
                    </p>

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                            Bekor qilish
                        </Button>
                        <Button
                            variant="primary" className="flex-1"
                            disabled={busy || !form.name.trim()}
                            onClick={() => run(async () => {
                                await db.saveSportTeam({ ...form, by: user?.username });
                                setShowForm(false);
                                setForm({ name: '', sport: '', maxSize: '' });
                            }, 'Jamoa yaratildi.')}
                        >
                            Yaratish
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default SportTeamsPanel;
