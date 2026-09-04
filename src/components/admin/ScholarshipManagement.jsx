import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Award, Plus, Edit, Trash2, CheckCircle, XCircle, Banknote, Filter, Search, Clock,
    FileText, Eye, TrendingUp, Download, AlertTriangle, ShieldCheck, Sparkles,
    ChevronRight, Archive, Loader2, Info, Scale, Layers, Building2, ArrowUpRight, UserPlus, Lock,
    ChevronUp, ChevronDown, Trophy, FileCheck, ClipboardList, MessageSquare, Users, Target
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    GRANT_STATUS, GRANT_STATUS_ORDER, GRANT_TYPES, GRANT_SCOPES,
    APPLICATION_STATUS, APPLICATION_FLOW, getApplicationStatusMeta, normalizeApplicationStatus,
    CRITERIA_CATALOG, CRITERIA_OPS, getCriterion, DEFAULT_SCORING_WEIGHTS,
    parseAmount, formatAmount,
    ADVANCE_METHODS, ADVANCE_MODES,
    TIEBREAK_OPTIONS, DEFAULT_TIEBREAK, DEFAULT_MIXED_WEIGHT, DEFAULT_EVALUATION_CRITERIA,
    STAGE_TYPES, STAGE_TYPE_ORDER, getStageType, defaultStageConfig, PIPELINE_TEMPLATES,
    resolvePipeline, stageQuota,
} from '../../config/scholarships';
import { getFacultyEvaluators } from '../../utils/scholarshipStages';
import {
    OPPORTUNITY_GROUPS, OPPORTUNITY_GROUP_ORDER, OPPORTUNITY_KINDS, OPPORTUNITY_KIND_ORDER,
    CONSTRAINT_TYPES, defaultConstraints,
} from '../../config/opportunities';
import { recomputeAllMatches } from '../../utils/opportunityMatching';
import {
    buildStudentEligibilityProfile, evaluateEligibility, computeApplicationScore,
    computeGrantUsage, getGrantOpenState,
} from '../../utils/scholarshipEligibility';
import { getDocumentTypeLabel } from '../../config/documents';

// ---------------------------------------------------------------------------
// CHEKLOVLAR MUHARRIRI
//
// Imkoniyatlar o'rtasidagi cheklovlar. Eng muhimi - "zid keladi": u IKKI
// TOMONLAMA ishlaydi, ya'ni bu yerda bir marta kiritilsa, ikkinchi grantda
// ham hisobga olinadi. Aks holda bir tomonini kiritib ikkinchisini unutib
// qo'yish mumkin va cheklov yarim ishlardi.
// ---------------------------------------------------------------------------
const ConstraintsEditor = ({ value, onChange, grants }) => {
    const c = value || defaultConstraints();
    const set = (patch) => onChange({ ...c, ...patch });

    const toggleId = (field, id) => set({
        [field]: (c[field] || []).includes(id)
            ? c[field].filter(x => x !== id)
            : [...(c[field] || []), id],
    });

    return (
        <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Cheklovlar</p>

            {/* Zid keladi */}
            <div className="bg-white border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-bold text-gray-900">{CONSTRAINT_TYPES.conflictsWith.label}</p>
                <p className="text-[11px] text-gray-500 mb-2">
                    {CONSTRAINT_TYPES.conflictsWith.hint}. Ikki tomonlama — bir marta kiritish yetarli.
                </p>

                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Guruh bo'yicha</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {OPPORTUNITY_GROUP_ORDER.map(g => {
                        const on = (c.conflictsWithGroups || []).includes(g);
                        return (
                            <button key={g} type="button" onClick={() => toggleId('conflictsWithGroups', g)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${on
                                    ? 'bg-red-50 border-red-300 text-red-700'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-red-200'}`}>
                                {OPPORTUNITY_GROUPS[g].label}
                            </button>
                        );
                    })}
                </div>

                {grants.length > 0 && (
                    <>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Aniq imkoniyat</p>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                            {grants.map(g => {
                                const on = (c.conflictsWith || []).includes(g.id);
                                return (
                                    <button key={g.id} type="button" onClick={() => toggleId('conflictsWith', g.id)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors max-w-[220px] truncate ${on
                                            ? 'bg-red-50 border-red-300 text-red-700'
                                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-red-200'}`}>
                                        {g.title}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Qolgan cheklovlar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-gray-900">{CONSTRAINT_TYPES.exclusiveGroup.label}</p>
                    <p className="text-[11px] text-gray-500 mb-2">{CONSTRAINT_TYPES.exclusiveGroup.hint}</p>
                    <select value={c.exclusiveGroup || ''}
                        onChange={e => set({ exclusiveGroup: e.target.value || null })}
                        className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold">
                        <option value="">Qo'llanmaydi</option>
                        {OPPORTUNITY_GROUP_ORDER.map(g => (
                            <option key={g} value={g}>{OPPORTUNITY_GROUPS[g].label}</option>
                        ))}
                    </select>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-gray-900">{CONSTRAINT_TYPES.cooldownYears.label}</p>
                    <p className="text-[11px] text-gray-500 mb-2">{CONSTRAINT_TYPES.cooldownYears.hint}</p>
                    <div className="flex items-center gap-2">
                        <input type="number" min="0" value={c.cooldownYears || 0}
                            onChange={e => set({ cooldownYears: Number(e.target.value) || 0 })}
                            className="w-20 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-right" />
                        <span className="text-xs text-gray-500">yil</span>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-gray-900">{CONSTRAINT_TYPES.yearlyLimit.label}</p>
                    <p className="text-[11px] text-gray-500 mb-2">{CONSTRAINT_TYPES.yearlyLimit.hint}</p>
                    <div className="flex items-center gap-2">
                        <input type="number" min="0" value={c.yearlyLimit || 0}
                            onChange={e => set({ yearlyLimit: Number(e.target.value) || 0 })}
                            className="w-20 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-right" />
                        <span className="text-xs text-gray-500">ta (0 = cheklovsiz)</span>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-gray-900">{CONSTRAINT_TYPES.onceOnly.label}</p>
                    <p className="text-[11px] text-gray-500 mb-2">{CONSTRAINT_TYPES.onceOnly.hint}</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={!!c.onceOnly}
                            onChange={e => set({ onceOnly: e.target.checked })}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
                        <span className="text-xs font-semibold text-gray-700">Faqat bir marta beriladi</span>
                    </label>
                </div>
            </div>

            {/* Ochuvchi shart */}
            {grants.length > 0 && (
                <div className="bg-white border border-emerald-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-gray-900">{CONSTRAINT_TYPES.requiresPrior.label}</p>
                    <p className="text-[11px] text-gray-500 mb-2">
                        {CONSTRAINT_TYPES.requiresPrior.hint}. Bu cheklov emas — ochuvchi shart.
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {grants.map(g => {
                            const on = (c.requiresPrior || []).includes(g.id);
                            return (
                                <button key={g.id} type="button" onClick={() => toggleId('requiresPrior', g.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors max-w-[220px] truncate ${on
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-emerald-200'}`}>
                                    {g.title}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// Zanjir sozlamalarida takrorlanadigan kichik raqam maydoni.
const NumField = ({ label, value, onChange, min = 0 }) => (
    <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
        <input type="number" min={min} value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold" />
    </div>
);

// Bo'sh grant formasi - modal har ochilganda shundan boshlanadi.
const emptyGrantForm = () => ({
    title: '', scope: 'internal', type: 'Bir martalik', amount: '',
    quota: '', budget: '', opensAt: '', deadline: '', status: 'draft',
    description: '', requirements: [], requiredDocs: [], weights: { ...DEFAULT_SCORING_WEIGHTS },
    // Bosqichlar zanjiri. Ariza topshirish zanjirdan oldin keladi va sozlanmaydi.
    pipeline: PIPELINE_TEMPLATES[0].build(),
    advanceMethod: 'evaluation',
    mixedWeight: { ...DEFAULT_MIXED_WEIGHT },
    advanceMode: 'automatic',
    tiebreak: [...DEFAULT_TIEBREAK],
    // Imkoniyatlar moduli uchun. Jadval o'zgarmaydi - bular `data` jsonb ichida.
    group: '',
    opportunityKind: '',
    constraints: defaultConstraints(),
});

const ScholarshipManagement = () => {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('applications');
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const bump = useCallback(() => setVersion(v => v + 1), []);

    // --- Ma'lumot ---
    const students = useMemo(() => db.getMockStudents(), []);
    const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const grants = useMemo(() => db.getScholarshipGrants(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const rawApplications = useMemo(() => db.getScholarshipApplications(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const settings = useMemo(() => db.getScholarshipSettings(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const backendReady = useMemo(() => db.isScholarshipBackendReady(), [version]);

    const grantById = useMemo(() => new Map(grants.map(g => [g.id, g])), [grants]);

    // Eski localStorage grantlarini bir martalik ko'chirish - jadval bo'sh bo'lsagina ishlaydi.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await db.migrateLegacyScholarshipGrants();
                if (!cancelled && res.migrated > 0) {
                    bump();
                    window.alert(`${res.migrated} ta eski grant serverga ko'chirildi.`);
                }
            } catch (e) {
                // Jimgina o'tkazib yuborilmaydi: bu yerda muvaffaqiyatsizlik "eski
                // grantlarim yo'qolib qoldi" degan holatning aynan sababi bo'ladi.
                console.error('[stipendiya] eski grantlarni ko\'chirib bo\'lmadi:', e);
                if (!cancelled) setError(`Eski grantlarni ko'chirib bo'lmadi: ${e.message}`);
            }
        })();
        return () => { cancelled = true; };
    }, [bump]);

    // Har bir ariza uchun REAL moslik va avtomatik ball. Profil talaba bo'yicha
    // keshlanadi - bitta talabaning bir nechta arizasi bo'lsa qayta hisoblanmasin.
    const applications = useMemo(() => {
        const profileCache = new Map();
        const profileOf = (sid) => {
            if (!profileCache.has(sid)) profileCache.set(sid, buildStudentEligibilityProfile(db, sid));
            return profileCache.get(sid);
        };

        return rawApplications.map(a => {
            const grant = grantById.get(a.grantId) || { title: a.grantTitle, requirements: [] };
            const pipeline = resolvePipeline(grant);
            const profile = profileOf(a.studentId);
            const declared = a.declared || {};
            const eligibility = evaluateEligibility(grant, profile, declared);
            // Ariza berilgan paytdagi muhrlangan ball bor bo'lsa shu ko'rsatiladi,
            // aks holda joriy holat bo'yicha qayta hisoblanadi (eski seed arizalar uchun).
            const live = computeApplicationScore(grant, profile, declared);
            return {
                ...a,
                status: normalizeApplicationStatus(a.status),
                studentName: studentById.get(a.studentId)?.fullName || a.studentId,
                studentMeta: studentById.get(a.studentId) || null,
                grantTitle: grant.title || a.grantTitle || '—',
                grant,
                profile,
                eligibility,
                stageIndex: a.stageIndex ?? 0,
                currentStage: pipeline[a.stageIndex ?? 0] || null,
                pipelineLength: pipeline.length,
                // Zanjir ichidagi arizaga admin to'g'ridan-to'g'ri qaror chiqarmaydi:
                // baholashni komissiya bajaradi, bosqichdan o'tkazishni tizim yoki admin
                // "Bosqichlar monitoringi" orqali qiladi. Faqat yakuniy bosqichda ochiladi.
                // Bu qoida db qatlamida ham majburlanadi, nafaqat interfeysda.
                adminLocked: (pipeline[a.stageIndex ?? 0]?.type || 'final') !== 'final',
                autoScore: Number.isFinite(a.autoScore) && a.autoScore > 0 ? a.autoScore : live.score,
                scoreParts: live.parts,
                socialScore: profile.social_score,
                date: (a.submittedAt || a.createdAt || '').slice(0, 10),
            };
        });
    }, [rawApplications, grantById, studentById]);

    const usageByGrant = useMemo(() => {
        const map = new Map();
        grants.forEach(g => {
            map.set(g.id, computeGrantUsage(g, applications.filter(a => a.grantId === g.id)));
        });
        return map;
    }, [grants, applications]);

    // --- Filtrlar ---
    const [statusFilter, setStatusFilter] = useState('all');
    const [grantFilter, setGrantFilter] = useState('all');

    const q = searchTerm.trim().toLowerCase();
    const filteredApplications = useMemo(() => applications.filter(a => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (grantFilter !== 'all' && a.grantId !== grantFilter) return false;
        if (!q) return true;
        return `${a.studentName} ${a.grantTitle}`.toLowerCase().includes(q);
    }), [applications, statusFilter, grantFilter, q]);

    const filteredGrants = useMemo(() => grants.filter(g =>
        !q || `${g.title} ${g.type || ''}`.toLowerCase().includes(q)
    ), [grants, q]);

    const stats = useMemo(() => {
        const approved = applications.filter(a => a.status === 'approved');
        const pending = applications.filter(a => !getApplicationStatusMeta(a.status).terminal);
        const totalAmount = approved.reduce((sum, a) => sum + parseAmount(a.grant?.amount), 0);
        return [
            { label: 'Jami arizalar', value: String(applications.length), icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: "Ko'rib chiqilmoqda", value: String(pending.length), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Tasdiqlangan', value: String(approved.length), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: "Ajratilgan mablag'", value: totalAmount > 0 ? `${(totalAmount / 1e6).toFixed(1)} mln` : '0', icon: Banknote, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ];
    }, [applications]);

    // --- Saralash ---
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const handleSort = (key) => setSortConfig(prev => ({
        key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    const getSortedData = (data) => {
        if (!sortConfig.key) return data;
        return [...data].sort((a, b) => {
            const av = a[sortConfig.key], bv = b[sortConfig.key];
            if (av === bv) return 0;
            if (av === undefined || av === null) return 1;
            if (bv === undefined || bv === null) return -1;
            const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
    };
    const sortedApplications = getSortedData(filteredApplications);
    const sortedGrants = getSortedData(filteredGrants);

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <Filter size={14} className="ml-1 text-gray-300" />;
        return <TrendingUp size={14} className={`ml-1 text-indigo-600 ${sortConfig.direction === 'desc' ? 'transform rotate-180' : ''}`} />;
    };
    const SortableHeader = ({ label, column, className = '' }) => (
        <th className={`px-6 py-5 cursor-pointer hover:bg-gray-100 transition-colors select-none ${className}`} onClick={() => handleSort(column)}>
            <div className={`flex items-center ${className.includes('text-right') ? 'justify-end' : className.includes('text-center') ? 'justify-center' : 'justify-start'}`}>
                {label} <SortIcon column={column} />
            </div>
        </th>
    );

    // --- Amallar ---
    // Supabase xatolari `message` dan tashqari `code`/`details`/`hint` ham qaytaradi -
    // ularsiz "nimadir noto'g'ri" degan foydasiz xabar chiqadi. To'liq obyekt konsolga
    // ham yoziladi, chunki interfeysda hammasini ko'rsatish o'rinsiz.
    const describeError = (e) => {
        if (!e) return "Noma'lum xatolik";
        const parts = [e.message || String(e)];
        if (e.code) parts.push(`[kod: ${e.code}]`);
        if (e.details) parts.push(e.details);
        if (e.hint) parts.push(`Maslahat: ${e.hint}`);
        return parts.join(' · ');
    };

    const run = async (fn) => {
        setBusy(true); setError('');
        try { await fn(); bump(); }
        catch (e) {
            console.error('[stipendiya] amal bajarilmadi:', e);
            setError(describeError(e));
        }
        finally { setBusy(false); }
    };

    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewComment, setReviewComment] = useState('');

    const decide = (app, status) => run(async () => {
        if (status === 'approved') {
            const usage = usageByGrant.get(app.grantId);
            if (usage?.quotaFull) throw new Error("Kvota to'lgan - avval boshqa arizani bekor qiling yoki kvotani oshiring");
            if (usage?.budgetFull) throw new Error("Byudjet to'liq taqsimlangan");
        }
        await db.reviewScholarshipApplication(app.id, {
            status, reviewer: user?.username || 'admin', comment: reviewComment,
        });
        setReviewComment('');
        setReviewTarget(null);
    });

    const advance = (app) => {
        const idx = APPLICATION_FLOW.indexOf(app.status);
        const next = APPLICATION_FLOW[idx + 1];
        if (!next || next === 'approved') return;
        run(() => db.reviewScholarshipApplication(app.id, {
            status: next, reviewer: user?.username || 'admin', comment: reviewComment,
        }));
    };

    // --- Grant modali ---
    const [grantForm, setGrantForm] = useState(null);
    const setField = (k, v) => setGrantForm(f => ({ ...f, [k]: v }));

    const openCreateGrant = () => { setGrantForm(emptyGrantForm()); setError(''); };
    const openEditGrant = (g) => {
        setGrantForm({
            ...emptyGrantForm(), ...g,
            requirements: g.requirements || [],
            requiredDocs: g.requiredDocs || [],
            weights: g.weights && Object.keys(g.weights).length ? g.weights : { ...DEFAULT_SCORING_WEIGHTS },
        });
        setError('');
    };

    const saveGrant = () => run(async () => {
        if (!grantForm.title.trim()) throw new Error('Grant nomini kiriting');
        const payload = {
            ...grantForm,
            title: grantForm.title.trim(),
            quota: grantForm.quota === '' ? null : Number(grantForm.quota),
            createdBy: user?.username || 'admin',
        };
        if (grantForm.id) await db.updateScholarshipGrant(grantForm.id, payload);
        else await db.createScholarshipGrant(payload);
        setGrantForm(null);
    });

    const removeGrant = (g) => {
        if (!window.confirm(`"${g.title}" grantini o'chirasizmi?`)) return;
        run(() => db.deleteScholarshipGrant(g.id));
    };

    const archiveGrant = (g) => run(() => db.updateScholarshipGrant(g.id, { status: 'archived' }));

    // Grant formasidagi me'zon qatorlari
    const addRequirement = (key) => {
        if (!key || grantForm.requirements.some(r => r.key === key)) return;
        const meta = getCriterion(key);
        setField('requirements', [...grantForm.requirements, {
            key, label: meta?.label || key, op: meta?.op || 'gte', value: meta?.defaultTarget ?? '',
        }]);
    };
    const patchRequirement = (key, patch) => setField('requirements',
        grantForm.requirements.map(r => r.key === key ? { ...r, ...patch } : r));
    const removeRequirement = (key) => setField('requirements',
        grantForm.requirements.filter(r => r.key !== key));

    // --- Zanjir konstruktori ---
    const patchStage = (index, patch) => setField('pipeline',
        grantForm.pipeline.map((s, i) => i === index ? { ...s, ...patch } : s));

    const addStage = (type) => setField('pipeline', [...(grantForm.pipeline || []), defaultStageConfig(type)]);

    const removeStage = (index) => setField('pipeline', grantForm.pipeline.filter((_, i) => i !== index));

    const moveStage = (index, delta) => {
        const next = [...grantForm.pipeline];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setField('pipeline', next);
    };

    const toggleRequiredDoc = (id) => setField('requiredDocs',
        grantForm.requiredDocs.includes(id)
            ? grantForm.requiredDocs.filter(d => d !== id)
            : [...grantForm.requiredDocs, id]);

    // --- Sozlamalar tabi ---
    const [newCriteriaName, setNewCriteriaName] = useState('');
    const [newDocType, setNewDocType] = useState('');

    const addCustomCriteria = () => {
        const label = newCriteriaName.trim();
        if (!label) return;
        const key = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36).slice(-4);
        run(async () => {
            await db.saveScholarshipSettings({
                customCriteria: [...settings.customCriteria, {
                    key, label, source: 'manual', valueType: 'text', op: 'exists', defaultTarget: '',
                    hint: 'Admin qo\'shgan me\'zon - talaba kiritadi, mas\'ul tekshiradi',
                }],
            });
            setNewCriteriaName('');
        });
    };
    const removeCustomCriteria = (key) => run(() => db.saveScholarshipSettings({
        customCriteria: settings.customCriteria.filter(c => c.key !== key),
    }));

    const addDocType = () => {
        const label = newDocType.trim();
        if (!label) return;
        run(async () => {
            await db.saveScholarshipSettings({
                docTypes: [...settings.docTypes, { id: 'doc_' + Date.now().toString(36), label }],
            });
            setNewDocType('');
        });
    };
    const removeDocType = (id) => run(() => db.saveScholarshipSettings({
        docTypes: settings.docTypes.filter(d => d.id !== id),
    }));

    const allCriteria = useMemo(() => [...CRITERIA_CATALOG, ...settings.customCriteria], [settings]);

    // --- Fakultet komissiyasi ---
    const faculties = useMemo(
        () => [...new Set(students.map(s => s.faculty).filter(Boolean))].sort(),
        [students]
    );

    // Biriktirish uchun akkauntlar: Supabase'dagi real profillar. Talabalar chiqarib
    // tashlanmaydi ataylab - platformada hali "dekan" roli yo'q, shuning uchun dekanat
    // xodimi qaysi rol ostida ro'yxatdan o'tgani oldindan ma'lum emas.
    const assignableUsers = useMemo(() => {
        const profiles = db.getSyncedProfiles() || [];
        return profiles
            .filter(p => p.username)
            .map(p => ({ username: p.username, fullName: p.fullName || p.username, role: p.role }))
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [version]);

    // Test bosqichiga biriktirish uchun e'lon qilingan testlar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const availableTests = useMemo(() => db.getPublishedTests(), [version]);

    // Testlar jadvali bo'sh bo'lsa - eski mock testlarni bir martalik ko'chirish,
    // aks holda test bosqichida tanlaydigan narsa bo'lmaydi.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await db.seedTestsIfEmpty();
                if (!cancelled && res.seeded > 0) bump();
            } catch (e) {
                console.warn('[testlar] boshlang\'ich testlarni yozib bo\'lmadi:', e.message);
            }
        })();
        return () => { cancelled = true; };
    }, [bump]);

    const [newEvaluator, setNewEvaluator] = useState({ faculty: '', username: '' });

    const addEvaluator = () => {
        const { faculty, username } = newEvaluator;
        if (!faculty || !username) { setError("Fakultet va mas'ulni tanlang"); return; }
        if (settings.facultyEvaluators.some(e => e.faculty === faculty && e.username === username)) {
            setError('Bu mas\'ul allaqachon shu fakultetga biriktirilgan');
            return;
        }
        const person = assignableUsers.find(u => u.username === username);
        run(async () => {
            await db.saveScholarshipSettings({
                facultyEvaluators: [...settings.facultyEvaluators, {
                    faculty, username, fullName: person?.fullName || username,
                }],
            });
            setNewEvaluator({ faculty: '', username: '' });
        });
    };

    const removeEvaluator = (faculty, username) => run(() => db.saveScholarshipSettings({
        facultyEvaluators: settings.facultyEvaluators.filter(
            e => !(e.faculty === faculty && e.username === username)),
    }));

    const [newCentral, setNewCentral] = useState('');

    const addCentral = () => {
        if (!newCentral) { setError("Mas'ulni tanlang"); return; }
        if (settings.centralEvaluators.some(e => e.username === newCentral)) {
            setError('Bu mas\'ul allaqachon markaziy komissiyada');
            return;
        }
        const person = assignableUsers.find(u => u.username === newCentral);
        run(async () => {
            await db.saveScholarshipSettings({
                centralEvaluators: [...settings.centralEvaluators, {
                    username: newCentral, fullName: person?.fullName || newCentral,
                }],
            });
            setNewCentral('');
        });
    };

    const removeCentral = (username) => run(() => db.saveScholarshipSettings({
        centralEvaluators: settings.centralEvaluators.filter(e => e.username !== username),
    }));

    // --- Mosliklarni qayta hisoblash ---
    //
    // pg_cron muddat eslatmalarini KESHDAN o'qiydi. Kesh shu yerda to'ldiriladi,
    // chunki moslik mantiqi JS da - uni SQL da qayta yozish ikkita haqiqat
    // manbai degani bo'lardi.
    const [recomputeStatus, setRecomputeStatus] = useState('');

    const recomputeMatches = () => {
        if (!window.confirm(
            "Barcha talabalar uchun mosliklar qayta hisoblanadi. Bu bir necha daqiqa "
            + "olishi mumkin.\n\nYangi mos kelgan talabalarga bildirishnoma yuboriladi."
        )) return;

        run(async () => {
            const res = await recomputeAllMatches(db, {
                buildProfile: (id) => buildStudentEligibilityProfile(db, id),
                getDeclared: (id) => db.getTalentProfile?.(id)?.declared || {},
                notify: true,
                onProgress: ({ processed, total }) =>
                    setRecomputeStatus(`${processed} / ${total}`),
            });
            setRecomputeStatus('');
            window.alert(
                `${res.processed} ta talaba tekshirildi.\n`
                + `${res.totalMatches} ta moslik keshga yozildi.\n`
                + `${res.totalNotified} ta yangi moslik bo'yicha xabar yuborildi.`
                + (res.errors.length ? `\n\n${res.errors.length} ta xatolik (konsolda).` : '')
            );
            if (res.errors.length) console.warn('[imkoniyatlar] xatoliklar:', res.errors);
        });
    };

    // --- CSV eksport ---
    const exportCsv = () => {
        const rows = [
            ['Talaba', 'Fakultet', 'Grant', 'Sana', 'Avto ball', 'Moslik %', 'Holat'],
            ...sortedApplications.map(a => [
                a.studentName, a.studentMeta?.faculty || '', a.grantTitle, a.date,
                a.autoScore, a.eligibility.percent, getApplicationStatusMeta(a.status).label,
            ]),
        ];
        const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url; a.download = `stipendiya-arizalar-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Sarlavha */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic">Stipendiyalar Boshqaruvi</h1>
                    <p className="text-gray-500 font-medium italic">Grantlar, arizalar va avtomatik moslik tekshiruvi</p>
                </div>
                <div className="flex gap-3">
                    {activeTab === 'grants' && (
                        <Button variant="outline" icon={busy ? Loader2 : Target}
                            onClick={recomputeMatches} disabled={busy} className="font-bold">
                            {recomputeStatus || 'Mosliklarni yangilash'}
                        </Button>
                    )}
                    {activeTab === 'applications' && (
                        <Button variant="outline" icon={Download} onClick={exportCsv} className="font-bold">CSV</Button>
                    )}
                    <Button variant="primary" icon={Plus} onClick={openCreateGrant} className="font-bold shadow-lg shadow-indigo-100">
                        Yangi Grant Yaratish
                    </Button>
                </div>
            </div>

            {!backendReady && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-300 rounded-2xl">
                    <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-black text-red-800">Stipendiya jadvallari serverda topilmadi</p>
                        <p className="text-sm text-red-700 mt-1">
                            Bu holatda yaratilgan grant hech qayerga saqlanmaydi va <b>talabalarga ham,
                            boshqa kompyuterga ham ko'rinmaydi</b>. Supabase SQL Editor'da{' '}
                            <code className="px-1.5 py-0.5 bg-red-100 rounded font-mono text-xs">supabase/scholarships.sql</code>{' '}
                            faylini ishga tushiring, so'ng sahifani yangilang.
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-red-700">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><XCircle size={18} /></button>
                </div>
            )}

            {/* Statistika */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {stats.map((stat, idx) => (
                    <Card key={idx} className="border-none shadow-sm h-full">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-2xl ${stat.bg}`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                <p className="text-2xl font-black text-gray-900">{stat.value}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Tablar.
                Tab lentasi + filtrlar bitta qatorga sig'masligi mumkin, shuning uchun
                lenta o'z ichida siljiydi va filtrlar keyingi qatorga o'tadi. */}
            <div className="space-y-3">
                <div className="-mx-1 px-1 overflow-x-auto">
                    <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                        {[
                            ['applications', "Arizalar Ro'yxati"],
                            ['stages', 'Bosqichlar monitoringi'],
                            ['grants', 'Grant va Stipendiyalar'],
                            ['settings', 'Sozlamalar'],
                        ].map(([id, label]) => (
                            <button key={id} onClick={() => setActiveTab(id)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${activeTab === id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    {activeTab === 'applications' && (
                        <>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold">
                                <option value="all">Barcha holatlar</option>
                                {Object.entries(APPLICATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                            <select value={grantFilter} onChange={e => setGrantFilter(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold max-w-[200px]">
                                <option value="all">Barcha grantlar</option>
                                {grants.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                            </select>
                        </>
                    )}
                    {activeTab !== 'archive' && (
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input type="text" placeholder="Qidirish..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-sm" />
                        </div>
                    )}

                    {/* Arxiv - kundalik ish tablari qatoriga kirmaydi: bu yakunlangan
                        tanlovlar reestri, alohida ajratib o'ng chekkaga qo'yilgan. */}
                    <div className="pl-2 ml-auto border-l border-gray-200 flex-shrink-0">
                        <button onClick={() => setActiveTab(activeTab === 'archive' ? 'applications' : 'archive')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${activeTab === 'archive'
                                ? 'bg-gray-800 text-white border-gray-800 shadow-lg shadow-gray-200'
                                : 'bg-white text-gray-500 border-gray-200 hover:text-gray-800 hover:border-gray-300'}`}>
                            <Archive size={16} />
                            Nomzodlar arxivi
                        </button>
                    </div>
                </div>
            </div>

            {/* ============ SOZLAMALAR ============ */}
            {activeTab === 'settings' && (
                <div className="space-y-6">
                    <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                        <Info className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-indigo-800">
                            Standart me'zonlar platformaning o'z ma'lumotidan <b>avtomatik</b> hisoblanadi va o'chirilmaydi.
                            Quyida faqat qo'shimcha (qo'lda kiritiladigan) me'zonlarni boshqarasiz.
                            Barcha o'zgarish serverda saqlanadi.
                        </p>
                    </div>

                    <Card className="p-8 border-none shadow-sm">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            {/* Me'zonlar */}
                            <div className="space-y-5">
                                <h3 className="text-lg font-bold text-gray-900">Grant Mezonlari</h3>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Avtomatik (platforma ma'lumotidan)</p>
                                    {CRITERIA_CATALOG.filter(c => c.source === 'auto').map(c => (
                                        <div key={c.key} className="flex items-center gap-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                                            <ShieldCheck size={18} className="text-emerald-600 flex-shrink-0" />
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 text-sm">{c.label}</p>
                                                <p className="text-[11px] text-gray-500">{c.hint}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Qo'lda kiritiladigan</p>
                                    {CRITERIA_CATALOG.filter(c => c.source === 'manual').map(c => (
                                        <div key={c.key} className="flex items-center gap-3 p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                                            <Edit size={16} className="text-amber-600 flex-shrink-0" />
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 text-sm">{c.label}</p>
                                                <p className="text-[11px] text-gray-500">{c.hint}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {settings.customCriteria.map(c => (
                                        <div key={c.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group">
                                            <div className="flex items-center gap-3">
                                                <Sparkles size={16} className="text-indigo-500" />
                                                <p className="font-bold text-gray-900 text-sm">{c.label}</p>
                                            </div>
                                            <button onClick={() => removeCustomCriteria(c.key)}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <input type="text" value={newCriteriaName} onChange={e => setNewCriteriaName(e.target.value)}
                                        placeholder="Yangi me'zon nomi..."
                                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm" />
                                    <Button onClick={addCustomCriteria} variant="primary" icon={Plus} disabled={busy} className="px-3">Qo'shish</Button>
                                </div>
                            </div>

                            {/* Hujjat turlari */}
                            <div className="space-y-5">
                                <h3 className="text-lg font-bold text-gray-900">Hujjat Turlari</h3>
                                <div className="space-y-2">
                                    {settings.docTypes.map(doc => (
                                        <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                                                    <FileText size={16} />
                                                </div>
                                                <p className="font-bold text-gray-900 text-sm">{doc.label}</p>
                                            </div>
                                            <button onClick={() => removeDocType(doc.id)}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" value={newDocType} onChange={e => setNewDocType(e.target.value)}
                                        placeholder="Hujjat nomi..."
                                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm" />
                                    <Button onClick={addDocType} variant="primary" icon={Plus} disabled={busy} className="px-3">Qo'shish</Button>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Fakultet komissiyasi */}
                    <Card className="p-8 border-none shadow-sm">
                        <div className="flex items-start justify-between gap-4 mb-1">
                            <h3 className="text-lg font-bold text-gray-900">Fakultet komissiyasi (baholovchilar)</h3>
                        </div>
                        <p className="text-sm text-gray-500 mb-5 max-w-3xl">
                            Ikki bosqichli grantlarda fakultet bosqichidagi arizani <b>faqat shu ro'yxatdagi
                            mas'ullar</b> ko'rib chiqadi va baholaydi. Admin bu bosqichda baho qo'ya olmaydi —
                            faqat "Bosqichlar monitoringi" orqali kuzatadi.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <select value={newEvaluator.faculty} onChange={e => setNewEvaluator(v => ({ ...v, faculty: e.target.value }))}
                                className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium">
                                <option value="">Fakultetni tanlang...</option>
                                {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <select value={newEvaluator.username} onChange={e => setNewEvaluator(v => ({ ...v, username: e.target.value }))}
                                className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium">
                                <option value="">Mas'ulni tanlang...</option>
                                {assignableUsers.map(u => (
                                    <option key={u.username} value={u.username}>
                                        {u.fullName} ({u.username})
                                    </option>
                                ))}
                            </select>
                            <Button onClick={addEvaluator} variant="primary" icon={UserPlus} disabled={busy}>
                                Biriktirish
                            </Button>
                        </div>

                        {faculties.map(faculty => {
                            const assigned = settings.facultyEvaluators.filter(e => e.faculty === faculty);
                            return (
                                <div key={faculty} className="flex items-start gap-4 py-3 border-b border-gray-50 last:border-0">
                                    <div className="w-52 flex-shrink-0">
                                        <p className="text-sm font-bold text-gray-800">{faculty}</p>
                                    </div>
                                    <div className="flex-1 flex flex-wrap gap-2">
                                        {assigned.length === 0 ? (
                                            <span className="text-xs text-red-500 font-semibold italic">
                                                Biriktirilmagan — bu fakultet arizalarini hech kim baholay olmaydi
                                            </span>
                                        ) : assigned.map(e => (
                                            <span key={e.username}
                                                className="group inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs font-bold text-indigo-800">
                                                {e.fullName || e.username}
                                                <button onClick={() => removeEvaluator(faculty, e.username)}
                                                    className="text-indigo-300 hover:text-red-600">
                                                    <XCircle size={13} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </Card>

                    {/* Markaziy komissiya */}
                    <Card className="p-8 border-none shadow-sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Markaziy komissiya</h3>
                        <p className="text-sm text-gray-500 mb-5 max-w-3xl">
                            Fakultetga bog'liq bo'lmagan bosqichlar — universitet komissiyasi, test,
                            suhbat va markaziy hujjat ko'rigi — uchun mas'ullar. Ular barcha
                            fakultet nomzodlarini ko'radi.
                        </p>

                        <div className="flex flex-wrap gap-3 mb-4">
                            <select value={newCentral} onChange={e => setNewCentral(e.target.value)}
                                className="flex-1 min-w-[220px] px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium">
                                <option value="">Mas'ulni tanlang...</option>
                                {assignableUsers.map(u => (
                                    <option key={u.username} value={u.username}>{u.fullName} ({u.username})</option>
                                ))}
                            </select>
                            <Button onClick={addCentral} variant="primary" icon={UserPlus} disabled={busy}>
                                Biriktirish
                            </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {settings.centralEvaluators.length === 0 ? (
                                <span className="text-xs text-red-500 font-semibold italic">
                                    Biriktirilmagan — universitet, test va suhbat bosqichlarini hech kim baholay olmaydi
                                </span>
                            ) : settings.centralEvaluators.map(e => (
                                <span key={e.username}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-lg text-xs font-bold text-violet-800">
                                    {e.fullName || e.username}
                                    <button onClick={() => removeCentral(e.username)}
                                        className="text-violet-300 hover:text-red-600">
                                        <XCircle size={13} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* ============ BOSQICHLAR MONITORINGI ============ */}
            {activeTab === 'stages' && (
                <StageMonitor
                    grants={grants}
                    settings={settings}
                    busy={busy}
                    onAdvance={(grantId, opts) => run(async () => {
                        const res = await db.advanceScholarshipPipeline(grantId, {
                            by: user?.username || 'admin', ...opts,
                        });
                        window.alert(
                            `"${res.stageLabel}" bosqichi yakunlandi:\n`
                            + `${res.advanced} ta nomzod keyingi bosqichga o'tdi, `
                            + `${res.notAdvanced} ta kvotaga kirmadi.`
                        );
                    })}
                    onFinalize={(grantId) => {
                        if (!window.confirm(
                            "G'oliblar tasdiqlansinmi? Bundan keyin grant yopiladi va barcha nomzodlar "
                            + 'arxiv reestriga tushadi.'
                        )) return;
                        run(async () => {
                            const res = await db.finalizeScholarshipGrant(grantId, { by: user?.username || 'admin' });
                            window.alert(
                                `${res.winners} ta g'olib tasdiqlandi, ${res.others} ta nomzod arxivga tushdi `
                                + `(${res.cycleYear}-yil sikli).`
                            );
                        });
                    }}
                />
            )}

            {/* ============ NOMZODLAR ARXIVI ============ */}
            {activeTab === 'archive' && <CandidateArchive grants={grants} version={version} />}

            {/* ============ ARIZALAR ============ */}
            {activeTab === 'applications' && (
                <Card className="p-0 overflow-hidden shadow-sm border-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100">
                                <tr>
                                    <SortableHeader label="Talaba" column="studentName" />
                                    <SortableHeader label="Grant" column="grantTitle" />
                                    <th className="px-6 py-5">Bosqich</th>
                                    <SortableHeader label="Sana" column="date" />
                                    <SortableHeader label="Avto ball" column="autoScore" />
                                    <th className="px-6 py-5 text-center">Moslik</th>
                                    <SortableHeader label="Holat" column="status" />
                                    <th className="px-6 py-5 text-right">Amallar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {sortedApplications.length === 0 && (
                                    <tr><td colSpan={8} className="px-6 py-16 text-center text-gray-400 font-medium">
                                        Ariza topilmadi
                                    </td></tr>
                                )}
                                {sortedApplications.map(app => {
                                    const meta = getApplicationStatusMeta(app.status);
                                    return (
                                        <tr key={app.id} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase flex-shrink-0">
                                                        {app.studentName.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-gray-900 text-sm truncate">{app.studentName}</p>
                                                        {app.studentMeta && (
                                                            <p className="text-[11px] text-gray-400 truncate">{app.studentMeta.faculty} · {app.studentMeta.course}-kurs</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-semibold text-gray-600">{app.grantTitle}</td>
                                            <td className="px-6 py-4">
                                                {app.currentStage ? (
                                                    <>
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStageType(app.currentStage.type).tone}`}>
                                                            {app.currentStage.label}
                                                        </span>
                                                        <p className="text-[10px] text-gray-400 mt-1">
                                                            {app.stageIndex + 1} / {app.pipelineLength}
                                                            {app.finalPlace ? ` · ${app.finalPlace}-o'rin` : ''}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <span className="text-[11px] text-gray-400 italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500">{app.date}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className={`h-full ${app.autoScore >= 70 ? 'bg-emerald-500' : app.autoScore >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                                                            style={{ width: `${Math.min(100, app.autoScore)}%` }} />
                                                    </div>
                                                    <span className="text-[11px] font-black text-gray-700">{app.autoScore}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {app.eligibility.total === 0 ? (
                                                    <span className="text-[11px] text-gray-400 italic">me'zonsiz</span>
                                                ) : app.eligibility.blockingCount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                                                        <XCircle size={13} /> {app.eligibility.passedCount}/{app.eligibility.total}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                                                        <CheckCircle size={13} /> {app.eligibility.passedCount}/{app.eligibility.total}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant={meta.variant} size="sm" className="font-bold border">{meta.label}</Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => { setReviewTarget(app); setReviewComment(''); }}
                                                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Ko'rish">
                                                        <Eye size={18} />
                                                    </button>
                                                    {app.adminLocked && (
                                                        <span className="p-2 text-gray-300" title="Fakultet bosqichi — bu yerda admin faqat kuzatadi">
                                                            <Lock size={16} />
                                                        </span>
                                                    )}
                                                    {!meta.terminal && !app.adminLocked && APPLICATION_FLOW.indexOf(app.status) < APPLICATION_FLOW.length - 2 && (
                                                        <button onClick={() => advance(app)} disabled={busy}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Keyingi bosqichga">
                                                            <ChevronRight size={18} />
                                                        </button>
                                                    )}
                                                    {!meta.terminal && !app.adminLocked && (
                                                        <>
                                                            <button onClick={() => decide(app, 'approved')} disabled={busy}
                                                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Tasdiqlash">
                                                                <CheckCircle size={18} />
                                                            </button>
                                                            <button onClick={() => decide(app, 'rejected')} disabled={busy}
                                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Rad etish">
                                                                <XCircle size={18} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* ============ GRANTLAR ============ */}
            {activeTab === 'grants' && (
                <Card className="p-0 overflow-hidden shadow-sm border-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100">
                                <tr>
                                    <SortableHeader label="Grant nomi" column="title" />
                                    <SortableHeader label="Turi" column="type" />
                                    <SortableHeader label="Mablag'" column="amount" />
                                    <SortableHeader label="Muddat" column="deadline" />
                                    <th className="px-6 py-5 text-center">Kvota / Arizalar</th>
                                    <th className="px-6 py-5 text-center">Talablar</th>
                                    <SortableHeader label="Holat" column="status" />
                                    <th className="px-6 py-5 text-right">Amallar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {sortedGrants.length === 0 && (
                                    <tr><td colSpan={8} className="px-6 py-16 text-center text-gray-400 font-medium">
                                        Hali grant yaratilmagan
                                    </td></tr>
                                )}
                                {sortedGrants.map(grant => {
                                    const usage = usageByGrant.get(grant.id) || {};
                                    const st = GRANT_STATUS[grant.status] || GRANT_STATUS.draft;
                                    const openState = getGrantOpenState(grant, usage);
                                    return (
                                        <tr key={grant.id} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-gray-900 text-sm">{grant.title}</p>
                                                {!openState.open && grant.status === 'active' && (
                                                    <p className="text-[11px] text-amber-600 font-semibold mt-0.5">{openState.reason}</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-semibold text-indigo-600">{grant.type || '—'}</td>
                                            <td className="px-6 py-4 text-xs font-black text-gray-900 whitespace-nowrap">{formatAmount(grant.amount)}</td>
                                            <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                                                <span className="flex items-center gap-1"><Clock size={12} /> {grant.deadline || '—'}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center text-xs">
                                                <span className="font-black text-gray-900">
                                                    {usage.approvedCount || 0}{grant.quota ? ` / ${grant.quota}` : ''}
                                                </span>
                                                <p className="text-[10px] text-gray-400">{usage.totalCount || 0} ta ariza</p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {(grant.requirements || []).length > 0 ? (
                                                    <div className="flex flex-wrap gap-1 justify-center max-w-[220px] mx-auto">
                                                        {grant.requirements.slice(0, 2).map((r, i) => (
                                                            <span key={i} className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-md text-gray-600 font-medium">
                                                                {r.label}: {CRITERIA_OPS[r.op]?.symbol || ''}{r.value}
                                                            </span>
                                                        ))}
                                                        {grant.requirements.length > 2 && <span className="text-[10px] text-gray-400">+{grant.requirements.length - 2}</span>}
                                                    </div>
                                                ) : <span className="text-xs text-gray-400 italic">Talablar yo'q</span>}
                                                {(grant.requiredDocs || []).length > 0 && (
                                                    <p className="text-[10px] text-indigo-500 font-bold mt-1">{grant.requiredDocs.length} hujjat</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${st.tone}`}>{st.label}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => openEditGrant(grant)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Tahrirlash">
                                                        <Edit size={18} />
                                                    </button>
                                                    {(usage.totalCount || 0) > 0 ? (
                                                        <button onClick={() => archiveGrant(grant)} disabled={busy || grant.status === 'archived'}
                                                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-30" title="Arxivlash">
                                                            <Archive size={18} />
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => removeGrant(grant)} disabled={busy}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="O'chirish">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* ============ GRANT MODALI ============ */}
            <Modal
                isOpen={!!grantForm}
                onClose={() => setGrantForm(null)}
                title={grantForm?.id ? 'Grantni Tahrirlash' : 'Yangi Grant Yaratish'}
                headerClassName="bg-indigo-600 text-white"
                size="lg"
            >
                {grantForm && (
                    <div className="space-y-4 p-1">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Grant Nomi</label>
                            <input type="text" value={grantForm.title} onChange={e => setField('title', e.target.value)}
                                placeholder="Masalan: Iqtidorli talabalar granti"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Manba</label>
                                <select value={grantForm.scope} onChange={e => setField('scope', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium">
                                    {GRANT_SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Turi</label>
                                <select value={grantForm.type} onChange={e => setField('type', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium">
                                    {GRANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Holati</label>
                                <select value={grantForm.status} onChange={e => setField('status', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium">
                                    {GRANT_STATUS_ORDER.map(s => <option key={s} value={s}>{GRANT_STATUS[s].label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Mablag' (so'm)</label>
                                <input type="text" value={grantForm.amount} onChange={e => setField('amount', e.target.value)}
                                    placeholder="1 500 000"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Kvota (o'rin)</label>
                                <input type="number" min="0" value={grantForm.quota ?? ''} onChange={e => setField('quota', e.target.value)}
                                    placeholder="cheklovsiz"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Umumiy byudjet</label>
                                <input type="text" value={grantForm.budget ?? ''} onChange={e => setField('budget', e.target.value)}
                                    placeholder="cheklovsiz"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Qabul boshlanishi</label>
                                <input type="date" value={grantForm.opensAt || ''} onChange={e => setField('opensAt', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Oxirgi muddat</label>
                                <input type="date" value={grantForm.deadline || ''} onChange={e => setField('deadline', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Tavsif</label>
                            <textarea value={grantForm.description} onChange={e => setField('description', e.target.value)}
                                placeholder="Grant shartlari va maqsadi..."
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium h-20 resize-none" />
                        </div>

                        {/* Me'zonlar */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Grant Talablari</label>
                                <span className="text-[10px] text-gray-400">
                                    <ShieldCheck size={11} className="inline text-emerald-500" /> avtomatik ·
                                    <Edit size={10} className="inline text-amber-500 ml-1.5" /> talaba kiritadi
                                </span>
                            </div>

                            <div className="space-y-2 mb-3">
                                {grantForm.requirements.map(req => {
                                    const meta = allCriteria.find(c => c.key === req.key);
                                    const isAuto = meta?.source === 'auto';
                                    return (
                                        <div key={req.key} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200">
                                            {isAuto
                                                ? <ShieldCheck size={15} className="text-emerald-500 flex-shrink-0" />
                                                : <Edit size={14} className="text-amber-500 flex-shrink-0" />}
                                            <span className="text-sm font-bold text-gray-700 flex-1 min-w-0 truncate">{req.label}</span>
                                            <select value={req.op} onChange={e => patchRequirement(req.key, { op: e.target.value })}
                                                className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold">
                                                {Object.entries(CRITERIA_OPS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                            </select>
                                            {req.op !== 'exists' && (
                                                <input type="text" value={req.value} onChange={e => patchRequirement(req.key, { value: e.target.value })}
                                                    placeholder="qiymat"
                                                    className="w-24 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                                            )}
                                            <span className="text-[10px] text-gray-400 w-8">{meta?.unit || ''}</span>
                                            <button type="button" onClick={() => removeRequirement(req.key)} className="text-red-500 hover:text-red-700">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    );
                                })}
                                {grantForm.requirements.length === 0 && (
                                    <p className="text-xs text-gray-400 italic py-2">Talab qo'shilmagan — grant hammaga ochiq bo'ladi</p>
                                )}
                            </div>

                            <select value="" onChange={e => addRequirement(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                <option value="" disabled>Talab qo'shish...</option>
                                <optgroup label="Avtomatik (platforma ma'lumotidan)">
                                    {allCriteria.filter(c => c.source === 'auto' && !grantForm.requirements.some(r => r.key === c.key))
                                        .map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </optgroup>
                                <optgroup label="Qo'lda kiritiladigan">
                                    {allCriteria.filter(c => c.source !== 'auto' && !grantForm.requirements.some(r => r.key === c.key))
                                        .map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </optgroup>
                            </select>
                        </div>

                        {/* Imkoniyatlar moduli: guruh, turi va cheklovlar */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                Imkoniyat sifatida
                            </label>
                            <p className="text-[11px] text-gray-500 mb-3">
                                Talabaning "Imkoniyatlar" bo'limida qanday ko'rinishi va qaysi
                                imkoniyatlar bilan zid kelishi.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Turi
                                    </label>
                                    <select value={grantForm.opportunityKind || ''}
                                        onChange={e => setField('opportunityKind', e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold">
                                        <option value="">Avtomatik (manbaga qarab)</option>
                                        {OPPORTUNITY_KIND_ORDER.map(k => (
                                            <option key={k} value={k}>{OPPORTUNITY_KINDS[k].label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Guruh
                                    </label>
                                    <select value={grantForm.group || ''}
                                        onChange={e => setField('group', e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold">
                                        <option value="">Guruhsiz</option>
                                        {OPPORTUNITY_GROUP_ORDER.map(g => (
                                            <option key={g} value={g}>{OPPORTUNITY_GROUPS[g].label}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        "Bir vaqtda bitta" qoidasi shunga tayanadi
                                    </p>
                                </div>
                            </div>

                            <ConstraintsEditor
                                value={grantForm.constraints || defaultConstraints()}
                                onChange={v => setField('constraints', v)}
                                grants={grants.filter(g => g.id !== grantForm.id)}
                            />
                        </div>

                        {/* Bosqichlar zanjiri */}
                        <div className="bg-sky-50 p-4 rounded-xl border border-sky-200">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                    <p className="font-bold text-gray-900 text-sm">Bosqichlar zanjiri</p>
                                    <p className="text-[11px] text-sky-700">
                                        Ariza topshirish har doim birinchi — quyida undan keyingi bosqichlar
                                    </p>
                                </div>
                                <select value="" onChange={e => {
                                    const tpl = PIPELINE_TEMPLATES.find(x => x.id === e.target.value);
                                    if (tpl) setField('pipeline', tpl.build());
                                }}
                                    className="px-3 py-2 bg-white border border-sky-200 rounded-lg text-xs font-bold">
                                    <option value="" disabled>Andozadan tanlash...</option>
                                    {PIPELINE_TEMPLATES.map(tpl => (
                                        <option key={tpl.id} value={tpl.id}>{tpl.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-white/70 rounded-lg border border-dashed border-sky-200">
                                <span className="w-6 h-6 rounded-lg bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] font-black">0</span>
                                <span className="text-sm font-bold text-gray-500">Ariza topshirish</span>
                                <span className="text-[10px] text-gray-400 ml-auto">o'zgarmas</span>
                            </div>

                            <div className="space-y-2">
                                {(grantForm.pipeline || []).map((stg, i) => {
                                    const meta = getStageType(stg.type);
                                    return (
                                        <div key={stg.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                            <div className="flex items-center gap-2 p-3 border-b border-gray-100">
                                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black border ${meta.tone}`}>
                                                    {i + 1}
                                                </span>
                                                <input type="text" value={stg.label}
                                                    onChange={ev => patchStage(i, { label: ev.target.value })}
                                                    className="flex-1 min-w-0 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm font-bold" />
                                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold border ${meta.tone}`}>
                                                    {meta.short}
                                                </span>
                                                <button type="button" onClick={() => moveStage(i, -1)} disabled={i === 0}
                                                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20">
                                                    <ChevronUp size={16} />
                                                </button>
                                                <button type="button" onClick={() => moveStage(i, 1)} disabled={i === grantForm.pipeline.length - 1}
                                                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20">
                                                    <ChevronDown size={16} />
                                                </button>
                                                <button type="button" onClick={() => removeStage(i)}
                                                    className="p-1 text-red-500 hover:text-red-700">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>

                                            <div className="p-3 space-y-3">
                                                <p className="text-[11px] text-gray-500">{meta.hint}</p>

                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                    {stg.type === 'faculty_commission' && (
                                                        <NumField label="Har fakultetdan Top N" value={stg.quotaPerFaculty}
                                                            onChange={v => patchStage(i, { quotaPerFaculty: v })} />
                                                    )}
                                                    {['commission', 'test', 'interview'].includes(stg.type) && (
                                                        <NumField label="Top N o'tadi" value={stg.quota}
                                                            onChange={v => patchStage(i, { quota: v })} />
                                                    )}
                                                    {meta.scored && stg.type !== 'test' && (
                                                        <NumField label="Kamida nechta baho" value={stg.minEvaluations} min={1}
                                                            onChange={v => patchStage(i, { minEvaluations: v })} />
                                                    )}
                                                    {stg.type === 'test' && (
                                                        <>
                                                            <NumField label="Maksimal ball" value={stg.maxScore}
                                                                onChange={v => patchStage(i, { maxScore: v })} />
                                                            <NumField label="O'tish balli" value={stg.passScore}
                                                                onChange={v => patchStage(i, { passScore: v })} />
                                                        </>
                                                    )}
                                                    {stg.type === 'interview' && (
                                                        <NumField label="O'tish balli (%)" value={stg.passScore}
                                                            onChange={v => patchStage(i, { passScore: v })} />
                                                    )}
                                                    {stg.type === 'final' && (
                                                        <>
                                                            <NumField label="G'oliblar soni" value={stg.winners} min={1}
                                                                onChange={v => patchStage(i, { winners: v })} />
                                                            <NumField label="Sovrinli o'rinlar" value={stg.prizePlaces}
                                                                onChange={v => patchStage(i, { prizePlaces: v })} />
                                                        </>
                                                    )}
                                                </div>

                                                {stg.type === 'test' && (
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                                            Platformadagi test
                                                        </label>
                                                        <select value={stg.testId || ''}
                                                            onChange={ev => {
                                                                const t = availableTests.find(x => x.id === ev.target.value);
                                                                patchStage(i, { testId: ev.target.value, testName: t?.title || '' });
                                                            }}
                                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold">
                                                            <option value="">Biriktirilmagan — ball qo'lda kiritiladi</option>
                                                            {availableTests.map(t => (
                                                                <option key={t.id} value={t.id}>{t.title}</option>
                                                            ))}
                                                        </select>
                                                        <p className="text-[11px] text-gray-500 mt-1">
                                                            {stg.testId
                                                                ? "Nomzodning shu testdagi eng yaxshi natijasi avtomatik olinadi; mas'ul kerak bo'lsa qo'lda tuzatishi mumkin."
                                                                : availableTests.length === 0
                                                                    ? "Hali e'lon qilingan test yo'q — Testlar bo'limida yarating yoki ballni qo'lda kiriting."
                                                                    : 'Test biriktirilmasa, ball mas\'ul tomonidan kiritiladi.'}
                                                        </p>
                                                    </div>
                                                )}

                                                {stg.type === 'document_review' && (
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                                            Kim ko'rib chiqadi
                                                        </label>
                                                        <select value={stg.reviewerScope || 'faculty'}
                                                            onChange={ev => patchStage(i, { reviewerScope: ev.target.value })}
                                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold">
                                                            <option value="faculty">Fakultet mas'ullari</option>
                                                            <option value="central">Markaziy komissiya</option>
                                                        </select>
                                                    </div>
                                                )}

                                                {meta.scored && stg.type !== 'test' && (
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                                            Baholash me'zonlari
                                                        </label>
                                                        <div className="space-y-1.5">
                                                            {(stg.criteria || []).map((c, ci) => (
                                                                <div key={c.key} className="flex items-center gap-2">
                                                                    <input type="text" value={c.label}
                                                                        onChange={ev => patchStage(i, {
                                                                            criteria: stg.criteria.map((x, j) => j === ci ? { ...x, label: ev.target.value } : x)
                                                                        })}
                                                                        className="flex-1 min-w-0 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm" />
                                                                    <input type="number" min="1" value={c.max}
                                                                        onChange={ev => patchStage(i, {
                                                                            criteria: stg.criteria.map((x, j) => j === ci ? { ...x, max: Number(ev.target.value) || 0 } : x)
                                                                        })}
                                                                        className="w-16 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm text-right" />
                                                                    <button type="button"
                                                                        onClick={() => patchStage(i, { criteria: stg.criteria.filter((_, j) => j !== ci) })}
                                                                        className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center justify-between mt-2">
                                                            <button type="button"
                                                                onClick={() => patchStage(i, {
                                                                    criteria: [...(stg.criteria || []), { key: 'c_' + Date.now().toString(36), label: "Yangi me'zon", max: 25 }]
                                                                })}
                                                                className="text-xs font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1">
                                                                <Plus size={13} /> Me'zon qo'shish
                                                            </button>
                                                            <span className="text-[11px] text-gray-400">
                                                                Jami: {(stg.criteria || []).reduce((s, c) => s + (Number(c.max) || 0), 0)} ball
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <select value="" onChange={e => e.target.value && addStage(e.target.value)}
                                className="w-full mt-3 px-3 py-2.5 bg-white border border-sky-200 rounded-lg text-sm font-semibold">
                                <option value="" disabled>Bosqich qo'shish...</option>
                                {STAGE_TYPE_ORDER.map(tp => (
                                    <option key={tp} value={tp}>{STAGE_TYPES[tp].label}</option>
                                ))}
                            </select>

                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        O'tkazish rejimi
                                    </label>
                                    <select value={grantForm.advanceMode}
                                        onChange={e => setField('advanceMode', e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg font-semibold text-sm">
                                        {Object.values(ADVANCE_MODES).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Saralash usuli
                                    </label>
                                    <select value={grantForm.advanceMethod}
                                        onChange={e => setField('advanceMethod', e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg font-semibold text-sm">
                                        {Object.values(ADVANCE_METHODS).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            {grantForm.advanceMethod === 'mixed' && (
                                <div className="grid grid-cols-2 gap-3 mt-3">
                                    <NumField label="Komissiya bahosi vazni" value={grantForm.mixedWeight?.evaluation}
                                        onChange={v => setField('mixedWeight', { ...grantForm.mixedWeight, evaluation: v })} />
                                    <NumField label="Platforma reytingi vazni" value={grantForm.mixedWeight?.auto}
                                        onChange={v => setField('mixedWeight', { ...grantForm.mixedWeight, auto: v })} />
                                </div>
                            )}

                            <div className="mt-3">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Teng ball to'planganda (tartib bo'yicha)
                                </label>
                                <div className="space-y-1">
                                    {Object.values(TIEBREAK_OPTIONS).map(t => {
                                        const idx = (grantForm.tiebreak || []).indexOf(t.id);
                                        return (
                                            <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={idx >= 0}
                                                    onChange={() => setField('tiebreak', idx >= 0
                                                        ? grantForm.tiebreak.filter(x => x !== t.id)
                                                        : [...(grantForm.tiebreak || []), t.id])}
                                                    className="w-4 h-4 text-sky-600 rounded border-gray-300" />
                                                <span className="text-sm text-gray-700">{t.label}</span>
                                                {idx >= 0 && (
                                                    <span className="text-[10px] font-black text-sky-600 bg-sky-100 px-1.5 rounded">{idx + 1}</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Ballash vaznlari */}
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Avtomatik reyting vaznlari</label>
                            <p className="text-[11px] text-indigo-700 mb-3">
                                Arizalar shu vaznlar bo'yicha 100 ballik shkalada avtomatik saralanadi.
                                Yig'indi aynan 100 bo'lishi shart emas — normalizatsiya qilinadi.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(grantForm.weights).map(([key, w]) => {
                                    const meta = getCriterion(key);
                                    if (!meta) return null;
                                    return (
                                        <div key={key} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-indigo-100">
                                            <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{meta.label}</span>
                                            <input type="number" min="0" max="100" value={w}
                                                onChange={e => setField('weights', { ...grantForm.weights, [key]: Number(e.target.value) })}
                                                className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm text-right" />
                                        </div>
                                    );
                                })}
                            </div>
                            <select value="" onChange={e => e.target.value && setField('weights', { ...grantForm.weights, [e.target.value]: 10 })}
                                className="w-full mt-2 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm">
                                <option value="" disabled>Vazn qo'shish...</option>
                                {CRITERIA_CATALOG.filter(c => c.valueType === 'number' && !(c.key in grantForm.weights))
                                    .map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                        </div>

                        {/* Talab qilinadigan hujjatlar */}
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Talab Etiladigan Hujjatlar</label>
                            <div className="grid grid-cols-2 gap-3">
                                {settings.docTypes.map(doc => (
                                    <label key={doc.id} className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={grantForm.requiredDocs.includes(doc.id)}
                                            onChange={() => toggleRequiredDoc(doc.id)}
                                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                                        <span className="text-sm font-medium text-gray-700">{doc.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2 flex gap-3">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => setGrantForm(null)}>Bekor qilish</Button>
                            <Button type="button" variant="primary" className="flex-1 shadow-lg shadow-indigo-200"
                                onClick={saveGrant} disabled={busy}
                                icon={busy ? Loader2 : undefined}>
                                {busy ? 'Saqlanmoqda...' : 'Saqlash'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ============ ARIZA MODALI ============ */}
            <Modal
                isOpen={!!reviewTarget}
                onClose={() => setReviewTarget(null)}
                title="Ariza ma'lumotlari"
                headerClassName="bg-indigo-600 text-white"
                size="lg"
            >
                {reviewTarget && (
                    <ApplicationReview
                        app={reviewTarget}
                        docTypes={settings.docTypes}
                        comment={reviewComment}
                        setComment={setReviewComment}
                        busy={busy}
                        onDecide={decide}
                        onAdvance={advance}
                    />
                )}
            </Modal>
        </div>
    );
};

const STAGE_ICONS = { FileCheck, Building2, Users, ClipboardList, MessageSquare, Trophy };

// ---------------------------------------------------------------------------
// NOMZODLAR ARXIVI
//
// Tanlovda qatnashgan HAR BIR nomzod - qaysi bosqichgacha borgani va nima bilan
// tugagani bilan. Fakultetda to'xtaganmi, universitet bosqichida yutqazganmi,
// g'olib bo'lganmi - hammasi shu bitta reestrda qoladi.
// G'oliblar tepada alohida: keyingi yilgi tanlov yakunlanmaguncha ular "shu
// yilgi stipendiantlar" bo'lib turadi.
// ---------------------------------------------------------------------------
const OUTCOME_META = {
    winner: { label: "G'olib", variant: 'success', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    eliminated: { label: 'Chetlatilgan', variant: 'secondary', tone: 'bg-gray-100 text-gray-500 border-gray-200' },
    withdrawn: { label: 'Qaytarib olgan', variant: 'secondary', tone: 'bg-gray-100 text-gray-400 border-gray-200' },
    in_progress: { label: 'Jarayonda', variant: 'warning', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const CandidateArchive = ({ grants, version }) => {
    const years = useMemo(() => db.getScholarshipArchiveYears(), [version]);
    const [year, setYear] = useState('all');
    const [grantId, setGrantId] = useState('all');
    const [outcome, setOutcome] = useState('all');
    const [q, setQ] = useState('');

    const rows = useMemo(() => db.getScholarshipArchive({
        year: year === 'all' ? null : year,
        grantId: grantId === 'all' ? null : grantId,
        outcome: outcome === 'all' ? null : outcome,
    }), [year, grantId, outcome, version]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter(r => `${r.studentName} ${r.faculty} ${r.grantTitle}`.toLowerCase().includes(needle));
    }, [rows, q]);

    // Joriy sikl g'oliblari - eng so'nggi yil bo'yicha.
    const latestYear = years[0];
    const currentWinners = useMemo(
        () => (latestYear ? db.getCurrentStipendiants(latestYear) : []),
        [latestYear, version]
    );

    const exportCsv = () => {
        const data = [
            ['Yil', 'Talaba', 'Fakultet', 'Grant', "Yetgan bosqich", 'Natija', "O'rin"],
            ...filtered.map(r => [
                r.cycleYear, r.studentName, r.faculty, r.grantTitle,
                `${r.reachedStageLabel} (${r.reachedStageIndex + 1}/${r.totalStages})`,
                OUTCOME_META[r.outcome]?.label || r.outcome,
                r.finalPlace || '',
            ]),
        ];
        const csv = '﻿' + data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `nomzodlar-arxivi-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-5">
            {/* Joriy yil stipendiantlari */}
            {currentWinners.length > 0 && (
                <Card className="p-0 overflow-hidden border-2 border-emerald-200">
                    <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                        <Trophy size={18} className="text-emerald-600" />
                        <h3 className="font-black text-emerald-900">
                            {latestYear}-yil g'olib va sovrindor stipendiantlari ({currentWinners.length})
                        </h3>
                        <span className="ml-auto text-[11px] text-emerald-700 font-semibold">
                            keyingi tanlov yakunlanmaguncha amalda
                        </span>
                    </div>
                    <div className="p-4 flex flex-wrap gap-2">
                        {currentWinners.map(w => (
                            <div key={w.id} className="flex items-center gap-3 px-4 py-2.5 bg-white border border-emerald-100 rounded-xl">
                                {w.finalPlace && (
                                    <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-black">
                                        {w.finalPlace}
                                    </span>
                                )}
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{w.studentName}</p>
                                    <p className="text-[11px] text-gray-500">{w.faculty} · {w.grantTitle}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Filtrlar */}
            <div className="flex flex-wrap gap-2 items-center">
                <select value={year} onChange={e => setYear(e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold">
                    <option value="all">Barcha yillar</option>
                    {years.map(y => <option key={y} value={y}>{y}-yil</option>)}
                </select>
                <select value={grantId} onChange={e => setGrantId(e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold max-w-[220px]">
                    <option value="all">Barcha grantlar</option>
                    {grants.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
                <select value={outcome} onChange={e => setOutcome(e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold">
                    <option value="all">Barcha natijalar</option>
                    {Object.entries(OUTCOME_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Nomzod qidirish..."
                        className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium w-52" />
                </div>
                <Button variant="outline" icon={Download} onClick={exportCsv} className="font-bold ml-auto">CSV</Button>
            </div>

            <Card className="p-0 overflow-hidden shadow-sm border-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-5">Yil</th>
                                <th className="px-6 py-5">Nomzod</th>
                                <th className="px-6 py-5">Fakultet</th>
                                <th className="px-6 py-5">Grant</th>
                                <th className="px-6 py-5">Yetgan bosqich</th>
                                <th className="px-6 py-5">Natija</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-16 text-center text-gray-400 font-medium">
                                    Arxivda yozuv yo'q
                                </td></tr>
                            )}
                            {filtered.map(r => {
                                const om = OUTCOME_META[r.outcome] || OUTCOME_META.in_progress;
                                return (
                                    <tr key={r.id} className={r.isWinner ? 'bg-emerald-50/30' : ''}>
                                        <td className="px-6 py-4 text-xs font-black text-gray-500">{r.cycleYear}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {r.isWinner && <Trophy size={14} className="text-emerald-600 flex-shrink-0" />}
                                                <div className="min-w-0">
                                                    <p className="font-bold text-gray-900 text-sm truncate">{r.studentName}</p>
                                                    {r.finalPlace && (
                                                        <p className="text-[11px] text-emerald-700 font-bold">{r.finalPlace}-o'rin</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-gray-600">{r.faculty}</td>
                                        <td className="px-6 py-4 text-xs font-semibold text-gray-600">{r.grantTitle}</td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs font-bold text-gray-800">{r.reachedStageLabel}</p>
                                            <div className="flex gap-0.5 mt-1 max-w-[120px]">
                                                {Array.from({ length: r.totalStages }).map((_, i) => (
                                                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= r.reachedStageIndex ? (r.isWinner ? 'bg-emerald-500' : 'bg-indigo-400') : 'bg-gray-200'}`} />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${om.tone}`}>
                                                {om.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

// ---------------------------------------------------------------------------
// BOSQICHLAR MONITORINGI
//
// Adminning baholovchi bo'lmagan bosqichdagi yagona roli - KUZATISH. Bu ekran
// aynan shu uchun: nomzod zanjirning qaysi bosqichida, qanday ball olgan, kim
// baholagan, kim baholamagan, hozirgi holatda kim keyingi bosqichga o'tadi.
// ---------------------------------------------------------------------------
const StageMonitor = ({ grants, settings, busy, onAdvance, onFinalize }) => {
    const [grantId, setGrantId] = useState(grants[0]?.id || '');
    const [expanded, setExpanded] = useState(0);

    const grant = grants.find(g => g.id === grantId) || null;
    const pipeline = useMemo(() => (grant ? resolvePipeline(grant) : []), [grant]);
    const overview = useMemo(
        () => (grantId ? db.getScholarshipPipelineOverview(grantId) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [grantId, busy]
    );

    if (grants.length === 0) {
        return (
            <Card className="text-center py-16">
                <Layers className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                <p className="font-bold text-gray-500">Hali grant yaratilmagan</p>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
                <select value={grantId} onChange={e => { setGrantId(e.target.value); setExpanded(0); }}
                    className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-sm md:max-w-md">
                    {grants.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
                {grant && (
                    <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
                        <span>{ADVANCE_METHODS[grant.advanceMethod]?.label || 'Komissiya bahosi'}</span>
                        <span>·</span>
                        <span>{ADVANCE_MODES[grant.advanceMode || 'automatic']?.label}</span>
                    </div>
                )}
            </div>

            {/* Zanjir xaritasi */}
            <Card className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Bosqichlar zanjiri</p>
                <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
                    <div className="flex-shrink-0 px-4 py-3 rounded-xl bg-gray-100 border border-gray-200 min-w-[130px]">
                        <p className="text-xs font-black text-gray-600">Ariza topshirish</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">boshlanish</p>
                    </div>
                    {overview.map((st, i) => {
                        const Icon = STAGE_ICONS[st.meta.icon] || Layers;
                        return (
                            <React.Fragment key={st.stage.id}>
                                <ChevronRight size={16} className="text-gray-300 self-center flex-shrink-0" />
                                <button type="button" onClick={() => setExpanded(i)}
                                    className={`flex-shrink-0 px-4 py-3 rounded-xl border text-left min-w-[150px] transition-all ${expanded === i ? 'ring-2 ring-indigo-400 ' : ''}${st.meta.tone}`}>
                                    <div className="flex items-center gap-1.5">
                                        <Icon size={13} />
                                        <p className="text-xs font-black truncate">{st.stage.label}</p>
                                    </div>
                                    <p className="text-[10px] opacity-70 mt-0.5">
                                        {st.totalActive} nomzod
                                        {st.meta.scored && stageQuota(st.stage) > 0 ? ` · Top ${stageQuota(st.stage)}` : ''}
                                    </p>
                                </button>
                            </React.Fragment>
                        );
                    })}
                </div>
            </Card>

            {/* Tanlangan bosqich */}
            {overview[expanded] && (
                <StageDetail
                    grant={grant}
                    view={overview[expanded]}
                    settings={settings}
                    busy={busy}
                    onAdvance={onAdvance}
                    onFinalize={onFinalize}
                />
            )}
        </div>
    );
};

// Bitta bosqichning to'liq manzarasi: guruhlar, reyting, baholovchilar.
const StageDetail = ({ grant, view, settings, busy, onAdvance, onFinalize }) => {
    const { stage, stageIndex, meta } = view;
    const isFinal = stage.type === 'final';

    return (
        <div className="space-y-4">
            <Card className={`border-2 ${view.readyToAdvance ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        {view.readyToAdvance
                            ? <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                            : <Clock className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />}
                        <div>
                            <p className="font-black text-gray-900">{stage.label}</p>
                            <p className="text-sm text-gray-600 mt-0.5">
                                {view.totalActive} nomzod
                                {view.totalPending > 0
                                    ? ` · ${view.totalPending} tasi hali baholanmagan`
                                    : meta.scored ? ' · barchasi baholangan' : ''}
                                {meta.scored ? ` · ${view.totalAdvancing} tasi o'tadi` : ''}
                            </p>
                        </div>
                    </div>

                    {view.totalActive > 0 && (
                        <div className="flex gap-2 flex-shrink-0">
                            {isFinal ? (
                                <Button variant="primary" icon={Trophy} disabled={busy}
                                    onClick={() => onFinalize(grant.id)}>
                                    G'oliblarni tasdiqlash
                                </Button>
                            ) : (
                                <>
                                    <Button variant="primary" icon={ArrowUpRight}
                                        disabled={busy || !view.readyToAdvance}
                                        onClick={() => onAdvance(grant.id, { stageIndex })}>
                                        Keyingi bosqichga o'tkazish
                                    </Button>
                                    {!view.readyToAdvance && (
                                        <Button variant="outline" disabled={busy}
                                            onClick={() => {
                                                if (window.confirm(
                                                    `${view.totalPending} ta ariza hali baholanmagan. Ular reyting oxirida qoladi va kvotaga kirmaydi. Baribir o'tkazilsinmi?`
                                                )) onAdvance(grant.id, { stageIndex, force: true });
                                            }}>
                                            Majburiy
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {view.groups.length === 0 && (
                <Card className="text-center py-12 text-gray-400 font-medium">
                    Bu bosqichda hozircha nomzod yo'q
                </Card>
            )}

            {view.groups.map(g => {
                const evaluators = meta.perFaculty
                    ? getFacultyEvaluators(settings, g.group)
                    : (settings.centralEvaluators || []);
                return (
                    <Card key={g.group} className="p-0 overflow-hidden">
                        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Building2 size={18} className="text-gray-400" />
                                <div>
                                    <p className="font-black text-gray-900">{g.group}</p>
                                    <p className="text-[11px] text-gray-500">
                                        {g.total} nomzod
                                        {g.pending > 0 && <span className="text-amber-600 font-bold"> · {g.pending} baholanmagan</span>}
                                        {evaluators.length === 0
                                            ? <span className="text-red-600 font-bold"> · baholovchi biriktirilmagan</span>
                                            : <span> · {evaluators.length} baholovchi</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {evaluators.map(ev => (
                                    <span key={ev.username} className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-gray-700">
                                        {ev.fullName || ev.username}
                                    </span>
                                ))}
                                {meta.scored && g.quota > 0 && (
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        {g.advancing.length} / {g.quota} o'tadi
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                                    <tr>
                                        <th className="px-5 py-3 w-12">#</th>
                                        <th className="px-5 py-3">Nomzod</th>
                                        <th className="px-5 py-3">Holat</th>
                                        {meta.scored && <th className="px-5 py-3 text-center">Bosqich bahosi</th>}
                                        <th className="px-5 py-3 text-center">Platforma reytingi</th>
                                        {meta.scored && <th className="px-5 py-3 text-center">Saralash balli</th>}
                                        <th className="px-5 py-3">Kim baholagan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {g.ranked.map(r => {
                                        const sm = getApplicationStatusMeta(r.status);
                                        const es = r.evaluationSummary;
                                        const testScore = r.testScores?.[stage.id];
                                        return (
                                            <tr key={r.id} className={r.wouldAdvance ? 'bg-emerald-50/40' : ''}>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${r.wouldAdvance ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                        {r.rank}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <p className="font-bold text-gray-900">{r.studentName}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        {meta.perFaculty ? (r.submittedAt || '').slice(0, 10) : r.faculty}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <Badge variant={sm.variant} size="sm">{sm.label}</Badge>
                                                </td>
                                                {meta.scored && (
                                                    <td className="px-5 py-3 text-center">
                                                        {stage.type === 'test' ? (
                                                            testScore === undefined || testScore === null
                                                                ? <span className="text-[11px] text-amber-600 font-bold">kiritilmagan</span>
                                                                : <span className="font-black text-gray-900">{testScore} <span className="text-[11px] text-gray-400">/ {stage.maxScore || 100}</span></span>
                                                        ) : es.count === 0 ? (
                                                            <span className="text-[11px] text-amber-600 font-bold">baholanmagan</span>
                                                        ) : (
                                                            <>
                                                                <span className="font-black text-gray-900">{es.average}</span>
                                                                <span className="text-[11px] text-gray-400"> / {es.max}</span>
                                                                <p className="text-[10px] text-gray-400">{es.count} ta baho</p>
                                                            </>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-5 py-3 text-center font-bold text-gray-700">{r.autoScore ?? 0}</td>
                                                {meta.scored && (
                                                    <td className="px-5 py-3 text-center">
                                                        {r.stageScore === null || r.stageScore === undefined ? (
                                                            <span className="text-gray-300">—</span>
                                                        ) : (
                                                            <span className={`text-lg font-black ${r.wouldAdvance ? 'text-emerald-600' : r.belowPassScore ? 'text-red-500' : 'text-gray-700'}`}>
                                                                {r.stageScore}
                                                            </span>
                                                        )}
                                                        {r.belowPassScore && (
                                                            <p className="text-[10px] text-red-500 font-bold">o'tish ballidan past</p>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-5 py-3">
                                                    {es.evaluators.length === 0 ? (
                                                        <span className="text-[11px] text-gray-400 italic">—</span>
                                                    ) : (
                                                        <div className="space-y-0.5">
                                                            {es.evaluators.map(ev => (
                                                                <p key={ev.id} className="text-[11px] text-gray-600">
                                                                    <b>{ev.name}</b> — {ev.total} ball
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Ariza ko'rish/qaror modalining ichki qismi. Alohida komponent — asosiy
// komponentning render'i shundoq ham uzun.
// ---------------------------------------------------------------------------
const ApplicationReview = ({ app, docTypes, comment, setComment, busy, onDecide, onAdvance }) => {
    const meta = getApplicationStatusMeta(app.status);
    const docTypeLabel = (id) => docTypes.find(d => d.id === id)?.label || id;

    return (
        <div className="space-y-5">
            {/* Talaba */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
                        {app.studentName[0]}
                    </div>
                    <div>
                        <h3 className="font-black text-gray-900">{app.studentName}</h3>
                        <p className="text-xs text-gray-500 font-medium">
                            {app.studentMeta ? `${app.studentMeta.faculty} · ${app.studentMeta.course}-kurs · ${app.studentMeta.group}` : app.studentId}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{app.grantTitle} · {app.date}</p>
                    </div>
                </div>
                <div className="text-right">
                    <Badge variant={meta.variant} size="sm" className="font-bold border">{meta.label}</Badge>
                    <p className="text-3xl font-black text-indigo-600 mt-1">{app.autoScore}</p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">avto ball</p>
                </div>
            </div>

            {/* Bosqichlar */}
            <div className="flex items-center gap-1">
                {APPLICATION_FLOW.map((s, i) => {
                    const sm = APPLICATION_STATUS[s];
                    const done = meta.step > sm.step || (app.status === s);
                    const isRejected = app.status === 'rejected';
                    return (
                        <React.Fragment key={s}>
                            <div className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${isRejected ? 'bg-gray-100 text-gray-400'
                                : done ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                {sm.label}
                            </div>
                            {i < APPLICATION_FLOW.length - 1 && <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Moslik tekshiruvi */}
            <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                    <Scale size={15} /> Moslik tekshiruvi
                </h4>
                {app.eligibility.total === 0 ? (
                    <p className="text-sm text-gray-400 italic p-4 bg-gray-50 rounded-xl">Bu grantga me'zon belgilanmagan</p>
                ) : (
                    <div className="space-y-1.5">
                        {app.eligibility.checks.map(c => (
                            <div key={c.key} className={`flex items-center gap-3 p-3 rounded-xl border ${c.ok ? 'bg-emerald-50/60 border-emerald-100'
                                : c.unknown ? 'bg-gray-50 border-gray-200' : 'bg-red-50/60 border-red-100'}`}>
                                {c.ok ? <CheckCircle size={17} className="text-emerald-600 flex-shrink-0" />
                                    : c.unknown ? <AlertTriangle size={17} className="text-gray-400 flex-shrink-0" />
                                        : <XCircle size={17} className="text-red-500 flex-shrink-0" />}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900">{c.label}</p>
                                    <p className="text-[11px] text-gray-500">
                                        {c.source === 'auto'
                                            ? 'Platforma ma\'lumotidan avtomatik'
                                            : 'Talaba kiritgan — tekshirish talab etiladi'}
                                    </p>
                                </div>
                                <div className="text-right whitespace-nowrap">
                                    <p className="text-sm font-black text-gray-900">
                                        {c.unknown ? '—' : `${c.actual} ${c.unit}`}
                                    </p>
                                    <p className="text-[10px] text-gray-400">
                                        talab: {CRITERIA_OPS[c.op]?.symbol} {c.target} {c.unit}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ilova qilingan rasmiy hujjatlar */}
            {(app.attachedDocumentIds || []).length > 0 && (
                <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                        <ShieldCheck size={15} className="text-emerald-600" /> Ilova qilingan rasmiy hujjatlar
                    </h4>
                    <div className="space-y-1.5">
                        {app.attachedDocumentIds.map(id => {
                            const doc = (app.profile.documents || []).find(d => d.id === id);
                            if (!doc) return (
                                <p key={id} className="text-xs text-gray-400 italic px-3 py-2">Hujjat topilmadi ({id})</p>
                            );
                            return (
                                <div key={id} className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-900 truncate">{getDocumentTypeLabel(doc.documentType)}</p>
                                        <p className="text-[11px] text-gray-500 truncate">{doc.activityName}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-3">
                                        <p className="text-[10px] font-mono text-gray-500">{doc.registrationNumber}</p>
                                        <a href={`/verify/${doc.verificationToken}`} target="_blank" rel="noreferrer"
                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
                                            Tekshirish →
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                        Bu hujjatlar taqdirlash reyestridan olingan — soxtalashtirib bo'lmaydi.
                    </p>
                </div>
            )}

            {/* Talab qilingan qo'lda hujjatlar */}
            {(app.grant?.requiredDocs || []).length > 0 && (
                <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2">Talab qilingan hujjatlar</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {app.grant.requiredDocs.map(id => {
                            const uploaded = (app.uploadedDocs || []).find(u => u.typeId === id);
                            return (
                                <div key={id} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold ${uploaded ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                                    {uploaded ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                                    <span className="truncate">{docTypeLabel(id)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {app.note && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Talabaning izohi</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.note}</p>
                </div>
            )}

            {/* Tarix */}
            {(app.history || []).length > 0 && (
                <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2">Harakatlar tarixi</h4>
                    <div className="space-y-1">
                        {app.history.map((h, i) => (
                            <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 bg-gray-50 rounded-lg">
                                <span className="font-bold text-gray-700 w-32 flex-shrink-0">{APPLICATION_STATUS[h.status]?.label || h.status}</span>
                                <span className="text-gray-400 flex-shrink-0">{(h.at || '').slice(0, 16).replace('T', ' ')}</span>
                                <span className="text-gray-500 truncate">{h.by}{h.comment ? ` — ${h.comment}` : ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Qaror */}
            {app.adminLocked && (
                <div className="flex items-start gap-3 p-4 bg-sky-50 border border-sky-200 rounded-xl">
                    <Lock size={18} className="text-sky-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold text-sky-900 text-sm">
                            {app.currentStage?.label || 'Bosqich'} — kuzatuv rejimi
                        </p>
                        <p className="text-xs text-sky-700 mt-0.5">
                            Bu bosqichda arizani biriktirilgan komissiya ko'rib chiqadi va baholaydi.
                            {stageQuota(app.currentStage) > 0
                                ? ` Top ${stageQuota(app.currentStage)} nomzod keyingi bosqichga o'tadi.`
                                : ''}
                            {' '}O'tkazish "Bosqichlar monitoringi" bo'limida bajariladi.
                        </p>
                    </div>
                </div>
            )}

            {!meta.terminal && !app.adminLocked && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                    {app.eligibility.blockingCount > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 font-semibold">
                                Bu talaba {app.eligibility.blockingCount} ta me'zonga javob bermaydi.
                                Tasdiqlash baribir mumkin, lekin sabab izohda qoldirilishi tavsiya etiladi.
                            </p>
                        </div>
                    )}
                    <textarea value={comment} onChange={e => setComment(e.target.value)}
                        placeholder="Qaror izohi (ixtiyoriy, tarixda saqlanadi)..."
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm h-20 resize-none" />
                    <div className="flex gap-3">
                        {APPLICATION_FLOW.indexOf(app.status) < APPLICATION_FLOW.length - 2 && (
                            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onAdvance(app)}>
                                Keyingi bosqichga
                            </Button>
                        )}
                        <Button variant="danger" className="flex-1" disabled={busy} onClick={() => onDecide(app, 'rejected')}>
                            Rad etish
                        </Button>
                        <Button variant="primary" className="flex-1 shadow-lg shadow-emerald-200" disabled={busy}
                            onClick={() => onDecide(app, 'approved')}>
                            Tasdiqlash
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScholarshipManagement;
