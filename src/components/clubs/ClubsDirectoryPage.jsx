import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Plus, LayoutGrid, List, Upload, FileText, X, FilePlus2, ClipboardList, Sparkles } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db, POSITION_TYPE_LABELS } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { DIRECTIONS, getClubDirection } from '../../config/clubDirections';
import { APPLICATION_STATUS } from '../../config/clubRegistration';
import { slugify } from '../../utils/slug';
import { getClubsRoutes } from '../../utils/clubsRoutes';
import { TOURNAMENT_FILE_UPLOAD } from '../../constants';
import ClubCard from './ClubCard';
import ClubMediaUploader from './ClubMediaUploader';
import ClubsListView from './ClubsListView';
import Pagination from '../common/Pagination';

const PAGE_SIZE_OPTIONS = [10, 20, 30, 100, 'all'];

// Role-spanning "public directory" — mounted at /student/clubs, /admin/clubs-directory and
// /management/clubs-directory (see App.jsx). The route base is derived from the current URL so
// "Profil"/"Jamoalar" links stay within the viewer's own role tree.
const ClubsDirectoryPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const routes = getClubsRoutes(location.pathname);
    const isAdmin = user?.role === 'ADMINISTRATOR';
    const isStudent = user?.role === 'TALABA';

    // "+ Klub" endi ikkiga bo'linadi: arizadan yoki bevosita. Fork band 26
    // spec'iga ko'ra - avvalgi "+Klub" tugmasi o'zgarmaydi, faqat bosilganda
    // avval shu tanlov chiqadi.
    const [isCreateChoiceOpen, setIsCreateChoiceOpen] = useState(false);
    const [isConvertOpen, setIsConvertOpen] = useState(false);
    const [convertBusy, setConvertBusy] = useState(false);
    const [convertError, setConvertError] = useState('');
    const approvedApplications = useMemo(
        () => isAdmin
            ? db.getClubApplications({ status: APPLICATION_STATUS.APPROVED }).filter(a => !a.resultingClubId)
            : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isAdmin, isConvertOpen]
    );
    const handleConvertApplication = async (applicationId) => {
        setConvertBusy(true); setConvertError('');
        try {
            const club = await db.convertApplicationToClub({ applicationId, createdBy: user?.username });
            setIsConvertOpen(false);
            navigate(`${routes.clubBase}/${club.id}`);
        } catch (e) {
            setConvertError(e?.message || 'Klub yaratishda xatolik yuz berdi.');
        } finally {
            setConvertBusy(false);
        }
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [directionFilter, setDirectionFilter] = useState('');
    // Qamrov: mening klublarim / barcha klublar. Yo'nalish filtridan ALOHIDA
    // turadi va u bilan birga ishlaydi - "mening sport klublarim" ham
    // so'ralishi mumkin.
    //
    // `null` = foydalanuvchi hali tanlamagan. Sukut qiymat SHU YERDA
    // qotirilmaydi, chunki u a'zolikka bog'liq: a'zosi bor odamga o'z
    // klublari, a'zoligi yo'q odamga (masalan administrator) butun ro'yxat
    // ochilishi kerak. `useState` esa faqat BIR MARTA ishlaydi va o'sha
    // paytda a'zolik ro'yxati hali hisoblanmagan bo'lishi mumkin - shuning
    // uchun qiymat har chizishda hosil qilinadi (pastda `effectiveScope`).
    const [scope, setScope] = useState(null); // null | 'all' | 'mine'
    const [viewMode, setViewMode] = useState('grid'); // 'grid' (katalog) | 'list' (ro'yxat)
    // Defaults to 'all' — the whole roster stays visible in one screen exactly like before this control
    // existed; paging is opt-in for whoever wants 10/20/30/100-at-a-time instead.
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState('all');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', description: '', category: DIRECTIONS[0] });
    // Kept out of `formData` deliberately — that object is spread straight into db.createClub(...), and
    // a raw File object has no business ending up on the persisted club record.
    const [nizomFile, setNizomFile] = useState(null);
    const [nizomError, setNizomError] = useState('');
    // Logo va muqova - klub yaratilgunicha faqat TANLANADI. Fayl yo'li
    // klub identifikatoriga bog'langan, u esa hali mavjud emas.
    const [logoFile, setLogoFile] = useState(null);
    const [bannerFile, setBannerFile] = useState(null);
    // Arxivlangan klublar - faqat administrator uchun va faqat so'ralganda.
    const [showArchived, setShowArchived] = useState(false);
    const nizomInputRef = useRef(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const students = useMemo(() => db.getMockStudents(), []);
    const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

    const rankedClubs = useMemo(() => {
        // eslint-disable-next-line no-unused-expressions
        refreshKey; showArchived;
        // Arxivlangan klublar standart bo'yicha CHIQARILADI. Administrator
        // ularni ko'rsatish tugmasi orqali ko'ra oladi - butunlay yashirish
        // ularni topib bo'lmaydigan qilardi.
        return db.getRankedClubs({ includeArchived: showArchived }).map(club => {
            const members = db.getClubMembers(club.id);
            const coordinatorMembership = members.find(m => m.role === 'head_coordinator') || members.find(m => m.role === 'coordinator');
            return {
                ...club,
                direction: getClubDirection(club.category),
                teamCount: db.getClubTeams(club.id).length,
                eventCount: db.getClubEvents(club.id).length,
                competitionCount: db.getClubCompetitions(club.id).length,
                achievementCount: db.getClubAchievements(club.id).length,
                coordinator: coordinatorMembership ? studentById.get(coordinatorMembership.userId) : null
            };
        });
    }, [studentById, refreshKey, showArchived]);

    const clubsWithStats = rankedClubs;

    // --- MENING KLUBLARIM ---
    //
    // Ikki manba (a'zolik roli + faol lavozim tayinlovi) db tomonida
    // birlashtiriladi - izohi `getUserClubInvolvement` ustida.
    const myInvolvement = useMemo(() => {
        // eslint-disable-next-line no-unused-expressions
        refreshKey;
        if (!user?.id && !user?.username) return [];
        return db.getUserClubInvolvement(user.id || user.username);
    }, [user, refreshKey]);

    const involvementByClubId = useMemo(
        () => new Map(myInvolvement.map(i => [i.clubId, i])),
        [myInvolvement]
    );

    // Amaldagi qamrov. Foydalanuvchi tanlagan bo'lsa - o'shanisi; tanlamagan
    // bo'lsa a'zoligi bor odamga "Mening klublarim", a'zoligi yo'q odamga
    // butun ro'yxat. A'zoligi yo'q odamga bo'sh ro'yxat ochilishi mumkin
    // emas - bu "klub yo'q" degan noto'g'ri taassurot berardi.
    const effectiveScope = scope ?? (myInvolvement.length > 0 ? 'mine' : 'all');

    // Lavozimdagilar tepada: talaba "boshqaradigan klubim qaysi" degan
    // savolga bir qarashda javob topsin.
    const myManagedClubs = useMemo(
        () => rankedClubs.filter(c => involvementByClubId.get(c.id)?.hasPosition),
        [rankedClubs, involvementByClubId]
    );
    const myMemberClubs = useMemo(
        () => rankedClubs.filter(c => {
            const inv = involvementByClubId.get(c.id);
            return inv && !inv.hasPosition;
        }),
        [rankedClubs, involvementByClubId]
    );

    const filteredClubs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return rankedClubs.filter(c => {
            const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q) || String(c.displayNumber) === q;
            const matchesDirection = !directionFilter || c.direction === directionFilter;
            const matchesScope = effectiveScope === 'all' || involvementByClubId.has(c.id);
            return matchesSearch && matchesDirection && matchesScope;
        });
    }, [rankedClubs, searchQuery, directionFilter, effectiveScope, involvementByClubId]);

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredClubs.length / pageSize));
    const currentPageClamped = Math.min(currentPage, totalPages);
    const visibleClubs = pageSize === 'all'
        ? filteredClubs
        : filteredClubs.slice((currentPageClamped - 1) * pageSize, currentPageClamped * pageSize);

    const directionCounts = useMemo(() => {
        const counts = {};
        DIRECTIONS.forEach(d => { counts[d] = 0; });
        clubsWithStats.forEach(c => { counts[c.direction] = (counts[c.direction] || 0) + 1; });
        return counts;
    }, [clubsWithStats]);

    const featuredClub = rankedClubs[0];
    const totalStudents = students.length;
    const totalEvents = db.getEvents().length;

    const validateNizomFile = (file) => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
            return `Ruxsat etilmagan format. Qabul qilinadi: ${TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`;
        }
        if (file.size > TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB * 1024 * 1024) {
            return `Fayl hajmi ${TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB} MB dan oshmasligi kerak.`;
        }
        return '';
    };

    const handleNizomFile = (file) => {
        setNizomError('');
        if (!file) return;
        const err = validateNizomFile(file);
        if (err) { setNizomError(err); return; }
        setNizomFile(file);
    };

    const handleAddClub = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        const newClub = await db.createClub({ ...formData, membersCount: 0, headCoordinatorId: null, pointsModifier: 1.0 });

        // Rasmlar KLUB YARATILGANDAN KEYIN yuklanadi: fayl yo'li klub
        // identifikatoriga bog'langan, u esa yaratilgunicha mavjud emas.
        // Xato bo'lsa klub baribir yaratilgan qoladi - rasmni keyin
        // sozlamalardan qo'shish mumkin, shuning uchun bu to'xtatmaydi.
        try {
            if (logoFile) await db.uploadClubMedia(newClub.id, 'logo', logoFile);
            if (bannerFile) await db.uploadClubMedia(newClub.id, 'banner', bannerFile);
        } catch (err) {
            window.alert(`Klub yaratildi, lekin rasm yuklanmadi: ${err.message}`);
        }
        // Same metadata-only convention as ClubDocumentsTab.jsx's "Klub hujjatlari" tab — the nizom's
        // bytes aren't persisted, only filename/size/uploader, same as every other upload in this app.
        if (nizomFile) {
            db.uploadClubDocument({
                clubId: newClub.id, category: 'nizom', title: nizomFile.name, fileName: nizomFile.name,
                sizeLabel: `${(nizomFile.size / (1024 * 1024)).toFixed(2)} MB`, uploadedByUserId: user.username
            });
        }
        setIsAddOpen(false);
        setFormData({ name: '', description: '', category: DIRECTIONS[0] });
        setNizomFile(null);
        setNizomError('');
        setLogoFile(null);
        setBannerFile(null);
        setRefreshKey(k => k + 1);
    };

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl">
                <h1 className="text-3xl font-black mb-2">Klublar ro'yxati</h1>
                <p className="text-indigo-100">Bilim, ijod, sport va ijtimoiy tashabbuslarda faol yoshlar jamoasi</p>
            </div>

            {/* MENING KLUBLARIM — lavozimdagilar va oddiy a'zolik ALOHIDA.
                Talabaning ikki savoli boshqa-boshqa: "qayerda javobgarman"
                va "qayerga a'zoman". Ular bir ro'yxatga qo'shilsa, javobgarlik
                o'nlab klub orasida yo'qolib ketardi.
                Faqat a'zoligi bor foydalanuvchida ko'rinadi - bo'sh blok
                sahifani uzaytirishdan boshqa ish qilmaydi. */}
            {myInvolvement.length > 0 && (
                <Card>
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="font-bold text-gray-900">Mening klublarim</h3>
                        <button
                            type="button"
                            onClick={() => setScope(effectiveScope === 'mine' ? 'all' : 'mine')}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                        >
                            {effectiveScope === 'mine' ? 'Barcha klublarni ko\'rsatish' : 'Ro\'yxatni faqat menikiga cheklash'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                                Boshqaruvdagilar ({myManagedClubs.length})
                            </p>
                            {myManagedClubs.length === 0 ? (
                                <p className="text-xs text-gray-400 py-2">Lavozimda emassiz.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {myManagedClubs.map(c => {
                                        const inv = involvementByClubId.get(c.id);
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => navigate(`${routes.clubBase}/${slugify(c.name)}`)}
                                                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-amber-100 bg-amber-50/60 hover:bg-amber-50 text-left transition-colors"
                                            >
                                                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shrink-0">
                                                    {c.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                                                    <p className="text-[11px] text-amber-700 truncate">
                                                        {inv.positions.map(p => POSITION_TYPE_LABELS[p] || p).join(', ')}
                                                    </p>
                                                </div>
                                                {inv.manages && (
                                                    <Badge variant="warning" size="sm">Boshqaruv</Badge>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                                A'zo bo'lganlarim ({myMemberClubs.length})
                            </p>
                            {myMemberClubs.length === 0 ? (
                                <p className="text-xs text-gray-400 py-2">Oddiy a'zolik yo'q.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {myMemberClubs.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => navigate(`${routes.clubBase}/${slugify(c.name)}`)}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-100 hover:bg-gray-50 text-left transition-colors"
                                        >
                                            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shrink-0">
                                                {c.name.charAt(0)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                                                <p className="text-[11px] text-gray-400 truncate">{c.direction}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Boshqaruv huquqi LAVOZIM bilan bir xil emas - buni
                        aytib qo'yish kerak, aks holda "Media/Dizayn" lavozimidagi
                        talaba nega musobaqa boshqara olmasligini tushunmaydi. */}
                    {myManagedClubs.length > 0 && myManagedClubs.every(c => !involvementByClubId.get(c.id)?.manages) && (
                        <p className="text-[11px] text-gray-400 mt-3">
                            Lavozimda bo'lish tadbir va musobaqani boshqarish huquqini bermaydi —
                            u faqat koordinatorlarda bo'ladi.
                        </p>
                    )}
                </Card>
            )}

            {/* Qamrov: barcha klublar / faqat meniki. Yo'nalish filtri bilan
                birga ishlaydi. */}
            {myInvolvement.length > 0 && (
                <div className="flex gap-2">
                    {/* MENING KLUBLARIM BIRINCHI va sukut bo'yicha ochiq.
                        Talaba bu bo'limga kirganda birinchi savoli "men qaysi
                        klubdaman" bo'ladi, "universitetda qanday klublar bor"
                        emas - o'sha savol ikkinchi o'rinda turadi.
                        A'zoligi bo'lmagan odamda bu qator umuman chizilmaydi
                        (yuqoridagi shart), ya'ni unga baribir butun ro'yxat
                        ochiladi. */}
                    {[
                        { id: 'mine', label: `Mening klublarim (${myInvolvement.length})` },
                        { id: 'all', label: `Barcha klublar (${clubsWithStats.length})` },
                    ].map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => { setScope(s.id); setCurrentPage(1); }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                                effectiveScope === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Yo'nalish pills — Barchasi + the 8 real directions, replaces the old dropdown */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                    type="button"
                    onClick={() => setDirectionFilter('')}
                    className={`px-5 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-colors ${
                        directionFilter === '' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    Barchasi
                </button>
                {DIRECTIONS.map(d => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setDirectionFilter(d)}
                        className={`px-5 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-colors ${
                            directionFilter === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {d}
                    </button>
                ))}
            </div>

            <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
                <div className="flex flex-wrap gap-3 flex-1 items-center">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Klub qidirish..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Katalog / Ro'yxat ko'rinishi almashtirgichi */}
                    <div className="flex bg-gray-100 rounded-2xl p-1">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            title="Katalog ko'rinishi"
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                            }`}
                        >
                            <LayoutGrid size={14} /> Katalog
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            title="Ro'yxat ko'rinishi"
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                            }`}
                        >
                            <List size={14} /> Ro'yxat
                        </button>
                    </div>

                    {isAdmin && (
                        <>
                            <Button variant="outline" icon={ClipboardList} onClick={() => navigate('/admin/clubs/applications')}>
                                Arizalar
                            </Button>
                            <Button variant="primary" icon={Plus} onClick={() => setIsCreateChoiceOpen(true)}>Klub qo'shish</Button>
                            <label className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-gray-200 cursor-pointer text-sm">
                                <input
                                    type="checkbox" checked={showArchived}
                                    onChange={e => setShowArchived(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                                />
                                <span className="font-semibold text-gray-600">Arxivdagilar</span>
                            </label>
                        </>
                    )}
                    {/* TASHABBUSKOR YO'LI (band 2A) - talaba o'zi yangi klub uchun
                        ariza beradi. Admin yo'lidan (Klub qo'shish) alohida: talabada
                        Nizom/ekspertiza/tasdiqlash bosqichlari bor, adminda yo'q. */}
                    {isStudent && (
                        <>
                            <Button variant="outline" icon={ClipboardList} onClick={() => navigate('/student/clubs/applications')}>
                                Arizalarim
                            </Button>
                            <Button variant="primary" icon={Sparkles} onClick={() => navigate('/student/clubs/create')}>
                                Yangi klub tashkil etish
                            </Button>
                        </>
                    )}
                </div>
                <div className="flex gap-3">
                    {[
                        { value: clubsWithStats.length, label: 'Klub' },
                        { value: totalStudents, label: 'Talaba' },
                        { value: `${totalEvents}+`, label: 'Tadbir' }
                    ].map(s => (
                        <div key={s.label} className="px-5 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm text-center min-w-[84px]">
                            <p className="text-xl font-black text-indigo-600">{s.value}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{s.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                <div className="xl:col-span-3 space-y-4">
                    {viewMode === 'list' ? (
                        <ClubsListView clubs={visibleClubs} clubBase={routes.clubBase} />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
                            {visibleClubs.map(club => (
                                <ClubCard key={club.id} club={club} clubBase={routes.clubBase} />
                            ))}
                            {visibleClubs.length === 0 && (
                                <div className="col-span-full text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-dashed border-gray-200">
                                    Hech qanday klub topilmadi
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                        <Pagination
                            currentPage={currentPageClamped}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            pageSize={pageSize}
                            onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                            totalItems={filteredClubs.length}
                        />
                    </div>
                </div>

                <div className="space-y-6">
                    <Card>
                        <h3 className="font-bold text-gray-900 mb-3">Yo'nalishlar</h3>
                        <div className="space-y-1.5">
                            {DIRECTIONS.map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setDirectionFilter(directionFilter === d ? '' : d)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                                        directionFilter === d ? 'bg-indigo-600 text-white' : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                                >
                                    {d}
                                    <Badge variant={directionFilter === d ? 'default' : 'primary'} size="sm">{directionCounts[d] || 0}</Badge>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {featuredClub && (
                        <Card>
                            <h3 className="font-bold text-gray-900 mb-3">Mashhur klub</h3>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                                    {featuredClub.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-gray-900 truncate">{featuredClub.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{featuredClub.description || "Tavsif kiritilmagan"}</p>
                                </div>
                            </div>
                            <Button variant="outline" className="w-full" onClick={() => navigate(`${routes.clubBase}/${slugify(featuredClub.name)}`)}>
                                Batafsil
                            </Button>
                        </Card>
                    )}
                </div>
            </div>

            {/* FORK (band 26): "+Klub" bosilganda ikki yo'l taklif qilinadi.
                Mavjud "Bevosita klub yaratish" oynasi (pastda) O'ZGARMAYDI -
                shu tanlov faqat unga kirishdan oldingi qadam. */}
            {isAdmin && (
                <Modal isOpen={isCreateChoiceOpen} onClose={() => setIsCreateChoiceOpen(false)} title="Yangi klub">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => { setIsCreateChoiceOpen(false); setIsConvertOpen(true); }}
                            className="text-left p-4 rounded-2xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
                        >
                            <ClipboardList size={20} className="text-indigo-600 mb-2" />
                            <p className="font-bold text-gray-900 text-sm">Arizadan klub yaratish</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Mavjud tashabbus/arizani rasmiy klubga aylantirish
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsCreateChoiceOpen(false); setIsAddOpen(true); }}
                            className="text-left p-4 rounded-2xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
                        >
                            <FilePlus2 size={20} className="text-indigo-600 mb-2" />
                            <p className="font-bold text-gray-900 text-sm">Bevosita klub yaratish</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Rasmiy klubni tizimga to'g'ridan-to'g'ri kiritish
                            </p>
                        </button>
                    </div>
                </Modal>
            )}

            {isAdmin && (
                <Modal isOpen={isConvertOpen} onClose={() => setIsConvertOpen(false)} title="Arizadan klub yaratish">
                    {approvedApplications.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">
                            Tasdiqlangan va hali klubga aylantirilmagan ariza yo'q.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {approvedApplications.map(a => (
                                <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200">
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-gray-900 truncate">{a.fields?.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{a.fields?.direction} · {a.applicant?.fullName || a.applicantUserId}</p>
                                    </div>
                                    <Button
                                        variant="primary" size="sm" disabled={convertBusy}
                                        onClick={() => handleConvertApplication(a.id)}
                                    >
                                        Klub yaratish
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                    {convertError && <p className="text-xs text-red-500 mt-3">{convertError}</p>}
                </Modal>
            )}

            {isAdmin && (
                <Modal
                    isOpen={isAddOpen}
                    onClose={() => { setIsAddOpen(false); setNizomFile(null); setNizomError(''); }}
                    title="Yangi klub qo'shish"
                >
                    <form onSubmit={handleAddClub} className="space-y-4">
                        <div className="space-y-3 pb-3 border-b border-gray-100">
                            <ClubMediaUploader
                                kind="banner"
                                onFilePicked={setBannerFile}
                            />
                            <ClubMediaUploader
                                kind="logo"
                                fallbackText={formData.name.charAt(0)}
                                onFilePicked={setLogoFile}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Klub nomi</label>
                            <input
                                required
                                type="text"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Tavsif</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Yo'nalish</label>
                            <select
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                            >
                                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Klub nizomi (ixtiyoriy)</label>
                            <input
                                ref={nizomInputRef}
                                type="file"
                                className="hidden"
                                accept={TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(',')}
                                onChange={e => handleNizomFile(e.target.files?.[0])}
                            />
                            {!nizomFile ? (
                                <label
                                    onClick={() => nizomInputRef.current?.click()}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => { e.preventDefault(); handleNizomFile(e.dataTransfer.files?.[0]); }}
                                    className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl py-5 cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                    <Upload size={18} className="text-gray-400" />
                                    <span className="text-xs font-semibold text-gray-500">Faylni shu yerga tashlang yoki tanlash uchun bosing</span>
                                </label>
                            ) : (
                                <div className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-xl">
                                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                        <FileText size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{nizomFile.name}</p>
                                        <p className="text-[11px] text-gray-400">{(nizomFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                    </div>
                                    <button type="button" onClick={() => setNizomFile(null)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                            {nizomError && <p className="text-xs text-red-500 mt-1.5">{nizomError}</p>}
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => { setIsAddOpen(false); setNizomFile(null); setNizomError(''); }}>Bekor qilish</Button>
                            <Button type="submit" variant="primary" className="flex-1">Qo'shish</Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default ClubsDirectoryPage;
