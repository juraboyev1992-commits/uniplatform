import React, { useMemo } from 'react';
import { Library, BookOpen, ClipboardList } from 'lucide-react';
import ReadingModule from '../../components/student/ReadingModule';
import ReadingTestsModule from '../../components/student/ReadingTestsModule';
import TestsModule from '../../components/student/TestsModule';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { useTabParam } from '../../hooks/useTabParam';
import { INDEX_CRITERIA, booksToPoints } from '../../config/socialActivityIndex';
import { isReadingTest, isPassingAttempt } from '../../utils/socialActivityScoring';
import { TEACHING_LANGUAGES } from '../../constants';

// KUTUBXONA VA TESTLAR — bitta bo'lim.
//
// Ilgari yon menyuda UCHTA alohida bo'lim turardi: "Testlar", "Kutubxona"
// va "Kitobxonlik testi". Ular bir-biriga shu qadar yaqin ediki, talaba
// qaysi biriga kirishni bilmasdi:
//
//   Kutubxona          - asarlar RO'YXATI
//   Kitobxonlik testi  - AYNAN O'SHA asarlarning testlari
//   Testlar            - fan testlari
//
// Birinchi ikkitasi bitta narsaning ikki tomoni edi (kitob va uning testi),
// uchinchisi esa "test" so'zi bilan ular bilan chalkashardi. Menyu esa har
// safar tanlov talab qilardi.
//
// Endi bitta bo'lim va uchta tab. Ichki modullar TEGILMAGAN - ular
// avvalgidek ishlaydi, faqat o'z sarlavhasini ko'rsatmaydi (`embedded`).
const TABS = [
    { id: 'kitoblar', label: 'Kitoblar', icon: Library },
    { id: 'kitobxonlik', label: 'Kitobxonlik testlari', icon: BookOpen },
    { id: 'testlar', label: 'Fan testlari', icon: ClipboardList },
];

const LibraryAndTestsPage = () => {
    const { user } = useAuth();
    const username = user?.username;
    const [tab, setTab] = useTabParam(TABS.map(t => t.id), 'kitoblar');

    const myLanguage = useMemo(
        () => db.getStudentTeachingLanguage(username),
        [username]
    );

    // Sarlavhadagi ko'rsatkich - kitobxonlik bo'yicha, chunki aynan u
    // ijtimoiy faollik indeksiga ball beradi. Fan testlari indeksga
    // kirmaydi va ularning "bali" ham yo'q.
    const reading = useMemo(() => {
        const tests = db.getTests().filter(isReadingTest)
            .filter(t => !myLanguage || !t.readingBook.language || t.readingBook.language === myLanguage);
        const passed = tests.filter(t => {
            const attempts = db.getStudentTestAttempts(username, t.id);
            return attempts.some(a => isPassingAttempt(a, t));
        }).length;
        return { total: tests.length, passed, points: booksToPoints(passed) ?? 0 };
    }, [username, myLanguage]);

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-8 text-white shadow-xl flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Library className="w-8 h-8" /> Kutubxona va testlar
                    </h1>
                    <p className="text-emerald-100">
                        Badiiy adabiyot ro'yxati, uning testlari va fan testlari
                    </p>
                    <p className="text-emerald-100/80 text-xs mt-1.5">
                        {myLanguage
                            ? `${TEACHING_LANGUAGES[myLanguage].short} uchun ro'yxat`
                            : "Ta'lim tilingiz belgilanmagan — barcha asarlar ko'rsatilmoqda"}
                    </p>
                </div>
                <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30 text-center min-w-[150px]">
                    <p className="text-sm opacity-80 mb-1">O'qilgan asarlar</p>
                    <p className="text-3xl font-bold tabular-nums">
                        {reading.passed}<span className="text-lg opacity-70"> / {reading.total}</span>
                    </p>
                    <p className="text-xs opacity-80 mt-1">
                        {reading.points} / {INDEX_CRITERIA.READING.maxPoints} ball
                    </p>
                </div>
            </div>

            {/* Tab MANZILDA: eski havolalar ham shu yerga tushadi va
                "orqaga" tugmasi bo'limdan chiqarib yubormaydi. */}
            <div className="flex flex-wrap border-b border-gray-200 gap-1">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all ${
                            tab === t.id
                                ? 'border-emerald-600 text-emerald-700'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <t.icon size={15} /> {t.label}
                    </button>
                ))}
            </div>

            {/* Fan testlari indeksga kirmasligini aynan SHU tabda aytamiz -
                boshqa joyda u ortiqcha ogohlantirish bo'lardi. */}
            {tab === 'testlar' && (
                <p className="text-xs text-gray-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                    Fan testlari ijtimoiy faollik indeksiga <b>ball bermaydi</b> — ball
                    faqat kitobxonlik testlaridan keladi.
                </p>
            )}

            {tab === 'kitoblar' && <ReadingModule embedded />}
            {tab === 'kitobxonlik' && <ReadingTestsModule embedded />}
            {tab === 'testlar' && <TestsModule embedded />}
        </div>
    );
};

export default LibraryAndTestsPage;
