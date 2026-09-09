import React, { useState, useEffect, useMemo } from 'react';
import {
    BookOpen,
    Users,
    GraduationCap,
    Heart,
    Trophy,
    Calendar,
    Lightbulb,
    Theater,
    Dumbbell,
    Sparkles,
    TrendingUp,
    Upload,
    CheckCircle,
    Clock,
    XCircle,
    RotateCcw,
    CreditCard
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import ProgressBar from '../../components/common/ProgressBar';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/db';
import {
    needsConfirmation, getCriterionAction,
    INDEX_CRITERIA, INDEX_CRITERIA_ORDER,
    PLACEMENT_LEVEL_ORDER, PLACEMENT_PLACES, placementToPoints, APPEAL,
    SPORT_CLAIM_LEVELS,
} from '../../config/socialActivityIndex';
import CulturalVisitCapture from '../../components/student/CulturalVisitCapture';
import SportTeamApplication from '../../components/student/SportTeamApplication';
import StudentPassportCard from '../../components/student/StudentPassportCard';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { SOCIAL_REVIEWER_ROLES } from '../../constants/index.js';

// Decorative icon/color + demo detail snapshot for each ORIGINAL mezon key — the grid's name/maxPoints/
// description now come live from db.getSocialCriteriaCategories() (Sozlamalar -> Ijtimoiy faollik ->
// SocialCriteriaManager), but currentPoints/details here are still demo data (real per-student scoring is
// a separate, larger project — see SOCIAL_AUTOMATIC_SOURCES for the pieces that ARE already real). Keyed
// by category.key so edits/renames in the admin panel still resolve correctly; a category added later
// (key not in this map) falls back to DEFAULT_CRITERIA_VISUAL below instead of breaking.
const CRITERIA_VISUAL_META = {
    READING: { icon: BookOpen, currentPoints: 15, color: 'text-blue-500', bgColor: 'bg-blue-100', details: { booksRead: 8, booksTotal: 100, testsCompleted: 7, testsRequired: 8 } },
    CLUBS: { icon: Users, currentPoints: 18, color: 'text-purple-500', bgColor: 'bg-purple-100', details: { joined: 4, required: 5, verified: 3, pending: 1 } },
    ACADEMIC: { icon: GraduationCap, currentPoints: 8.5, color: 'text-green-500', bgColor: 'bg-green-100', details: { gpa: 3.8, maxGpa: 4.0, semester: '2023-2024 (Bahor)' } },
    DISCIPLINE: { icon: Heart, currentPoints: 4.5, color: 'text-pink-500', bgColor: 'bg-pink-100', details: { violations: 0, warnings: 1, commendations: 3 } },
    COMPETITIONS: { icon: Trophy, currentPoints: 6, color: 'text-yellow-500', bgColor: 'bg-yellow-100', details: { international: 0, national: 1, regional: 2, certificates: 3 } },
    ATTENDANCE: { icon: Calendar, currentPoints: 4.8, color: 'text-indigo-500', bgColor: 'bg-indigo-100', details: { attendanceRate: 96, totalClasses: 120, attended: 115, missed: 5 } },
    EDUCATION: { icon: Lightbulb, currentPoints: 9, color: 'text-orange-500', bgColor: 'bg-orange-100', details: { attended: 18, total: 20, activeParticipation: 15 } },
    VOLUNTEERING: { icon: Heart, currentPoints: 3, color: 'text-red-500', bgColor: 'bg-red-100', details: { activities: 3, hours: 24, verified: 2, pending: 1 } },
    CULTURAL: { icon: Theater, currentPoints: 4, color: 'text-teal-500', bgColor: 'bg-teal-100', details: { theater: 2, museum: 1, cinema: 3, parks: 2 } },
    SPORTS: { icon: Dumbbell, currentPoints: 4, color: 'text-cyan-500', bgColor: 'bg-cyan-100', details: { activities: 2, competitions: 1, verified: 2 } },
    OTHER: { icon: Sparkles, currentPoints: 3, color: 'text-violet-500', bgColor: 'bg-violet-100', details: { initiatives: 2, socialMedia: 1, verified: 1, pending: 1 } }
};
const DEFAULT_CRITERIA_VISUAL = { icon: Sparkles, color: 'text-gray-500', bgColor: 'bg-gray-100', details: {} };

const SocialActivityIndex = () => {
    const { user } = useAuth();
    const [selectedCriteria, setSelectedCriteria] = useState(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [myApplications, setMyApplications] = useState([]);
    const [uploadCriteriaKey, setUploadCriteriaKey] = useState('');
    const [uploadSubcategoryId, setUploadSubcategoryId] = useState('');
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadDescription, setUploadDescription] = useState('');
    const [uploadFileName, setUploadFileName] = useState('');

    // Dynamic categories/sub-categories (Settings -> Ijtimoiy faollik -> Mezonlar va sub-kategoriyalar) —
    // this is now the single source for the whole page (mezon grid, radar chart, "Mezon tanlang" dropdown),
    // originally seeded from the old SOCIAL_ACTIVITY_CRITERIA constant (buildSocialCriteriaCategoriesSeed
    // in db.js) but edits/additions/archiving in SocialCriteriaManager now show up live everywhere here.
    const [criteriaCategories, setCriteriaCategories] = useState([]);
    const [criteriaSubcategories, setCriteriaSubcategories] = useState([]);
    const [automaticPoints, setAutomaticPoints] = useState([]);
    useEffect(() => {
        setCriteriaCategories(db.getSocialCriteriaCategories());
        setCriteriaSubcategories(db.getSocialCriteriaSubcategories());
        setAutomaticPoints(db.getAutomaticSocialPointsForStudent(user.username));
    }, [user.username]);
    const selectedCategoryForUpload = criteriaCategories.find(c => c.key === uploadCriteriaKey);
    const subcategoriesForUpload = selectedCategoryForUpload
        ? criteriaSubcategories.filter(s => s.categoryId === selectedCategoryForUpload.id && s.isActive && !s.isArchived)
        : [];
    const selectedSubcategoryForUpload = subcategoriesForUpload.find(s => s.id === uploadSubcategoryId);

    // Ariza yuborilgach indeks ham qayta hisoblansin.
    const [applicationsVersion, setApplicationsVersion] = useState(0);

    const loadMyApplications = () => {
        setMyApplications(db.getSocialApplications().filter(a => a.studentId === user.username));
        setApplicationsVersion(v => v + 1);
    };

    useEffect(() => {
        loadMyApplications();
    }, [user.username]);

    const resetUploadForm = () => {
        setUploadCriteriaKey('');
        setUploadSubcategoryId('');
        setUploadTitle('');
        setUploadDescription('');
        setUploadFileName('');
    };

    const [submitError, setSubmitError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ASYNC: ariza endi bazaga yoziladi. Ilgari chaqiruv `await` siz edi va
    // yozuv serverga yetib bormasidan oyna yopilardi; xato bo'lsa esa talaba
    // hech narsa ko'rmasdi - ariza yuborilgandek tuyulardi.
    const handleSubmitApplication = async () => {
        if (!uploadCriteriaKey || !uploadTitle.trim()) return;
        setSubmitError(''); setSubmitting(true);
        try {
        await db.createSocialApplication({
            studentId: user.username,
            studentFullName: user.fullName,
            facultyAtSubmission: user.faculty,
            groupAtSubmission: user.group,
            courseAtSubmission: user.course,
            criteriaKey: uploadCriteriaKey,
            subcategoryId: uploadSubcategoryId || null,
            activityTitle: uploadTitle.trim(),
            description: uploadDescription.trim(),
            fileName: uploadFileName || null
        });
        loadMyApplications();
        resetUploadForm();
        setShowUploadModal(false);
        } catch (e) {
            setSubmitError(e?.message || 'Ariza yuborilmadi.');
        } finally {
            setSubmitting(false);
        }
    };

    // HAQIQIY INDEKS.
    //
    // Bu sahifa ilgari TO'QIMA raqam ko'rsatardi: mezonlarning ko'pida
    // `maxPoints * 0.7` degan zaxira qiymat, ba'zilarida esa qo'lda yozilgan
    // son (4.8 ball, 96% davomat). Ya'ni talaba o'z indeksini emas, namunani
    // ko'rardi - va bu metodikaga bag'ishlangan sahifada eng yomon xato edi.
    const index = useMemo(
        () => db.getSocialActivityIndex(user.username),
        [user.username, applicationsVersion]
    );

    const deadlines = useMemo(() => db.getIndexDeadlines(), []);
    const myEvidence = useMemo(
        () => db.getIndexEvidence(user.username),
        [user.username, applicationsVersion]
    );

    // Mezon kartasidagi amal - hujjat yuklash yoki tasdiqlashni so'rash.
    const [actionCriterion, setActionCriterion] = useState(null);
    const [evTitle, setEvTitle] = useState('');
    const [evDescription, setEvDescription] = useState('');
    const [evFileName, setEvFileName] = useState('');
    // 5-mezonning da'vosi: bosqich va o'rin.
    const [evLevel, setEvLevel] = useState('');
    const [evPlace, setEvPlace] = useState('');
    // Qaytarilgan hujjatni tahrirlash - yangi yozuv yaratilmaydi.
    const [editingEvidence, setEditingEvidence] = useState(null);
    const claimPoints = evLevel && evPlace ? placementToPoints(evLevel, evPlace) : null;
    const [actionBusy, setActionBusy] = useState(false);
    const [actionError, setActionError] = useState('');

    const runAction = async (fn) => {
        setActionBusy(true); setActionError('');
        try { await fn(); loadMyApplications(); }
        catch (e) { setActionError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setActionBusy(false); }
    };

    const resetEvidenceForm = () => {
        setEvTitle(''); setEvDescription(''); setEvFileName('');
        setEvLevel(''); setEvPlace(''); setEditingEvidence(null);
    };

    const submitEvidence = () => runAction(async () => {
        const claim = actionCriterion.key === 'COMPETITIONS'
            ? { level: evLevel, place: evPlace }
            // 10-mezonda faqat daraja ko'rsatiladi, o'rin yo'q.
            : actionCriterion.key === 'SPORTS'
                ? { level: evLevel }
                : null;
        // Qaytarilgan hujjat TAHRIRLANADI, yangisi yaratilmaydi - shunda
        // tyutor nima o'zgarganini ko'radi va tarix uzilib qolmaydi.
        if (editingEvidence) {
            await db.resubmitIndexEvidence(editingEvidence.id, user.username, {
                title: evTitle, description: evDescription,
                fileName: evFileName || null, claim,
            });
        } else {
            await db.submitIndexEvidence({
                studentId: user.username,
                criterionKey: actionCriterion.key,
                title: evTitle, description: evDescription,
                fileName: evFileName || null, claim,
            });
        }
        resetEvidenceForm();
        setActionCriterion(null);
    });

    // Qaytarilgan hujjatni tuzatishga ochish.
    const startEditEvidence = (criterion, ev) => {
        setActionCriterion(criterion);
        setEditingEvidence(ev);
        setEvTitle(ev.title || '');
        setEvDescription(ev.description || '');
        setEvFileName(ev.fileName || '');
        setEvLevel(ev.claim?.level || '');
        setEvPlace(ev.claim?.place ? String(ev.claim.place) : '');
        setActionError('');
    };

    // Talabaning e'tibori kerak bo'lgan hujjatlar: javob kutayotgan,
    // qaytarilgan yoki rad etilgan. Qabul qilinganlari bu ro'yxatda emas -
    // ular mezon kartochkasida ko'rinadi.
    const actionableEvidence = useMemo(
        () => myEvidence
            .filter(e => e.status !== 'accepted')
            .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
        [myEvidence]
    );
    const myAppeals = useMemo(
        () => db.getEvidenceAppeals(user.username),
        [user.username, applicationsVersion]
    );

    const [appealEvidence, setAppealEvidence] = useState(null);
    const [appealReason, setAppealReason] = useState('');
    const [passportOpen, setPassportOpen] = useState(false);

    const submitAppeal = () => runAction(async () => {
        await db.appealIndexEvidence({
            evidenceId: appealEvidence.id,
            studentId: user.username,
            reason: appealReason,
        });
        setAppealEvidence(null); setAppealReason('');
    });

    const byKey = useMemo(
        () => new Map(index.criteria.map(c => [c.key, c])),
        [index]
    );

    // Platformaning O'ZI bergan natijalar - talaba ularni qayta yuklamasligi
    // uchun ko'rsatiladi.
    const internalResults = useMemo(
        () => (byKey.get('COMPETITIONS')?.detail?.candidates || [])
            .filter(c => c.origin === 'internal'),
        [byKey]
    );

    // Mezonlar ro'yxati METODIKADAN olinadi, admin tahrirlaydigan ro'yxatdan emas.
    //
    // Ilgari sahifa `socialCriteriaCategories` ga tayanardi va u bo'sh bo'lsa
    // butun ro'yxat ko'rinmay qolardi ("0 ta mezon"). Bu jiddiy xato edi: 11 ta
    // mezon va ularning ballari 186-sonli buyruq bilan belgilangan - ular
    // ma'lumotlar bazasidagi yozuvga bog'liq bo'lishi mumkin emas.
    //
    // Admin ro'yxati endi faqat TAVSIF uchun ishlatiladi (agar mos yozuv bo'lsa).
    const categoryByKey = useMemo(
        () => new Map(criteriaCategories.map(c => [c.key, c])),
        [criteriaCategories]
    );

    const criteria = INDEX_CRITERIA_ORDER
        .map(key => {
            const official = INDEX_CRITERIA[key];
            const category = categoryByKey.get(key);
            const c = {
                key,
                id: category?.id || key,
                name: official.name,
                maxPoints: official.maxPoints,
                description: category?.description || official.evidence || '',
            };
            const meta = CRITERIA_VISUAL_META[c.key] || DEFAULT_CRITERIA_VISUAL;
            const computed = byKey.get(c.key);
            const confirmation = db.getSocialIndexAssessment(user.username, c.key);
            return {
                id: c.id,
                key: c.key,
                name: c.name,
                maxPoints: c.maxPoints,
                description: c.description,
                icon: meta.icon || DEFAULT_CRITERIA_VISUAL.icon,
                color: meta.color,
                bgColor: meta.bgColor,
                // `null` = hali hisoblab bo'lmaydi. Buni 0 deb ko'rsatish
                // "nol ball oldingiz" degan ma'no berardi - butunlay boshqa gap.
                currentPoints: computed?.points ?? null,
                missing: computed?.missing || null,
                detail: computed?.detail || null,
                sourceLabel: computed?.sourceLabel || null,
                // Har mezon tasdiq talab qilmaydi. 1 va 3-mezonlarda metodikaning
                // o'zi "avtomatik tarzda ball oladi" deydi - ularga
                // "Tasdiqlanmagan" yorlig'ini osish talabani bekorga kutdirardi.
                needsConfirm: needsConfirmation(c.key),
                confirmed: !!confirmation,
                confirmedBy: confirmation?.assessedBy || null,
                confirmedAt: confirmation?.assessedAt || null,
                action: getCriterionAction(c.key),
                requested: db.hasConfirmationRequest(user.username, c.key),
                evidenceCount: myEvidence.filter(e => e.criterionKey === c.key).length,
            };
        });

    const totalPoints = index.total;
    const maxTotalPoints = index.maxTotal;
    const percentage = (totalPoints / maxTotalPoints) * 100;

    const getActivityStatus = (score) => {
        if (score >= 90) return { label: 'Alo', variant: 'excellent' };
        if (score >= 70) return { label: 'Yaxshi', variant: 'good' };
        if (score >= 50) return { label: 'O\'rtacha', variant: 'average' };
        return { label: 'Past', variant: 'poor' };
    };

    const status = getActivityStatus(percentage);

    // "Oylik dinamika" grafigi OLIB TASHLANDI: u kodga yozib qo'yilgan beshta
    // raqamdan iborat edi (65, 68, 72, 74, 78) va har talabaga bir xil
    // ko'rinardi. Haqiqiy trend uchun indeksni hisobot davri yakunida
    // muhrlab boruvchi mexanizm kerak - u hali yo'q.

    // Radar - faqat HISOBLANGAN mezonlardan. Hisoblanmagan mezon markazga
    // (0 ga) tushib, "nol ball oldi" degan ma'no berardi.
    const radarData = criteria
        .filter(c => c.currentPoints != null)
        .map(c => ({
            subject: c.name.split(' ')[0],
            value: (c.currentPoints / c.maxPoints) * 100,
            fullMark: 100
        }));

    // Real submissions awaiting the student's attention (Pending or Returned)
    const pendingVerifications = myApplications
        .filter(a => a.status === 'Pending' || a.status === 'Returned')
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-500 to-primary-700 rounded-2xl p-8 text-white shadow-xl flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Ijtimoiy Faollik Indeksi</h1>
                    <p className="text-primary-100">
                        Universitet hayotidagi faolligingizni {criteria.length} ta mezon orqali kuzating
                    </p>
                </div>
                {/* Pasport ATAYLAB oynada: bu sahifa skoring uchun, pasport esa
                    kerak bo'lganda qaraladigan ma'lumot. */}
                <button
                    type="button"
                    onClick={() => setPassportOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-sm font-bold text-white transition-colors"
                >
                    <CreditCard size={15} /> Talaba pasporti
                </button>
            </div>

            {/* Overall Score */}
            <Card className="border-2 border-primary-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Umumiy ko'rsatkich</h2>
                        <div className="flex items-center space-x-3">
                            <span className="text-5xl font-bold gradient-text">{totalPoints.toFixed(1)}</span>
                            <span className="text-2xl text-gray-400">/ {maxTotalPoints}</span>
                            <Badge variant={status.variant} size="lg">
                                {status.label}
                            </Badge>
                        </div>
                    </div>
                    <div className="mt-4 md:mt-0 grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-2xl font-bold text-primary-500">12</p>
                            <p className="text-sm text-gray-600">Fakultetda</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-primary-500">5</p>
                            <p className="text-sm text-gray-600">Kursda</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-green-500">+12%</p>
                            <p className="text-sm text-gray-600">O'sish</p>
                        </div>
                    </div>
                </div>
                <ProgressBar value={percentage} max={100} color="auto" size="lg" />
            </Card>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-6">
                {/* Radar - faqat hisoblangan mezonlar */}
                <Card
                    title="Mezonlar bo'yicha tahlil"
                    subtitle={`${radarData.length} ta hisoblangan mezon`}
                >
                    <ResponsiveContainer width="100%" height={250}>
                        <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" />
                            <PolarRadiusAxis domain={[0, 100]} />
                            <Radar
                                name="Faollik"
                                dataKey="value"
                                stroke="#4F46E5"
                                fill="#4F46E5"
                                fillOpacity={0.6}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* Pending Verifications */}
            {pendingVerifications.length > 0 && (
                <Card title="Tasdiqlash kutilmoqda" className="border-l-4 border-l-yellow-500">
                    <div className="space-y-3">
                        {pendingVerifications.map(item => {
                            const isReturned = item.status === 'Returned';
                            return (
                                <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg ${isReturned ? 'bg-orange-50' : 'bg-yellow-50'}`}>
                                    <div className="flex items-center">
                                        {isReturned
                                            ? <RotateCcw className="w-5 h-5 text-orange-500 mr-3" />
                                            : <Clock className="w-5 h-5 text-yellow-500 mr-3" />}
                                        <div>
                                            <p className="font-medium text-gray-900">{item.activityTitle}</p>
                                            <p className="text-sm text-gray-600">
                                                {criteria.find(c => c.key === item.criteriaKey)?.name} • {new Date(item.submittedAt).toLocaleDateString('uz-UZ')}
                                            </p>
                                            {isReturned && item.reviewerComment && (
                                                <p className="text-xs text-orange-700 mt-1">Izoh: {item.reviewerComment}</p>
                                            )}
                                        </div>
                                    </div>
                                    <Badge variant={isReturned ? 'warning' : 'info'}>
                                        {isReturned ? 'Qaytarildi' : 'Kutilmoqda'}
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Avtomatik hisoblangan ballar — REAL, live-computed (db.getAutomaticSocialPointsForStudent),
                hech qanday saqlangan/uydirilgan qiymat emas. Faqat admin "Avtomatik" deb sozlagan
                sub-kategoriyalar ko'rinadi; hozircha ular ichida faqat "Klub davomati" haqiqiy hisoblanadi
                (isWired:true) — qolganlari (Musobaqa natijalari, Klub a'zoligi, Darslar davomati) ochiq
                "hali ulanmagan" deb ko'rsatiladi, pastdagi mezon kartochkalaridagi (hali mock) raqamlardan
                mustaqil. */}
            {automaticPoints.length > 0 && (
                <Card className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Avtomatik hisoblangan ballar</h2>
                    <p className="text-sm text-gray-500 mb-4">Sozlamalarda "Avtomatik" deb belgilangan sub-kategoriyalar uchun real ma'lumotdan hisoblangan natija</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {automaticPoints.map(ap => (
                            <div key={ap.subcategoryId} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">{ap.subcategoryName}</p>
                                    <p className="text-xs text-gray-500">{ap.categoryName}</p>
                                </div>
                                {ap.isWired ? (
                                    <Badge variant="success">{ap.value} / {ap.maxPoints} ball</Badge>
                                ) : (
                                    <Badge variant="default">Hali ulanmagan</Badge>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Criteria Grid */}
            {/* MUDDATLAR — metodikaning uchta sanasi.
                Talaba "qachongacha ulgurishim kerak" degan savolga javob
                topmasa, hujjat yuklash oqimi ishlamaydi. */}
            <Card>
                <div className="p-5">
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <Calendar size={16} className="text-indigo-500" /> Muddatlar
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {deadlines.map(d => (
                            <div
                                key={d.key}
                                className={`px-3 py-2.5 rounded-xl border ${
                                    d.passed
                                        ? 'border-gray-100 bg-gray-50 text-gray-400'
                                        : d.daysLeft <= 14
                                            ? 'border-amber-200 bg-amber-50'
                                            : 'border-gray-100 bg-white'
                                }`}
                            >
                                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                                    {new Date(d.date).toLocaleDateString('uz-UZ', {
                                        day: '2-digit', month: 'long', year: 'numeric',
                                    })}
                                </p>
                                <p className={`text-xs font-semibold mt-0.5 ${d.passed ? '' : 'text-gray-800'}`}>
                                    {d.label}
                                </p>
                                <p className="text-[11px] mt-1">
                                    {d.passed
                                        ? <span className="text-gray-400">Muddat o'tdi</span>
                                        : <span className={d.daysLeft <= 14 ? 'font-bold text-amber-700' : 'text-gray-500'}>
                                            {d.daysLeft} kun qoldi
                                        </span>}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            {/* HUJJATLARIM — javob kutayotgan yoki javob kelgan hujjatlar.
                Qaytarilgan hujjat tuzatiladi, rad etilganiga e'tiroz beriladi.
                Bu ikkisi bir xil emas: birinchisi "xatong bor", ikkinchisi
                "qabul qilinmaydi". */}
            {actionableEvidence.length > 0 && (
                <Card title="Hujjatlarim" className="border-l-4 border-l-indigo-500">
                    <div className="space-y-3">
                        {actionableEvidence.map(ev => {
                            const criterion = criteria.find(c => c.key === ev.criterionKey);
                            const appeal = myAppeals.find(a => a.evidenceId === ev.id);
                            return (
                                <div
                                    key={ev.id}
                                    className={`p-3 rounded-xl border ${
                                        ev.status === 'returned' ? 'border-amber-200 bg-amber-50'
                                            : ev.status === 'rejected' ? 'border-rose-200 bg-rose-50'
                                                : 'border-gray-100 bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900 text-sm">{ev.title}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {criterion?.name}
                                                {ev.claim?.level && (
                                                    <> • {INDEX_CRITERIA.COMPETITIONS.placement[ev.claim.level]?.label},{' '}
                                                        {ev.claim.place}-o'rin → {ev.claim.points} ball</>
                                                )}
                                            </p>
                                            {ev.comment && (
                                                <p className="text-xs text-gray-700 mt-1.5">
                                                    <span className="font-semibold">{ev.reviewedBy || 'Mas\'ul'}:</span> {ev.comment}
                                                </p>
                                            )}
                                        </div>
                                        <Badge
                                            variant={ev.status === 'pending' ? 'info'
                                                : ev.status === 'returned' ? 'warning' : 'danger'}
                                            size="sm"
                                        >
                                            {ev.status === 'pending' ? 'Ko\'rib chiqilmoqda'
                                                : ev.status === 'returned' ? 'Qaytarildi' : 'Rad etildi'}
                                        </Badge>
                                    </div>

                                    {ev.status === 'returned' && (
                                        <button
                                            type="button"
                                            onClick={() => startEditEvidence(criterion, ev)}
                                            className="mt-2 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold hover:bg-amber-200"
                                        >
                                            Tuzatib qayta yuborish
                                        </button>
                                    )}

                                    {ev.status === 'rejected' && (
                                        appeal ? (
                                            <p className="mt-2 text-xs font-semibold text-gray-600">
                                                {appeal.status === 'pending'
                                                    ? "E'tiroz yuborilgan — ko'rib chiqilmoqda"
                                                    : appeal.decision === 'overturned'
                                                        ? "E'tiroz qanoatlantirildi"
                                                        : `E'tiroz rad etildi: ${appeal.decisionComment}`}
                                            </p>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => { setAppealEvidence(ev); setAppealReason(''); setActionError(''); }}
                                                className="mt-2 px-3 py-1.5 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold hover:bg-rose-200"
                                            >
                                                E'tiroz bildirish ({APPEAL.submitWorkingDays} ish kuni ichida)
                                            </button>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* 9-mezon: tashrif joyda qayd etiladi, hisobot yozilmaydi. */}
            <CulturalVisitCapture />

            {/* 10-mezon: terma jamoaga o'zi ariza berishi mumkin. */}
            <SportTeamApplication />

            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Barcha mezonlar</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {criteria.map((criterion) => {
                        const hasPoints = criterion.currentPoints != null;
                        const percentage = hasPoints ? (criterion.currentPoints / criterion.maxPoints) * 100 : 0;
                        return (
                            <Card
                                key={criterion.id}
                                hover
                                onClick={() => setSelectedCriteria(criterion)}
                                className="cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`w-12 h-12 ${criterion.bgColor} rounded-lg flex items-center justify-center`}>
                                        <criterion.icon className={`w-6 h-6 ${criterion.color}`} />
                                    </div>
                                    {/* Hisoblab bo'lmagan mezon "0" emas, "—" bilan
                                        ko'rsatiladi: nol ball olish va hali
                                        hisoblanmaslik butunlay boshqa narsa. */}
                                    <span className={`text-lg font-bold ${hasPoints ? 'text-gray-900' : 'text-gray-300'}`}>
                                        {hasPoints ? criterion.currentPoints : '—'}
                                        <span className="text-gray-400">/{criterion.maxPoints}</span>
                                    </span>
                                </div>
                                <h3 className="font-semibold text-gray-900 mb-1">{criterion.name}</h3>

                                {hasPoints ? (
                                    <div className="mb-3">
                                        {criterion.needsConfirm ? (
                                            <Badge variant={criterion.confirmed ? 'success' : 'warning'} size="sm">
                                                {criterion.confirmed ? 'Tasdiqlangan' : 'Tasdiqlanmagan'}
                                            </Badge>
                                        ) : (
                                            <Badge variant="info" size="sm">Avtomatik</Badge>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 mb-3">
                                        {criterion.missing || "Ma'lumot yo'q"}
                                    </p>
                                )}

                                <ProgressBar
                                    value={percentage}
                                    max={100}
                                    color="auto"
                                    size="sm"
                                    showPercentage={false}
                                />

                                {/* AMAL — "statistika" emas, "nima qilishim kerak".
                                    Amal talab qilmaydigan mezonda ham javob turadi,
                                    aks holda talaba nimadir qilishi kerakmi yoki
                                    yo'qmi bilmay qolardi. */}
                                <div className="mt-3 pt-3 border-t border-gray-50" onClick={e => e.stopPropagation()}>
                                    <p className="text-[11px] text-gray-400 leading-relaxed mb-2">
                                        {criterion.action.hint}
                                    </p>

                                    {criterion.action.type === 'link' && (
                                        <Link
                                            to={criterion.action.to}
                                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                                        >
                                            {criterion.action.label} →
                                        </Link>
                                    )}

                                    {criterion.action.type === 'upload' && (
                                        <button
                                            type="button"
                                            onClick={() => { setActionCriterion(criterion); setActionError(''); }}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                                        >
                                            <Upload size={12} /> {criterion.action.label}
                                        </button>
                                    )}

                                    {criterion.action.type === 'remind' && (
                                        criterion.confirmed ? (
                                            <span className="text-[11px] font-semibold text-emerald-600">Tasdiqlangan</span>
                                        ) : criterion.requested ? (
                                            <span className="text-[11px] font-semibold text-gray-400">
                                                So'rov yuborilgan — javob kutilmoqda
                                            </span>
                                        ) : criterion.currentPoints != null ? (
                                            <button
                                                type="button"
                                                disabled={actionBusy}
                                                onClick={() => runAction(() => db.requestCriterionConfirmation({
                                                    studentId: user.username, criterionKey: criterion.key,
                                                }))}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 text-xs font-bold text-amber-700 hover:bg-amber-100"
                                            >
                                                <Bell size={12} /> {criterion.action.label}
                                            </button>
                                        ) : null
                                    )}

                                    {criterion.evidenceCount > 0 && (
                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                            {criterion.evidenceCount} ta hujjat yuborilgan
                                        </p>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Asoslovchi hujjat yuklash — metodikaning 5-bandi.
                Bu YANGI oqim: hujjat indeksning o'z dalil qatlamiga tushadi,
                eski ariza ledgeriga emas. */}
            <Modal
                isOpen={!!actionCriterion}
                onClose={() => { setActionCriterion(null); resetEvidenceForm(); setActionError(''); }}
                title={actionCriterion
                    ? `${actionCriterion.name} — ${editingEvidence ? 'hujjatni tuzatish' : 'hujjat yuklash'}`
                    : ''}
            >
                {actionCriterion && (
                    <div className="space-y-4">
                        <p className="text-xs text-gray-500">{actionCriterion.action.hint}</p>

                        {/* 5-MEZON: BOSQICH VA O'RIN.
                            Ball TANLANMAYDI - talaba faqat natijasini ko'rsatadi,
                            ball 186-sonli buyruqning jadvalidan chiqadi. */}
                        {/* TIZIMDAGI HUJJATLAR — platformaning O'ZI bergan diplomlar.
                            Ular allaqachon hisobga olingan: tizim ularni bayonnoma
                            asosida bergan, shuning uchun tasdiq ham talab qilinmaydi.
                            Buni ko'rsatmasak, talaba o'sha diplomni qayta yuklardi va
                            tyutor keraksiz ish qilardi. */}
                        {actionCriterion.key === 'COMPETITIONS' && internalResults.length > 0 && (
                            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                <p className="text-xs font-bold text-emerald-800">
                                    Platformada olingan natijalaringiz allaqachon hisobga olingan
                                </p>
                                <div className="mt-2 space-y-1">
                                    {internalResults.map(r => (
                                        <p key={r.documentId} className="text-[11px] text-gray-700">
                                            • {INDEX_CRITERIA.COMPETITIONS.placement[r.level]?.label},{' '}
                                            {r.place}-o'rin → <b>{r.points} ball</b>
                                        </p>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">
                                    Bu diplomlarni qayta yuklash <b>shart emas</b> — ularni tizimning o'zi
                                    bergan, shuning uchun tasdiqlash ham talab qilinmaydi. Bu yerga faqat
                                    <b> tashqarida</b> olingan natijalaringizni yuklang.
                                </p>
                            </div>
                        )}

                        {actionCriterion.key === 'COMPETITIONS' && (
                            <div className="space-y-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Bosqich *</label>
                                        <select
                                            value={evLevel} onChange={e => setEvLevel(e.target.value)}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                                        >
                                            <option value="">Tanlang...</option>
                                            {PLACEMENT_LEVEL_ORDER.map(key => (
                                                <option key={key} value={key}>
                                                    {INDEX_CRITERIA.COMPETITIONS.placement[key].label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">O'rin *</label>
                                        <select
                                            value={evPlace} onChange={e => setEvPlace(e.target.value)}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                                        >
                                            <option value="">Tanlang...</option>
                                            {PLACEMENT_PLACES.map(p => (
                                                <option key={p} value={String(p)}>{p}-o'rin</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {claimPoints != null && (
                                    <p className="text-sm font-bold text-indigo-700">
                                        Bu natija uchun {claimPoints} ball
                                        <span className="block text-[11px] font-normal text-gray-500 mt-0.5">
                                            Ball miqdorini siz belgilamaysiz — u metodika jadvalidan olinadi.
                                            Tyutor faqat hujjat haqiqiyligini va tanlovingiz to'g'riligini tekshiradi.
                                        </span>
                                    </p>
                                )}
                                {/* Eng yuqori natija qoidasi - yashirilmaydi, aks holda
                                    talaba "hujjatlarim yo'qolibdi" deb o'ylaydi. */}
                                <p className="text-[11px] text-gray-500 border-t border-indigo-100 pt-2">
                                    Bir nechta hujjat yuklashingiz mumkin, lekin ball <b>eng yuqori natija</b>
                                    {' '}bo'yicha hisoblanadi — metodikada natijalarni qo'shish qoidasi yo'q.
                                </p>
                            </div>
                        )}

                        {/* 10-MEZON: hujjat QAYSI darajani tasdiqlaydi.
                            Ball da'vodan chiqadi, talaba raqam yozmaydi. */}
                        {actionCriterion.key === 'SPORTS' && (
                            <div className="p-3 bg-cyan-50 border border-cyan-100 rounded-xl space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">
                                    Hujjat nimani tasdiqlaydi *
                                </label>
                                <select
                                    value={evLevel} onChange={e => setEvLevel(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                                >
                                    <option value="">Tanlang...</option>
                                    {SPORT_CLAIM_LEVELS.map(key => {
                                        const part = INDEX_CRITERIA.SPORTS.parts.find(p => p.key === key);
                                        return (
                                            <option key={key} value={key}>
                                                {part?.label} — {part?.points} ball
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-[11px] text-gray-500">
                                    Universitetdagi sport klubidagi davomatingiz <b>avtomatik</b> hisoblanadi —
                                    bu yerga faqat <b>tashqi</b> a'zolik hujjatini yuklang. A'zolik turlaridan
                                    eng yuqorisi olinadi, ular qo'shilmaydi.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Hujjat nomi *</label>
                            <input
                                type="text" value={evTitle} onChange={e => setEvTitle(e.target.value)}
                                placeholder="Masalan: Respublika olimpiadasi diplomi, 2-o'rin"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Izoh</label>
                            <textarea
                                rows={3} value={evDescription} onChange={e => setEvDescription(e.target.value)}
                                placeholder="Qachon, qayerda, qanday natija..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Fayl</label>
                            <input
                                type="file"
                                onChange={e => setEvFileName(e.target.files?.[0]?.name || '')}
                                className="w-full text-xs"
                            />
                            {/* Fayl BAYTLARI saqlanmaydi - platformada fayl ombori yo'q.
                                Nomi qayd etiladi, asl nusxa mas'ulga taqdim etiladi.
                                Buni yashirish "yukladim, joyida" degan yolg'on taassurot
                                berardi. */}
                            <p className="text-[11px] text-gray-400 mt-1">
                                Fayl nomi qayd etiladi. Asl nusxani mas'ulga taqdim etishingiz kerak bo'lishi mumkin.
                            </p>
                        </div>

                        {actionError && (
                            <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                {actionError}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <Button
                                variant="outline" className="flex-1"
                                onClick={() => { setActionCriterion(null); resetEvidenceForm(); }}
                            >
                                Bekor qilish
                            </Button>
                            <Button
                                variant="primary" className="flex-1"
                                disabled={actionBusy || !evTitle.trim()
                                    || (actionCriterion.key === 'COMPETITIONS' && (!evLevel || !evPlace))
                                    || (actionCriterion.key === 'SPORTS' && !evLevel)}
                                onClick={submitEvidence}
                            >
                                {actionBusy
                                    ? 'Yuborilmoqda...'
                                    : editingEvidence ? 'Qayta yuborish' : 'Yuborish'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* TALABA PASPORTI — alohida oynada. */}
            <Modal
                isOpen={passportOpen}
                onClose={() => setPassportOpen(false)}
                title="Talaba pasporti"
                size="lg"
            >
                <StudentPassportCard studentId={user.username} />
            </Modal>

            {/* E'TIROZ — metodikaning apellyatsiya qoidasi.
                E'tirozni rad etgan mas'ulning O'ZI emas, boshqa odam ko'radi. */}
            <Modal
                isOpen={!!appealEvidence}
                onClose={() => { setAppealEvidence(null); setActionError(''); }}
                title="E'tiroz bildirish"
            >
                {appealEvidence && (
                    <div className="space-y-4">
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                            <p className="text-sm font-semibold text-gray-900">{appealEvidence.title}</p>
                            <p className="text-xs text-gray-600 mt-1">
                                <span className="font-semibold">Rad etish sababi:</span> {appealEvidence.comment}
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                                Nega rozi emassiz? *
                            </label>
                            <textarea
                                rows={4} value={appealReason} onChange={e => setAppealReason(e.target.value)}
                                placeholder="Hujjatingiz haqiqiyligini va tanlagan bosqich/o'rin to'g'riligini asoslang..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>

                        <p className="text-[11px] text-gray-400">
                            E'tiroz rad etish sanasidan boshlab {APPEAL.submitWorkingDays} ish kuni ichida
                            beriladi va uni rad etgan mas'uldan boshqa shaxs ko'rib chiqadi.
                        </p>

                        {actionError && (
                            <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                {actionError}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setAppealEvidence(null)}>
                                Bekor qilish
                            </Button>
                            <Button
                                variant="primary" className="flex-1"
                                disabled={actionBusy || !appealReason.trim()}
                                onClick={submitAppeal}
                            >
                                {actionBusy ? 'Yuborilmoqda...' : 'Yuborish'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Criteria Detail Modal */}
            {selectedCriteria && (
                <Modal
                    isOpen={!!selectedCriteria}
                    onClose={() => setSelectedCriteria(null)}
                    title={selectedCriteria.name}
                    size="lg"
                >
                    <div className="space-y-6">
                        {/* Score */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <p className="text-sm text-gray-600 mb-1">Joriy ball</p>
                                <p className="text-3xl font-bold gradient-text">
                                    {selectedCriteria.currentPoints ?? '—'} / {selectedCriteria.maxPoints}
                                </p>
                                {selectedCriteria.currentPoints != null && (
                                    <p className="mt-1.5">
                                        {selectedCriteria.needsConfirm ? (
                                            <Badge variant={selectedCriteria.confirmed ? 'success' : 'warning'} size="sm">
                                                {selectedCriteria.confirmed
                                                    ? `Tasdiqlagan: ${selectedCriteria.confirmedBy || 'mas\'ul'}`
                                                    : 'Tasdiqlanmagan'}
                                            </Badge>
                                        ) : (
                                            <Badge variant="info" size="sm">
                                                Avtomatik — tasdiqlash talab qilinmaydi
                                            </Badge>
                                        )}
                                    </p>
                                )}
                            </div>
                            <div className={`w-16 h-16 ${selectedCriteria.bgColor} rounded-lg flex items-center justify-center`}>
                                <selectedCriteria.icon className={`w-8 h-8 ${selectedCriteria.color}`} />
                            </div>
                        </div>

                        {/* MA'LUMOTNOMA — ballning orqasidagi dalil.
                            Talaba "nega shuncha ball?" degan savolga javobni shu
                            yerdan topadi: qaysi klub, nechta tadbir, necha foiz. */}
                        {selectedCriteria.key === 'CLUBS' && selectedCriteria.detail?.perClub?.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-3">Ma'lumotnoma</h4>
                                <div className="overflow-x-auto rounded-xl border border-gray-100">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-gray-50 text-[10px] uppercase text-gray-400">
                                                <th className="text-left px-3 py-2 font-bold">Klub</th>
                                                <th className="text-right px-3 py-2 font-bold">Tadbir</th>
                                                <th className="text-right px-3 py-2 font-bold">Qatnashgan</th>
                                                <th className="text-right px-3 py-2 font-bold">Foiz</th>
                                                <th className="text-right px-3 py-2 font-bold">Ball</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedCriteria.detail.perClub.map(r => (
                                                <tr key={r.clubId} className="border-t border-gray-50">
                                                    <td className="px-3 py-2">
                                                        <span className="font-semibold text-gray-800">{r.clubName}</span>
                                                        {!r.enoughEvents && (
                                                            <span className="block text-[10px] text-amber-700">
                                                                Klub kam tadbir o'tkazgan — hisobga olinmaydi
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{r.held}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{r.attended}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.percent}%</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                                                        {r.enoughEvents ? Math.round(r.percent / 10) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Ball yo'nalish kesimida hisoblanadi: har yo'nalish bo'yicha eng yuqori
                                    foizli klub olinadi, yig'indi {selectedCriteria.maxPoints} ball bilan chegaralanadi.
                                </p>
                            </div>
                        )}

                        {/* Boshqa mezonlar uchun - hisob manbai */}
                        {selectedCriteria.key !== 'CLUBS' && selectedCriteria.sourceLabel && (
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-2">Hisob asosi</h4>
                                <p className="text-sm text-gray-600">{selectedCriteria.sourceLabel}</p>
                            </div>
                        )}

                        {selectedCriteria.currentPoints == null && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <p className="text-xs font-semibold text-amber-800">
                                    {selectedCriteria.missing || "Bu mezon bo'yicha ma'lumot yo'q"}
                                </p>
                            </div>
                        )}

                        {/* Upload Document */}
                        <div>
                            <Button
                                variant="primary"
                                className="w-full"
                                icon={Upload}
                                onClick={() => {
                                    setUploadCriteriaKey(selectedCriteria.key || '');
                                    setShowUploadModal(true);
                                    setSelectedCriteria(null);
                                }}
                            >
                                Hujjat yuklash
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Upload Modal */}
            <Modal
                isOpen={showUploadModal}
                onClose={() => { setShowUploadModal(false); resetUploadForm(); }}
                title="Hujjat yuklash"
                size="md"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Mezon tanlang
                        </label>
                        <select
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            value={uploadCriteriaKey}
                            onChange={(e) => { setUploadCriteriaKey(e.target.value); setUploadSubcategoryId(''); }}
                        >
                            <option value="">Tanlang...</option>
                            {criteria.map((c) => (
                                <option key={c.key} value={c.key}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sub-kategoriya — faqat tanlangan mezonda haqiqatan sub-kategoriya sozlangan bo'lsa
                        ko'rinadi (Sozlamalar -> Ijtimoiy faollik -> Mezonlar va sub-kategoriyalar). Ixtiyoriy —
                        hali sub-kategoriya sozlanmagan mezonlar avvalgidek to'g'ridan-to'g'ri ariza qabul qiladi. */}
                    {subcategoriesForUpload.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Sub-kategoriya
                            </label>
                            <select
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                value={uploadSubcategoryId}
                                onChange={(e) => setUploadSubcategoryId(e.target.value)}
                            >
                                <option value="">Tanlanmagan</option>
                                {subcategoriesForUpload.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            {selectedSubcategoryForUpload && (
                                <p className="text-xs text-gray-400 mt-1.5">
                                    {selectedSubcategoryForUpload.calculationMethod === 'manual'
                                        ? `Ko'rib chiqadi: ${SOCIAL_REVIEWER_ROLES.find(r => r.key === selectedSubcategoryForUpload.reviewerRole)?.label || selectedSubcategoryForUpload.reviewerRole}`
                                        : "Bu sub-kategoriya avtomatik hisoblanadi — ariza shart emas, real ball pastdagi \"Avtomatik hisoblangan ballar\" bo'limida ko'rinadi."}
                                </p>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Faoliyat nomi
                        </label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            placeholder="Masalan: Sport musobaqasida 1-o'rin"
                            value={uploadTitle}
                            onChange={(e) => setUploadTitle(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Faoliyat tavsifi
                        </label>
                        <textarea
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            rows="3"
                            placeholder="Faoliyat haqida qisqacha ma'lumot..."
                            value={uploadDescription}
                            onChange={(e) => setUploadDescription(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Hujjat yuklash
                        </label>
                        <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-500 transition-colors cursor-pointer block">
                            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">
                                {uploadFileName || 'Faylni tanlash uchun bosing'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG (max 5MB)</p>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="hidden"
                                onChange={(e) => setUploadFileName(e.target.files?.[0]?.name || '')}
                            />
                        </label>
                    </div>

                    {/* XATO KO'RINISHI SHART: yozuv endi serverga ketadi va
                        u yerda rad etilishi mumkin (jadval yo'q, tarmoq uzildi).
                        Xabar bo'lmasa talaba ariza yuborildi deb o'ylab ketardi. */}
                    {submitError && (
                        <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                            {submitError}
                        </p>
                    )}
                    <div className="flex space-x-3">
                        <Button variant="secondary" className="flex-1" disabled={submitting} onClick={() => { setShowUploadModal(false); resetUploadForm(); }}>
                            Bekor qilish
                        </Button>
                        <Button
                            variant="primary"
                            className="flex-1"
                            disabled={!uploadCriteriaKey || !uploadTitle.trim() || submitting}
                            onClick={handleSubmitApplication}
                        >
                            {submitting ? 'Yuborilmoqda...' : 'Yuborish'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default SocialActivityIndex;
