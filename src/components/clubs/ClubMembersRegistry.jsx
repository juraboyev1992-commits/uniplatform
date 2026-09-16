import React, { useMemo, useState } from 'react';
import { Users, Search, Download, RotateCcw, Phone, BellRing } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Pagination from '../common/Pagination';
import { db, POSITION_BADGE_STYLES } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { exportRowsToExcel } from '../../utils/exportToExcel';
import {
    buildClubMemberRows, filterMemberRows, getMemberFilterOptions,
    MEMBER_STATUS_LABELS, memberRowsToExcelData,
} from '../../utils/clubMembers';

const PAGE_SIZE_OPTIONS = [20, 50, 100, 'all'];

// KLUB A'ZOLARI RO'YXATI - bitta komponent, ikki ko'rinish:
//   clubId berilsa      - koordinator o'z klubini ko'radi ("Klub tarkibi" ichida);
//   clubId berilmasa    - administrator BARCHA klublarni bir joyda ko'radi.
//
// Nega bitta komponent: ustunlar va "status" ta'rifi ikki joyda ikki xil
// bo'lib qolmasligi kerak. Lavozimdagilar jadvali (ClubRosterTable) esa
// boshqa savolga javob beradi - "kim javobgar"; bu esa "klubda kim bor".
//
// TELEFON: `showContact` faqat ruxsatni SO'RAYDI, bermaydi. Haqiqiy qaror
// db.getStudentContact ichida, pasport qoidalari bo'yicha chiqadi:
// administrator ko'radi, klub koordinatori esa "ko'rsatilmadi" deb oladi
// (u pasport tizimida alohida ko'ruvchi turi emas). Shuning uchun bu
// komponentda maxfiylikni qayta yozadigan hech narsa yo'q.
const ClubMembersRegistry = ({ clubId = null, showContact = false, refreshKey = 0, canRequestConfirmation = false }) => {
    const { user } = useAuth();
    const [search, setSearch] = useState('');
    const [faculty, setFaculty] = useState('');
    const [course, setCourse] = useState('');
    const [status, setStatus] = useState('');
    const [club, setClub] = useState('');
    const [year, setYear] = useState('');
    const [onlyInactive, setOnlyInactive] = useState(false);
    const [onlyPositions, setOnlyPositions] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
    const [requesting, setRequesting] = useState(false);
    const [requestNote, setRequestNote] = useState('');

    const rows = useMemo(
        () => buildClubMemberRows(db, { clubId }),
        [clubId, refreshKey]
    );
    const options = useMemo(() => getMemberFilterOptions(rows), [rows]);

    // Tasdiqlash holati faqat bitta klub ko'rinishida ma'noga ega.
    const confirmations = useMemo(
        () => (clubId ? db.getMembershipConfirmations(clubId) : {}),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [clubId, refreshKey, requestNote]
    );

    const filters = { search, faculty, course, status, year, onlyInactive, onlyPositions, clubId: club || null };
    const filtered = useMemo(
        () => filterMemberRows(rows, filters),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, search, faculty, course, status, club, year, onlyInactive, onlyPositions]
    );

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const visible = pageSize === 'all' ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);

    // Aloqa ma'lumoti faqat KERAK bo'lganda o'qiladi (ko'rinayotgan qatorlar
    // uchun) - har bir qator uchun to'liq pasportni yig'ish qimmat.
    const contactByStudent = useMemo(() => {
        if (!showContact) return null;
        const map = new Map();
        visible.forEach(r => map.set(r.studentId, db.getStudentContact(r.studentId, user)));
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showContact, visible, user?.username]);

    const resetFilters = () => {
        setSearch(''); setFaculty(''); setCourse(''); setStatus('');
        setClub(''); setYear(''); setOnlyInactive(false); setOnlyPositions(false);
        setCurrentPage(1);
    };

    const handleExport = () => {
        // Eksport EKRANDAGI filtrga bo'ysunadi: odam nimani ko'rgan bo'lsa,
        // o'shani yuklab oladi. Sahifalash esa eksportga ta'sir qilmaydi -
        // fayl butun filtrlangan ro'yxatni oladi.
        const contacts = showContact
            ? new Map(filtered.map(r => [r.studentId, db.getStudentContact(r.studentId, user)]))
            : null;
        const data = memberRowsToExcelData(filtered, {
            includeClub: !clubId,
            contactByStudent: contacts,
        });
        exportRowsToExcel(data, {
            sheetName: "Klub a'zolari",
            fileName: `klub_azolari_${new Date().toISOString().slice(0, 10)}.xlsx`,
        });
    };

    // So'rov EKRANDAGI filtrga yuboriladi: koordinator masalan faqat
    // "faolsizlar"ni tanlab, so'rovni o'shalarga yuborishi mumkin.
    const handleRequestConfirmation = async () => {
        if (!window.confirm(`${filtered.length} ta a'zoga a'zolikni tasdiqlash so'rovi yuborilsinmi?`)) return;
        setRequesting(true);
        try {
            const res = await db.requestMembershipConfirmation({
                clubId,
                userIds: filtered.map(r => r.studentId),
                requestedBy: user?.username,
            });
            setRequestNote(res.skipped > 0
                ? `${res.sent} ta yuborildi, ${res.skipped} ta yuborilmadi (hisob topilmadi).`
                : `${res.sent} ta a'zoga so'rov yuborildi.`);
        } catch (e) {
            setRequestNote(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setRequesting(false);
        }
    };

    const selectClass = 'px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-xs';

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Users size={16} className="text-indigo-600" />
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                        {clubId ? "Klub a'zolari" : "Barcha klub a'zolari"}
                    </h3>
                    <span className="text-xs font-black text-indigo-600">{filtered.length}</span>
                </div>
                <div className="flex items-center gap-2">
                    {clubId && canRequestConfirmation && (
                        <Button
                            variant="outline" size="sm" icon={BellRing}
                            onClick={handleRequestConfirmation}
                            disabled={requesting || filtered.length === 0}
                        >
                            {requesting ? 'Yuborilmoqda...' : "A'zolikni tasdiqlashni so'rash"}
                        </Button>
                    )}
                    <Button variant="outline" size="sm" icon={Download} onClick={handleExport} disabled={filtered.length === 0}>
                        Excelga yuklash
                    </Button>
                </div>
            </div>

            {requestNote && (
                <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                    {requestNote}
                </p>
            )}

            <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        placeholder="Ism, ID, fakultet, guruh..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-xs"
                    />
                </div>
                {!clubId && (
                    <select value={club} onChange={e => { setClub(e.target.value); setCurrentPage(1); }} className={selectClass}>
                        <option value="">Barcha klublar</option>
                        {options.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                )}
                <select value={faculty} onChange={e => { setFaculty(e.target.value); setCurrentPage(1); }} className={selectClass}>
                    <option value="">Barcha fakultetlar</option>
                    {options.faculties.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={course} onChange={e => { setCourse(e.target.value); setCurrentPage(1); }} className={selectClass}>
                    <option value="">Barcha kurslar</option>
                    {options.courses.map(c => <option key={c} value={c}>{c}-kurs</option>)}
                </select>
                <select value={status} onChange={e => { setStatus(e.target.value); setCurrentPage(1); }} className={selectClass}>
                    <option value="">Barcha statuslar</option>
                    {options.statuses.map(s => <option key={s} value={s}>{MEMBER_STATUS_LABELS[s]}</option>)}
                </select>
                <select value={year} onChange={e => { setYear(e.target.value); setCurrentPage(1); }} className={selectClass}>
                    <option value="">O'quv yili: hammasi</option>
                    {options.years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button
                    type="button"
                    onClick={() => { setOnlyInactive(v => !v); setCurrentPage(1); }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                        onlyInactive ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-500 hover:bg-gray-200'
                    }`}
                >
                    Faolsizlar
                </button>
                <button
                    type="button"
                    onClick={() => { setOnlyPositions(v => !v); setCurrentPage(1); }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                        onlyPositions ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-500 hover:bg-gray-200'
                    }`}
                >
                    Faqat lavozimdagilar
                </button>
                <button
                    type="button" onClick={resetFilters} title="Filtrlarni tozalash"
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-900 text-gray-500 hover:bg-gray-200"
                >
                    <RotateCcw size={13} />
                </button>
            </div>

            {/* "Faolsizlar" nimani anglatishini aytib qo'yamiz: bu a'zolikdan
                chiqarish uchun asos EMAS, chunki faollik faqat qayd etilgan
                qatnashuvdan ko'rinadi - davomat belgilanmagan tadbir bu yerda
                ham ko'rinmaydi. */}
            {onlyInactive && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Faollik qayd etilgan qatnashuv bo'yicha hisoblanadi (ro'yxatdan o'tish va ishtirok).
                    Tadbirda qatnashgani belgilanmagan talaba ham shu ro'yxatga tushadi.
                </p>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[11px] font-bold text-gray-400 uppercase border-b border-gray-100 dark:border-gray-700">
                            <th className="px-3 py-2">Talaba</th>
                            <th className="px-3 py-2">Fakultet</th>
                            <th className="px-3 py-2">Kurs / guruh</th>
                            <th className="px-3 py-2">Status</th>
                            {!clubId && <th className="px-3 py-2">Klub</th>}
                            {showContact && <th className="px-3 py-2">Aloqa</th>}
                            <th className="px-3 py-2">Ball</th>
                            <th className="px-3 py-2">Oxirgi faollik</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {visible.map(r => {
                            const contact = contactByStudent?.get(r.studentId);
                            return (
                                <tr key={r.key} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40">
                                    <td className="px-3 py-2">
                                        <p className="font-bold text-gray-900 dark:text-gray-100">{r.fullName}</p>
                                        <p className="text-[11px] text-gray-400">{r.studentCode || r.studentId}</p>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{r.faculty || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                                        {r.course ? `${r.course}-kurs` : '—'}{r.group ? ` · ${r.group}` : ''}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                            POSITION_BADGE_STYLES[r.status]
                                                || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                                        }`}>
                                            {MEMBER_STATUS_LABELS[r.status] || r.status}
                                        </span>
                                        {confirmations[r.studentId] && (
                                            <Badge
                                                variant={confirmations[r.studentId].status === 'confirmed' ? 'success' : 'warning'}
                                                size="sm" className="ml-1.5"
                                            >
                                                {confirmations[r.studentId].status === 'confirmed' ? 'Tasdiqladi' : 'Javob kutilmoqda'}
                                            </Badge>
                                        )}
                                    </td>
                                    {!clubId && <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{r.clubName}</td>}
                                    {showContact && (
                                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                                            {contact?.phone ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <Phone size={12} className="text-gray-400" /> {contact.phone}
                                                </span>
                                            ) : contact?.restricted ? (
                                                <span className="text-gray-400">ko'rsatilmadi</span>
                                            ) : '—'}
                                        </td>
                                    )}
                                    <td className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200">{r.score}</td>
                                    <td className="px-3 py-2">
                                        {r.lastActivityAt ? (
                                            <span className="text-xs text-gray-600 dark:text-gray-300">
                                                {new Date(r.lastActivityAt).toLocaleDateString('uz-UZ')}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400">harakat yo'q</span>
                                        )}
                                        {!r.activeThisYear && (
                                            <Badge variant="warning" size="sm" className="ml-1.5">Shu yil faol emas</Badge>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">
                                    Bu shartlarga mos a'zo topilmadi
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                totalItems={filtered.length}
            />
        </div>
    );
};

export default ClubMembersRegistry;
