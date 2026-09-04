import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { db } from '../../services/db';
import { READING_POLICY, INDEX_CRITERIA } from '../../config/socialActivityIndex';
import { TEACHING_LANGUAGES, TEACHING_LANGUAGE_ORDER } from '../../constants';
import {
    Plus,
    Search,
    FileText,
    Settings,
    Trash2,
    Edit,
    Download,
    Upload,
    CheckCircle,
    AlertCircle,
    Clock,
    ChevronRight,
    Database,
    TrendingUp,
    Library,
    Info,
    BookOpen,
    Users
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import TestAnalyticsTab from './TestAnalyticsTab';
import ReadingTestsPanel from './ReadingTestsPanel';
import QuestionBankTab from './QuestionBankTab';
import AttemptDetailView from './AttemptDetailView';
import ReadingStudentsTab from './ReadingStudentsTab';
import { useTabParam } from '../../hooks/useTabParam';

const TestManagement = () => {
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
    const [isBaseModalOpen, setIsBaseModalOpen] = useState(false);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
    const [selectedTestForResults, setSelectedTestForResults] = useState(null);
    // Ochilgan urinish - natijalar oynasi ichidagi ikkinchi qatlam.
    const [openAttemptId, setOpenAttemptId] = useState(null);
    // Tab MANZILDA: "orqaga" tugmasi oldingi tabga qaytaradi.
    //
    // Standart tab - KITOBLAR: bo'lim "Kutubxona va testlar" nomi bilan
    // ochiladi va ish odatda kitobdan boshlanadi.
    const [activeTab, setActiveTab] = useTabParam(
        ['library', 'tests', 'question-bank', 'readers', 'analytics'], 'library');
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingBase, setEditingBase] = useState(null);
    const [selectedSubject, setSelectedSubject] = useState('Barcha fanlar');

    // Mock data moved to state for synchronization
    // MA'LUMOT QATLAMI — bazadan.
    //
    // Bu komponent butunlay maket edi: savollar bazasi, testlar va savollar
    // `useState` massivlarida turardi, ya'ni yaratganingiz sahifa yangilanishi
    // bilan yo'qolardi. Ma'lumot qatlami (question_bases / test_questions /
    // tests / test_attempts) esa allaqachon Supabase'da ishlayotgan edi -
    // faqat ekranlar unga ulanmagandi.
    const [version, setVersion] = useState(0);
    const refresh = () => setVersion(v => v + 1);
    const [dataError, setDataError] = useState('');

    const run = async (fn, ok = '') => {
        setDataError('');
        try { await fn(); refresh(); if (ok) setFlash(ok); }
        catch (e) { setDataError(e?.message || 'Xatolik yuz berdi.'); }
    };
    const [flash, setFlash] = useState('');

    const questionBases = useMemo(
        () => db.getQuestionBasesWithCounts().map(b => ({ ...b, questions: b.questionCount })),
        [version]
    );

    // KITOBXONLIK TESTLARI ENDI SHU RO'YXATDA.
    //
    // Ilgari ular chiqarib tashlanardi, chunki alohida "Kutubxona" bo'limi
    // bor edi va bir test ikki joyda ko'rinishi chalkashlik berardi. Endi
    // ikkalasi BITTA bo'lim ("Kutubxona va testlar") va ularni ajratib
    // turishning sababi qolmadi: admin barcha testlarni bir ro'yxatda
    // ko'rishi tabiiy.
    //
    // Turi qatorda BELGILANADI: kitobxonlik testi ijtimoiy faollik
    // indeksiga ball beradi, fan testi esa yo'q - bu farq ko'rinib turishi
    // kerak.
    const tests = useMemo(
        () => db.getTests()
            .map(t => ({
                ...t,
                questions: db.getTestQuestionCount(t.id),
                studentsCount: db.getTestAttempts(t.id).length,
                status: t.isPublished ? 'Faol' : 'Qoralama',
                time: t.timeLimit || 0,
            }))
            // Kitobxonlik testlari tepada: ular indeksga ball beradi va
            // ularning holati ko'proq nazorat talab qiladi.
            .sort((a, b) => (b.isReadingTest ? 1 : 0) - (a.isReadingTest ? 1 : 0)),
        [version]
    );

    // Tur bo'yicha filtr - ro'yxat uzun bo'lganda kerak.
    //
    // QIDIRUV VA FAN TANLAGICHI SHU YERDA ISHLAYDI. Ilgari ular ekranda
    // turardi, lekin testlar ro'yxatiga umuman ta'sir qilmasdi: `tests`
    // to'g'ridan-to'g'ri chizilardi va hech qanday filtr qo'llanmasdi.
    // Foydalanuvchi qidiruv yozib, natija o'zgarmaganini ko'rardi.
    const [testKind, setTestKind] = useState('all'); // all | reading | subject
    const visibleTests = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return tests
            .filter(t => testKind === 'all'
                || (testKind === 'reading' ? t.isReadingTest : !t.isReadingTest))
            .filter(t => selectedSubject === 'Barcha fanlar' || t.subject === selectedSubject)
            .filter(t => !q || String(t.title || '').toLowerCase().includes(q)
                || String(t.subject || '').toLowerCase().includes(q));
    }, [tests, testKind, searchTerm, selectedSubject]);



    const handlePublishResults = (id) => {
        const test = tests.find(t => t.id === id);
        if (!test) return;
        run(() => db.updateTest(id, {
            isPublished: !test.isPublished,
            status: !test.isPublished ? 'active' : 'draft',
        }));
    };

    const handleDeleteTest = (id) => {
        if (!window.confirm("Haqiqatan ham ushbu testni o'chirib tashlamoqchimisiz?")) return;
        // db.deleteTest natijasi bor testni o'chirishga YO'L QO'YMAYDI -
        // talabalarning natijasi bilan birga yo'qolib ketmasin.
        run(() => db.deleteTest(id));
    };

    const handleEditTest = (test) => {
        alert(`Tahrirlash rejimiga o'tish: ${test.title}`);
        setIsTestModalOpen(true);
    };

    // UI state for creation
    const [newBaseName, setNewBaseName] = useState('');

    // Savol qo'shish formasi. Ilgari bu maydonlar hech qanday holatga
    // bog'lanmagan edi - yozganingiz hech qayerga bormasdi.
    const [qText, setQText] = useState('');
    const [qDifficulty, setQDifficulty] = useState('medium');
    const [qOptions, setQOptions] = useState(['', '', '', '']);
    const [qCorrect, setQCorrect] = useState(0);

    // Tahrirlanayotgan savol. `null` bo'lsa forma yangi savol qo'shadi.
    const [editingQuestionId, setEditingQuestionId] = useState(null);

    const resetQuestionForm = () => {
        setQText(''); setQOptions(['', '', '', '']); setQCorrect(0);
        setEditingQuestionId(null);
    };

    // --- Savollarni jadvaldan yuklash ---
    const questionFileRef = useRef(null);

    const downloadQuestionTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(db.getQuestionTemplateRows());
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Savollar');
        XLSX.writeFile(wb, 'savollar-shabloni.xlsx');
    };

    const [importing, setImporting] = useState(false);

    const handleImportQuestions = (file) => {
        // Baza hali yaratilmagan bo'lsa - nomdan yaratamiz, xuddi qo'lda
        // savol qo'shgandagidek.
        if (!editingBase?.id && !newBaseName.trim()) {
            setDataError('Avval baza nomini kiriting — savollar shu bazaga tushadi.');
            setFlash('');
            return;
        }
        setImporting(true);
        run(async () => {
            let base = editingBase;
            if (!base?.id) {
                base = await db.createQuestionBase({ title: newBaseName.trim() });
                setEditingBase(base);
                setIsEditMode(true);
                setNewBaseName('');
            }
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer);
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if (rows.length === 0) throw new Error("Faylda ma'lumot topilmadi");

            try {
                const res = await db.importTestQuestions(base.id, rows);
                setFlash(
                    `${res.added} ta savol qo'shildi`
                    + (res.skipped ? `, ${res.skipped} ta bo'sh qator o'tkazib yuborildi` : '')
                    + (res.errors.length ? `. Xatolar: ${res.errors.slice(0, 3).join('; ')}` : '')
                );
            } finally {
                setImporting(false);
            }
        });
    };

    const startEditQuestion = (q) => {
        setEditingQuestionId(q.id);
        setQText(q.text || '');
        // Variantlar soni har xil bo'lishi mumkin - forma to'rttaga
        // moslashtiriladi, ortiqchasi saqlanadi.
        const opts = (q.options || []).slice();
        while (opts.length < 4) opts.push('');
        setQOptions(opts);
        setQCorrect(Number(q.correctIndex) || 0);
        setQDifficulty(q.difficulty || 'medium');
        setDataError(''); setFlash('');
    };

    // Oyna yopilganda holat TOZALANADI - keyingi safar ochilganda oldingi
    // bazaning nomi va savollari qolib ketmasin.
    const closeBaseModal = () => {
        setIsQuestionModalOpen(false);
        setEditingBase(null);
        setIsEditMode(false);
        setNewBaseName('');
        setDataError('');
        setFlash('');
        resetQuestionForm();
    };

    // Savol HAR DOIM shu ochilgan bazaga tushadi - boshqa baza tanlash yo'q.
    //
    // Baza hali yaratilmagan bo'lsa BIRINCHI SAVOL bilan birga o'zi yaratiladi.
    // Ilgari "avval nomni saqlang, keyin savol qo'shing" degan alohida qadam bor
    // edi - u foydalanuvchi uchun hech narsa bermaydigan, faqat baza yozuvi
    // savoldan oldin turishi kerakligidan kelib chiqqan texnik talab edi.
    // Bunday talabni foydalanuvchiga yuklash noto'g'ri.
    const handleAddQuestion = () => {
        // Tahrirlash rejimi - yangi savol qo'shilmaydi, mavjudi yangilanadi.
        if (editingQuestionId) {
            run(async () => {
                await db.updateTestQuestion(editingQuestionId, {
                    text: qText.trim(),
                    options: qOptions.map(o => o.trim()).filter(Boolean),
                    correctIndex: qCorrect,
                    difficulty: qDifficulty,
                });
                resetQuestionForm();
            }, "Savol yangilandi.");
            return;
        }

        if (!editingBase?.id && !newBaseName.trim()) {
            setDataError('Baza nomini kiriting.');
            return;
        }
        run(async () => {
            let base = editingBase;
            if (!base?.id) {
                base = await db.createQuestionBase({ title: newBaseName.trim() });
                setEditingBase(base);
                setIsEditMode(true);
                setNewBaseName('');
            }
            await db.createTestQuestion({
                baseId: base.id,
                subject: base.title || '',
                difficulty: qDifficulty,
                text: qText.trim(),
                options: qOptions.map(o => o.trim()).filter(Boolean),
                correctIndex: qCorrect,
            });
            resetQuestionForm();
        });
    };

    // Test Creation States
    const [testType, setTestType] = useState('single'); // single, blocks
    const [testBlocks, setTestBlocks] = useState([{ id: Date.now(), subject: '', questionCount: 5 }]);
    const [testSingleSubject, setTestSingleSubject] = useState('');
    const [testPointsPerQuestion, setTestPointsPerQuestion] = useState(2);
    // Vaqt chegarasi (daqiqa). 0 - cheklanmagan.
    const [testTimeLimit, setTestTimeLimit] = useState(0);
    const [testTotalLimit, setTestTotalLimit] = useState(30);
    // Ta'lim tili (potok) - talabaga o'z potokidagi testlar ko'rinadi.
    const [testLanguage, setTestLanguage] = useState('');
    const [shuffleQuestions, setShuffleQuestions] = useState(true);
    const [shuffleOptions, setShuffleOptions] = useState(true);

    // Audience Targeting States
    // Fakultetlar HAQIQIY talabalar ro'yxatidan olinadi - qo'lda yozib
    // qo'yilgan uchta nom platformadagi fakultetlarga mos kelmasdi.
    const facultyOptions = useMemo(
        () => [...new Set(db.getMockStudents().map(s => s.faculty).filter(Boolean))].sort(),
        []
    );
    const [targetFaculty, setTargetFaculty] = useState('Barchasi');
    const [targetCourse, setTargetCourse] = useState('Barchasi');
    const [targetGroup, setTargetGroup] = useState('Barchasi');
    const [targetStaff, setTargetStaff] = useState(false);

    const currentTotalQuestions = testType === 'single' ? testTotalLimit : testBlocks.reduce((sum, block) => sum + (parseInt(block.questionCount) || 0), 0);
    const isOverLimit = currentTotalQuestions > testTotalLimit;

    const isSingleInvalid = testType === 'single' && (testTotalLimit > (questionBases.find(b => b.title === testSingleSubject)?.questions || 0) || !testSingleSubject);
    const isBlocksInvalid = testType === 'blocks' && (isOverLimit || testBlocks.some(b => (parseInt(b.questionCount) || 0) > (questionBases.find(base => base.title === b.subject)?.questions || 0)));
    const isTestInvalid = isSingleInvalid || isBlocksInvalid;

    // KITOBXONLIK ASARIGA BOG'LASH.
    //
    // Bog'lanish NOM bo'yicha emas, ASARNING RAQAMI bo'yicha. Nom bo'yicha
    // bog'lash taxminga tayanardi va uch joyda buzilardi: apostrof/harf
    // farqlari ("O'tkan" / "Oʻtkan"), nomni tuzatganda bog'lanishning jimgina
    // uzilishi, va oddiy fan testining tasodifan kitob nomiga o'xshab qolishi.
    // Nom odam uchun ("«O'tkan kunlar» asaridan test"), raqam tizim uchun.
    const readingTests = useMemo(() => db.getReadingTests(), [version]);
    const [readingTestId, setReadingTestId] = useState('');
    // Asarning o'tish foizi. Kitob qo'shilganda belgilanadi, lekin bu yerda ham
    // ko'rinishi va o'zgartirilishi kerak - aks holda test sozlayotgan odam
    // "necha foizda o'tiladi" degan savolga javob topmasdi.
    const [readingPassPercent, setReadingPassPercent] = useState(READING_POLICY.defaultPassPercent);

    // Kitobxonlik bo'limidan "to'liq test sozlash" bosilganda shu yerga
    // o'tiladi va oyna o'sha asar uchun ochiladi.
    useEffect(() => {
        const fromUrl = searchParams.get('reading');
        if (fromUrl) {
            setReadingTestId(fromUrl);
            setIsTestModalOpen(true);
        }
    }, [searchParams]);

    const activeReadingTest = readingTests.find(t => t.id === readingTestId) || null;

    // Asar tanlanganda uning MAVJUD o'tish foizi formaga tortiladi - standart
    // qiymat bilan almashtirilmaydi.
    useEffect(() => {
        if (activeReadingTest) {
            setReadingPassPercent(activeReadingTest.passPercent || READING_POLICY.defaultPassPercent);
            setTestTimeLimit(activeReadingTest.timeLimit || 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeReadingTest?.id]);

    // Test yaratish. Bloklar bazaning NOMI bilan tanlanadi (eski razmetka
    // shunday), bazaga esa ID bo'yicha bog'lanadi - nom o'zgarsa test buzilmasin.
    const handleCreateTest = () => {
        const baseByTitle = new Map(questionBases.map(b => [b.title, b]));
        const blocks = testType === 'single'
            ? [{ baseId: baseByTitle.get(testSingleSubject)?.id, count: Number(testTotalLimit) || 0 }]
            : testBlocks
                .map(b => ({ baseId: baseByTitle.get(b.subject)?.id, count: parseInt(b.questionCount) || 0 }))
                .filter(b => b.baseId && b.count > 0);

        if (blocks.length === 0 || blocks.some(b => !b.baseId)) {
            setDataError('Savollar bazasini tanlang.');
            return;
        }

        const title = activeReadingTest
            ? `«${activeReadingTest.readingBook.title}» asaridan test`
            : testType === 'single'
                ? `${testSingleSubject} — test`
                : `Aralash test (${blocks.length} bo'lim)`;

        const settings = {
            blocks,
            timeLimit: Math.max(0, Number(testTimeLimit) || 0),
            pointsPerQuestion: Number(testPointsPerQuestion) || 1,
            maxScore: blocks.reduce((s, b) => s + b.count, 0) * (Number(testPointsPerQuestion) || 1),
            shuffleQuestions, shuffleOptions,
            // POTOK: o'zbek va rus potoklari alohida o'qiydi. Belgilanmasa
            // test har ikkalasida ko'rinadi.
            language: testLanguage || null,
            target: { faculty: targetFaculty, course: targetCourse, group: targetGroup, staff: targetStaff },
        };

        run(async () => {
            if (activeReadingTest) {
                // Asar uchun YANGI test yaratilmaydi - mavjud yozuv sozlanadi.
                // Aks holda bitta kitobga ikkita test paydo bo'lardi va qaysi
                // biri hisoblanishi noaniq bo'lib qolardi.
                //
                // `passPercent` shu yerda ham yoziladi: u kitob qo'shilganda
                // belgilangan, lekin bu oynadan ham o'zgartirilishi mumkin.
                const pass = Math.max(1, Math.min(100, Number(readingPassPercent) || READING_POLICY.defaultPassPercent));
                await db.updateTest(activeReadingTest.id, { ...settings, title, passPercent: pass });
            } else {
                await db.createTest({
                    title,
                    subject: testType === 'single' ? testSingleSubject : 'Aralash',
                    status: 'draft',
                    isPublished: false,
                    ...settings,
                });
            }
            setIsTestModalOpen(false);
            setReadingTestId('');
        }, activeReadingTest
            ? 'Asar testi sozlandi. Talabalarga ko\'rinishi uchun uni e\'lon qiling.'
            : 'Test yaratildi. Talabalarga ko\'rinishi uchun uni e\'lon qiling.');
    };

    const handleAddBlock = () => {
        setTestBlocks([...testBlocks, { id: Date.now(), subject: '', questionCount: 5 }]);
    };

    const handleRemoveBlock = (id) => {
        if (testBlocks.length > 1) {
            setTestBlocks(testBlocks.filter(b => b.id !== id));
        }
    };

    const handleUpdateBlock = (id, field, value) => {
        setTestBlocks(testBlocks.map(b => b.id === id ? { ...b, [field]: value } : b));
    };

    // Baza saqlangach oyna YOPILMAYDI - tahrirlash rejimiga o'tadi va siz shu
    // yerda savol qo'sha boshlaysiz. Aks holda "saqladim, endi qayerdan savol
    // qo'shaman?" degan savol tug'ilardi.
    const handleSaveBase = () => {
        if (!newBaseName.trim()) return;
        run(async () => {
            const created = await db.createQuestionBase({ title: newBaseName.trim() });
            setEditingBase({ ...created, questions: 0 });
            setIsEditMode(true);
            setNewBaseName('');
        }, 'Baza yaratildi. Endi unga savol qo\'shing.');
    };

    // Savollar bazadan. `subject` — bazaning nomi (eski razmetka shunga tayanadi).
    const questions = useMemo(() => {
        const baseTitle = new Map(db.getQuestionBases().map(b => [b.id, b.title]));
        return db.getTestQuestions().map(q => ({
            ...q,
            subject: baseTitle.get(q.baseId) || q.subject || '',
            difficulty: q.difficulty === 'easy' ? 'Oson' : q.difficulty === 'hard' ? 'Qiyin' : "O'rtacha",
            type: 'Yagona tanlov',
        }));
    }, [version]);


    // Natijalar — haqiqiy urinishlar (test_attempts).
    const testResults = useMemo(() => {
        const students = new Map(db.getMockStudents().map(st => [st.id, st]));
        return db.getTestAttempts().map(a => ({
            ...a,
            studentName: students.get(a.studentId)?.fullName || a.studentId,
            percentage: a.maxScore ? Math.round((a.score / a.maxScore) * 100) : 0,
        }));
    }, [version]);


    const handleDeleteQuestion = (id) => {
        if (!window.confirm("Savolni o'chirasizmi?")) return;
        run(() => db.deleteTestQuestion(id));
    };

    const handleEditQuestion = (question) => {
        const base = questionBases.find(b => b.title === question.subject);
        if (base) {
            setIsEditMode(true);
            setEditingBase(base);
            setNewBaseName(base.title);
            setIsQuestionModalOpen(true);
        } else {
            alert(`Tahrirlash: ${question.text}`);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="p-6 bg-white border-none shadow-sm mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <h1 className="text-2xl font-bold text-gray-900">Kutubxona va testlar</h1>

                    {/* Kitoblar tabida test qidirish va test yaratish tugmalari
                        ortiqcha: u yerda asarlar ro'yxati va o'z tugmalari bor. */}
                    {!['library', 'readers'].includes(activeTab) && (
                    <div className="flex flex-col md:flex-row items-center gap-4 flex-1 justify-end">
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Test qidirish..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <Button
                                variant="primary"
                                className="bg-purple-600 hover:bg-purple-700 border-none text-white text-xs font-bold py-2.5 px-4"
                                onClick={() => setIsBaseModalOpen(true)}
                            >
                                Testlar bazasini ko'rish
                            </Button>
                            <Button
                                variant="primary"
                                className="bg-emerald-600 hover:bg-emerald-700 border-none text-white text-xs font-bold py-2.5 px-4"
                                onClick={() => {
                                    setIsEditMode(false);
                                    setEditingBase(null);
                                    setNewBaseName('');
                                    setIsQuestionModalOpen(true);
                                }}
                            >
                                Testlar bazasini qo'shish
                            </Button>
                            <Button
                                variant="primary"
                                className="bg-indigo-600 hover:bg-indigo-700 border-none text-white text-xs font-bold py-2.5 px-4"
                                onClick={() => setIsTestModalOpen(true)}
                            >
                                Yangi test yaratish
                            </Button>
                        </div>
                    </div>
                    )}
                </div>
            </Card>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                {/* KITOBLAR - birinchi tab.
                    Ilgari "Kutubxona" alohida bo'lim edi, lekin u faqat
                    asarlar ro'yxatini ko'rsatardi va har asarning testi
                    baribir SHU bo'limda sozlanardi ("To'liq sozlash" tugmasi
                    bu yerga olib kelardi). Ikki bo'lim orasida borib-kelish
                    bitta ishning ikkiga bo'linishi edi. */}
                <button
                    onClick={() => setActiveTab('library')}
                    className={`px-8 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'library' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <div className="flex items-center">
                        <Library className="w-4 h-4 mr-2" /> Kitoblar
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('tests')}
                    className={`px-8 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'tests' ? 'border-primary-500 text-primary-500' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <div className="flex items-center">
                        <FileText className="w-4 h-4 mr-2" /> Testlar Ro'yxati
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('question-bank')}
                    className={`px-8 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'question-bank' ? 'border-primary-500 text-primary-500' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <div className="flex items-center">
                        <Database className="w-4 h-4 mr-2" /> Savollar Bazasi
                    </div>
                </button>
                {/* Testning SIFATI - o'tish foizi, tashlab ketilganlar va
                    potok kesimi. Ilgari yagona ko'rsatkich "nechta urinish"
                    edi va undan test yaxshimi yoki yomonmi bilib bo'lmasdi. */}
                {/* TALABALAR - kitobxonlik talaba kesimida.
                    Kitoblar tabi "qaysi asarni kim o'qidi" ga javob beradi,
                    bu esa "bu talaba nechta asar o'qidi" ga. 12 ta asarni
                    birma-bir ochib chiqish shu tab tufayli kerak emas. */}
                <button
                    onClick={() => setActiveTab('readers')}
                    className={`px-8 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'readers' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <div className="flex items-center">
                        <Users className="w-4 h-4 mr-2" /> Talabalar
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`px-8 py-4 font-bold text-sm transition-all border-b-2 ${activeTab === 'analytics' ? 'border-primary-500 text-primary-500' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <div className="flex items-center">
                        <TrendingUp className="w-4 h-4 mr-2" /> Tahlil
                    </div>
                </button>
            </div>

            {/* KITOBLAR - metodikaning "100 ta eng sara badiiy adabiyot"
                ro'yxati. Har asarga test biriktiriladi va u SHU bo'limdagi
                oddiy test yaratish oqimidan foydalanadi: asar qatoridagi
                "To'liq sozlash" o'sha oynani ochadi. */}
            {activeTab === 'library' && (
                <div className="space-y-6">
                    <Card className="border-l-4 border-l-emerald-400">
                        <p className="text-xs text-gray-600 flex items-start gap-2">
                            <Info size={14} className="text-emerald-600 shrink-0 mt-px" />
                            <span>
                                Bu ro'yxat <b>ijtimoiy faollik indeksining 1-mezoni</b> uchun.
                                Talaba asarni o'qiganini test orqali tasdiqlaydi va ball
                                avtomatik qo'shiladi. Har asarga <b>ta'lim tili</b> belgilanadi —
                                o'zbek va rus potoklari o'z ro'yxatini ko'radi.
                            </span>
                        </p>
                    </Card>
                    <ReadingTestsPanel />
                </div>
            )}

            {/* Tahlil tabida qidiruv/filtr ishlamaydi - u yerda ro'yxat emas,
                ko'rsatkich. */}
            {activeTab === 'analytics' && <TestAnalyticsTab />}

            {activeTab === 'readers' && <ReadingStudentsTab version={version} />}

            {/* Search and Filters */}
            {!['analytics', 'library', 'readers'].includes(activeTab) && (
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder={activeTab === 'question-bank' ? 'Fan yoki adabiyot nomi...' : 'Qidiruv...'}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 shadow-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                {/* Fan tanlagichi savollar bazasi tabida KERAK EMAS: u yerda
                    ro'yxatning o'zi fanlar kesimida va tanlagich shu ro'yxatni
                    takrorlagan bo'lardi. */}
                {activeTab !== 'question-bank' && (
                    <select
                        className="px-6 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 shadow-sm font-medium text-gray-600"
                        value={selectedSubject}
                        onChange={e => setSelectedSubject(e.target.value)}
                    >
                        <option value="Barcha fanlar">Barcha fanlar</option>
                        {questionBases.map(base => (
                            <option key={base.id} value={base.title}>{base.title}</option>
                        ))}
                    </select>
                )}
            </div>
            )}

            {activeTab === 'tests' ? (
                <div className="grid grid-cols-1 gap-4">
                    {/* Tur bo'yicha filtr. Ikkala tur bir ro'yxatda tursa ham,
                        "faqat kitobxonlik" degan savol tez-tez tug'iladi. */}
                    <div className="flex flex-wrap gap-1.5">
                        {[
                            { id: 'all', label: `Barchasi (${tests.length})` },
                            { id: 'reading', label: `Kitobxonlik (${tests.filter(t => t.isReadingTest).length})` },
                            { id: 'subject', label: `Fan testlari (${tests.filter(t => !t.isReadingTest).length})` },
                        ].map(k => (
                            <button
                                key={k.id}
                                type="button"
                                onClick={() => setTestKind(k.id)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                    testKind === k.id
                                        ? 'bg-gray-900 text-white border-gray-900'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {k.label}
                            </button>
                        ))}
                    </div>

                    {visibleTests.map(test => (
                        <Card
                            key={test.id}
                            className={`group hover:border-primary-200 transition-all border-l-4 ${
                                test.isReadingTest ? 'border-l-emerald-500' : 'border-l-primary-500'
                            }`}
                        >
                            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        <h3 className="text-xl font-bold text-gray-900">{test.title}</h3>
                                        <Badge variant={test.status === 'Faol' ? 'success' : test.status === 'Yakunlangan' ? 'secondary' : 'warning'}>
                                            {test.status}
                                        </Badge>
                                        {/* Kitobxonlik testi indeksga ball beradi - bu
                                            farq ko'rinib turishi kerak. */}
                                        {test.isReadingTest && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                                <BookOpen size={10} /> Kitobxonlik · 1-mezon
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-6 text-sm text-gray-500 font-medium flex-wrap">
                                        <span className="flex items-center"><Database className="w-4 h-4 mr-1 text-gray-400" /> {test.subject}</span>
                                        <span className="flex items-center"><FileText className="w-4 h-4 mr-1 text-gray-400" /> {test.questions} ta savol</span>
                                        <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-gray-400" /> {test.time} daqiqa</span>
                                        <span className="flex items-center text-primary-600"><CheckCircle className="w-4 h-4 mr-1" /> {test.studentsCount} ta bitirgan</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-8 px-2 text-[10px] font-bold ${test.isPublished ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50'}`}
                                            onClick={() => handlePublishResults(test.id)}
                                            icon={TrendingUp}
                                        >
                                            {test.isPublished ? "E'lon qilindi" : "Natijalarni e'lon qilish"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100"
                                            onClick={() => handleEditTest(test)}
                                            icon={Edit}
                                        >
                                            Tahrirlash
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100"
                                            onClick={() => handleDeleteTest(test.id)}
                                            icon={Trash2}
                                        >
                                            O'chirish
                                        </Button>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="ml-2 text-primary-600 border-primary-100 hover:bg-primary-50"
                                        onClick={() => {
                                            setSelectedTestForResults(test);
                                            setIsResultsModalOpen(true);
                                        }}
                                    >
                                        Natijalar
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}

                    {visibleTests.length === 0 && (
                        <Card className="border-dashed">
                            <p className="py-8 text-center text-sm text-gray-400">
                                {tests.length === 0
                                    ? "Hali test yaratilmagan"
                                    : "Filtrga mos test topilmadi"}
                            </p>
                        </Card>
                    )}
                </div>
            ) : activeTab === 'question-bank' ? (
                <QuestionBankTab
                    version={version}
                    searchTerm={searchTerm}
                    onChanged={() => setVersion(v => v + 1)}
                    onEditBase={(base) => {
                        setIsEditMode(true);
                        setEditingBase(base);
                        setNewBaseName(base.title);
                        setIsQuestionModalOpen(true);
                    }}
                />
            ) : null}

            {/* Question Base Modal */}
            <Modal
                isOpen={isBaseModalOpen}
                onClose={() => setIsBaseModalOpen(false)}
                title="Savollar bazalari"
                headerClassName="bg-indigo-600 text-white"
                size="xl"
            >
                <div className="space-y-2">
                    <p className="text-gray-100 text-xs font-medium opacity-80 -mt-5 mb-6">Barcha fanlar bo'yicha savollar bazalari</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {questionBases.map(base => (
                            <div key={base.id} className="p-5 border border-gray-100 rounded-2xl bg-white shadow-sm hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">{base.title}</h3>
                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-bold mt-1 uppercase tracking-wider">
                                            <Database size={14} />
                                            {base.questions} ta savol
                                        </div>
                                    </div>
                                    <Badge variant="success" size="sm" className="bg-emerald-50 text-emerald-600 border-emerald-100">
                                        {base.status}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant="primary"
                                        className="bg-indigo-50 text-indigo-600 border-none hover:bg-indigo-100 text-xs font-bold py-3"
                                        onClick={() => {
                                            setActiveTab('question-bank');
                                            setIsBaseModalOpen(false);
                                        }}
                                    >
                                        Ko'rish
                                    </Button>
                                    <Button
                                        variant="primary"
                                        className="bg-sky-50 text-sky-600 border-none hover:bg-sky-100 text-xs font-bold py-3"
                                        onClick={() => {
                                            setIsEditMode(true);
                                            setEditingBase(base);
                                            setNewBaseName(base.title);
                                            setIsQuestionModalOpen(true);
                                            setIsBaseModalOpen(false);
                                        }}
                                    >
                                        Tahrirlash
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isTestModalOpen}
                onClose={() => { setIsTestModalOpen(false); setReadingTestId(''); }}
                title={
                    <div className="flex items-center gap-3">
                        <span>{activeReadingTest ? 'Asar testini sozlash' : 'Yangi test yaratish'}</span>
                        <Badge variant="secondary" className="bg-white/20 text-white border-white/20">
                            {currentTotalQuestions} ta savol
                        </Badge>
                    </div>
                }
                size="xl"
                headerClassName="bg-indigo-600 text-white"
            >
                <div className="space-y-6">
                    {/* KITOBXONLIK ASARI.
                        Tanlanganda test o'sha asarga bog'lanadi va ijtimoiy faollik
                        indeksining 1-mezoniga hisoblanadi. Bog'lanish asarning
                        RAQAMI bo'yicha — nomni keyin o'zgartirsangiz ham buzilmaydi. */}
                    <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-2">
                        <label className="block text-sm font-bold text-gray-700">
                            Kitobxonlik asari <span className="font-normal text-gray-400">(ixtiyoriy)</span>
                        </label>
                        <select
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm"
                            value={readingTestId}
                            onChange={e => setReadingTestId(e.target.value)}
                        >
                            <option value="">Oddiy fan testi — asarga bog'lanmaydi</option>
                            {readingTests.map(t => (
                                <option key={t.id} value={t.id}>{t.readingBook.title}</option>
                            ))}
                        </select>
                        {activeReadingTest ? (
                            <>
                                {/* O'tish foizi kitob qo'shilganda belgilangan. Shu yerda
                                    ham ko'rinadi va o'zgartiriladi - bitta qiymat, ikki joyda
                                    ko'rinadi, alohida nusxasi yo'q. */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <label className="text-xs font-bold text-gray-600">O'tish chegarasi</label>
                                    <input
                                        type="number" min={1} max={100}
                                        className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-sm text-center bg-white"
                                        value={readingPassPercent}
                                        onChange={e => setReadingPassPercent(e.target.value)}
                                    />
                                    <span className="text-xs text-gray-500">% to'g'ri javob</span>
                                    {Number(readingPassPercent) !== Number(activeReadingTest.passPercent || READING_POLICY.defaultPassPercent) && (
                                        <span className="text-[11px] font-semibold text-amber-700">
                                            o'zgartirildi — saqlanganda qo'llanadi
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-emerald-700">
                                    Test nomi: <span className="font-bold">«{activeReadingTest.readingBook.title}» asaridan test</span>.
                                    Bu asar bo'yicha testdan o'tgan talaba kitobxonlik ballini avtomatik oladi.
                                </p>
                            </>
                        ) : (
                            <p className="text-[11px] text-gray-400">
                                Asar tanlansa test kitobxonlik mezoniga (1-mezon) hisoblanadi. Bo'sh qoldirilsa —
                                oddiy fan testi bo'lib qoladi va indeksga kirmaydi.
                            </p>
                        )}
                    </div>

                    {/* Test Type Selection */}
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
                        <label className="block text-sm font-bold text-gray-700">Test tuzilishi:</label>
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="test_type"
                                    className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                                    checked={testType === 'single'}
                                    onChange={() => setTestType('single')}
                                />
                                <span className="text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors">Bitta fan bo'yicha</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="test_type"
                                    className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                                    checked={testType === 'blocks'}
                                    onChange={() => setTestType('blocks')}
                                />
                                <span className="text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors">Blokli test (turli fanlar)</span>
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Test sarlavhasi *</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                                placeholder="Masalan: JavaScript asosiy tushunchalari"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Umumiy savollar soni (Limit) *</label>
                            <input
                                type="number"
                                className={`w-full px-4 py-3 bg-white border ${(isOverLimit || (testType === 'single' && testTotalLimit > (questionBases.find(b => b.title === testSingleSubject)?.questions || 0))) ? 'border-red-500' : 'border-gray-200'} rounded-xl focus:ring-2 focus:ring-primary-500`}
                                value={testTotalLimit}
                                onChange={(e) => setTestTotalLimit(parseInt(e.target.value) || 0)}
                            />
                            {isOverLimit && testType === 'blocks' && (
                                <p className="text-[10px] text-red-500 font-bold mt-1">
                                    {currentTotalQuestions - testTotalLimit} ta savol ortiqcha tanlanmoqda!
                                </p>
                            )}
                            {testType === 'single' && testSingleSubject && testTotalLimit > (questionBases.find(b => b.title === testSingleSubject)?.questions || 0) && (
                                <p className="text-[10px] text-red-500 font-bold mt-1">
                                    Siz savollar bazasidan ortiq sonni belgiladingiz!
                                </p>
                            )}
                        </div>

                        {testType === 'single' ? (
                            <div className="md:col-span-2 p-4 bg-blue-50/30 border border-blue-100 rounded-2xl flex items-center gap-6">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Fanni tanlang *</label>
                                    <select
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                                        value={testSingleSubject}
                                        onChange={(e) => setTestSingleSubject(e.target.value)}
                                    >
                                        <option value="">Fan tanlang</option>
                                        {questionBases.map(base => (
                                            <option key={base.id} value={base.title}>{base.title}</option>
                                        ))}
                                    </select>
                                </div>
                                {testSingleSubject && (
                                    <div className="bg-white px-6 py-3 border border-gray-100 rounded-xl min-w-[140px] text-center shadow-sm">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Bazadagi savollar</p>
                                        <p className="text-xl font-black text-primary-600">
                                            {questionBases.find(b => b.title === testSingleSubject)?.questions || 0} <span className="text-xs font-bold text-gray-400">ta</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="md:col-span-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Test bloklari *</label>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon={Plus}
                                        className="bg-emerald-50 text-emerald-600 border-none font-bold text-[10px] py-1"
                                        onClick={handleAddBlock}
                                    >
                                        Blok qo'shish
                                    </Button>
                                </div>
                                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                                    {testBlocks.map((block, index) => {
                                        const selectedBase = questionBases.find(b => b.title === block.subject);
                                        const availableQuestions = selectedBase?.questions || 0;
                                        const isBlockOverBase = (parseInt(block.questionCount) || 0) > availableQuestions;

                                        return (
                                            <div key={block.id} className="space-y-1">
                                                <div className={`p-4 border ${isBlockOverBase ? 'border-red-500 bg-red-50/10' : 'border-gray-100 bg-gray-50/50'} rounded-xl flex items-center gap-4 relative group`}>
                                                    <span className="text-xs font-bold text-gray-400 w-12">Blok {index + 1}</span>
                                                    <select
                                                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                                        value={block.subject}
                                                        onChange={(e) => handleUpdateBlock(block.id, 'subject', e.target.value)}
                                                    >
                                                        <option value="">Fan tanlang</option>
                                                        {questionBases.map(base => (
                                                            <option key={base.id} value={base.title}>{base.title}</option>
                                                        ))}
                                                    </select>
                                                    <div className="flex flex-col items-center">
                                                        <input
                                                            type="number"
                                                            className={`w-20 px-3 py-2 bg-white border ${isBlockOverBase ? 'border-red-500' : 'border-gray-200'} rounded-lg text-sm text-center`}
                                                            placeholder="Soni"
                                                            value={block.questionCount}
                                                            onChange={(e) => handleUpdateBlock(block.id, 'questionCount', e.target.value)}
                                                        />
                                                        {block.subject && (
                                                            <span className="text-[10px] text-gray-400 font-bold mt-1 whitespace-nowrap">Bazada: {availableQuestions} ta</span>
                                                        )}
                                                    </div>
                                                    {testBlocks.length > 1 && (
                                                        <button
                                                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                            onClick={() => handleRemoveBlock(block.id)}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                {isBlockOverBase && (
                                                    <p className="text-[10px] text-red-500 font-bold pl-12">
                                                        Siz savollar bazasidan ortiq sonni belgiladingiz!
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* BALL SOZLAMALARI.
                            Kitobxonlik testida ball butunlay boshqacha hisoblanadi:
                            test bali emas, O'TILGAN ASARLAR SONI hal qiladi. Shuning
                            uchun asar biriktirilganda "har savolga ball" va "ijtimoiy
                            ball" maydonlari ko'rsatilmaydi - ular bu yerda hech
                            narsaga ta'sir qilmaydi va faqat chalg'itardi.

                            Maydonlar O'CHIRILMADI: oddiy fan testlarida ular
                            avvalgidek turaveradi va ishlaydi. */}
                        {activeReadingTest ? (
                            <div className="md:col-span-2 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Vaqt (daqiqa)</label>
                                        <input
                                            type="number" min={0}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                                            placeholder="0 — cheklanmagan"
                                            value={testTimeLimit}
                                            onChange={e => setTestTimeLimit(e.target.value)}
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">0 yoki bo'sh — vaqt cheklanmaydi.</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Urinishlar soni</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-center font-bold text-gray-500"
                                            value={READING_POLICY.maxAttemptsPerBook}
                                            readOnly
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">Kitobxonlikda bir marta — universitet qarori.</p>
                                    </div>
                                </div>

                                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                                    <p className="text-xs font-bold text-amber-900">
                                        Kitobxonlikda ball test balidan emas — o'qilgan asarlar sonidan hisoblanadi
                                    </p>
                                    <p className="text-[11px] text-amber-800 leading-relaxed">
                                        Test faqat bitta savolga javob beradi: talaba shu asarni o'qiganmi yoki yo'q.
                                        Shuning uchun «har savolga ball» bu yerda ko'rsatilmaydi — u natijaga ta'sir
                                        qilmaydi. Muhimi <span className="font-bold">o'tish chegarasi</span> (yuqorida)
                                        va talaba jami nechta asardan o'tgani:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {INDEX_CRITERIA.READING.bands.filter(b => b.points > 0).map(b => (
                                            <span key={b.label} className="px-2 py-1 rounded-lg bg-white border border-amber-200 text-[11px] font-bold text-amber-900">
                                                {b.label} → {b.points} ball
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-amber-700">
                                        Bu jadval vazirlik metodikasidan — o'zgartirilmaydi.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 md:col-span-2">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Vaqt (daqiqa)</label>
                                    <input
                                        type="number" min={0}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                                        placeholder="0 — cheklanmagan"
                                        value={testTimeLimit}
                                        onChange={e => setTestTimeLimit(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Urinishlar soni *</label>
                                    <input type="number" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500" placeholder="1" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Har bir savolga ball *</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500"
                                        value={testPointsPerQuestion}
                                        onChange={(e) => setTestPointsPerQuestion(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Ijtimoiy ball</label>
                                    <input type="number" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500" placeholder="5" />
                                </div>
                            </div>
                        )}

                        {/* Audience Targeting Settings */}
                        <div className="md:col-span-2 p-5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                                <h3 className="font-bold text-gray-900 uppercase tracking-tighter text-sm">Auditoriya sozlamalari</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase">Fakultet</label>
                                    {/* Fakultetlar ro'yxati QO'LDA yozib qo'yilgan
                                        edi va platformadagi haqiqiy fakultetlarga
                                        mos kelmasdi - shu sabab tanlov hech qachon
                                        hech kimga to'g'ri kelmasdi. */}
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                        value={targetFaculty}
                                        onChange={e => setTargetFaculty(e.target.value)}
                                    >
                                        <option>Barchasi</option>
                                        {facultyOptions.map(f => <option key={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    {/* POTOK - talabaga o'z tilidagi testlar ko'rinadi. */}
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase">Ta'lim tili</label>
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                        value={testLanguage}
                                        onChange={e => setTestLanguage(e.target.value)}
                                    >
                                        <option value="">Har ikkala potok</option>
                                        {TEACHING_LANGUAGE_ORDER.map(k => (
                                            <option key={k} value={k}>{TEACHING_LANGUAGES[k].short}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase">Kurs</label>
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                        value={targetCourse}
                                        onChange={e => setTargetCourse(e.target.value)}
                                    >
                                        <option>Barchasi</option>
                                        <option>1-kurs</option>
                                        <option>2-kurs</option>
                                        <option>3-kurs</option>
                                        <option>4-kurs</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase">Guruh</label>
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                        value={targetGroup}
                                        onChange={e => setTargetGroup(e.target.value)}
                                    >
                                        <option>Barchasi</option>
                                        <option>101-guruh</option>
                                        <option>202-guruh</option>
                                        <option>303-guruh</option>
                                    </select>
                                </div>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer group pt-2">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                    checked={targetStaff}
                                    onChange={() => setTargetStaff(!targetStaff)}
                                />
                                <p className="text-sm font-medium text-gray-700">Xodimlar uchun (Faqat xodimlar ishtirok eta oladi)</p>
                            </label>
                        </div>

                        {/* Order Settings */}
                        <div className="md:col-span-2 p-4 bg-purple-50/50 border border-purple-100 rounded-xl space-y-4">
                            <label className="block text-sm font-bold text-gray-700">Savollar tartibi:</label>
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                        checked={shuffleQuestions}
                                        onChange={() => setShuffleQuestions(!shuffleQuestions)}
                                    />
                                    <p className="text-sm font-medium text-gray-700">Savollar o'rnini almashtirish (Tasodifiy)</p>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                        checked={shuffleOptions}
                                        onChange={() => setShuffleOptions(!shuffleOptions)}
                                    />
                                    <p className="text-sm font-medium text-gray-700">Javob variantlari o'rnini almashtirish</p>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex gap-4">
                        <Button variant="outline" className="flex-1 py-4 font-bold border-gray-200" onClick={() => setIsTestModalOpen(false)}>Bekor qilish</Button>
                        <Button
                            variant="primary"
                            className={`flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 border-none font-bold text-white ${isTestInvalid ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isTestInvalid}
                            onClick={handleCreateTest}
                        >
                            Yaratish
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* New Question Base Modal */}
            <Modal
                isOpen={isQuestionModalOpen}
                onClose={closeBaseModal}
                title={editingBase ? `Savollar bazasi — ${editingBase.title}` : 'Savollar bazasi yaratish'}
                subtitle={editingBase ? 'Bazaga savollarni qo\'shing' : 'Fan bo\'yicha test savollari bazasini shakllantiring'}
                headerClassName={`${editingBase ? 'bg-sky-600' : 'bg-emerald-600'} text-white`}
                size="2xl"
            >
                <div className="space-y-6">
                    {/* Base Info Section */}
                    {/* Xabar oynaning TEPASIDA - ilgari u savol formasining
                        ostida edi va uzun oynada ko'rinmay qolardi. */}
                    {dataError && (
                        <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                            {dataError}
                        </p>
                    )}
                    {flash && (
                        <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                            {flash}
                        </p>
                    )}
                    {importing && (
                        <p className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2.5">
                            Fayl yuklanmoqda — kuting...
                        </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Fan nomi *</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                                placeholder="Masalan: Konstitutsiya huquqi"
                                value={editingBase ? editingBase.title : newBaseName}
                                onChange={e => setNewBaseName(e.target.value)}
                                readOnly={!!editingBase}
                            />
                            {!editingBase && (
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Nomni yozib to'g'ridan-to'g'ri savol qo'shishingiz mumkin — baza birinchi savol bilan yaratiladi.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Jami savollar</label>
                            <input
                                type="number"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-center font-bold"
                                value={editingBase ? db.getTestQuestions(editingBase.id).length : 0}
                                readOnly
                            />
                        </div>
                    </div>

                    {/* Bazaga kiritilgan savollar. Ilgari bu ro'yxat umuman yo'q edi -
                        savol qo'shilardi, lekin u ko'rinmasdi va "qo'shildimi yoki
                        yo'qmi" degan savol qolardi. */}
                    {editingBase && (() => {
                        const baseQuestions = db.getTestQuestions(editingBase.id);
                        return (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="font-bold text-gray-900 text-sm">Bazadagi savollar</h3>
                                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] font-bold text-gray-500 tabular-nums">
                                        {baseQuestions.length} ta
                                    </span>
                                </div>

                                {baseQuestions.length === 0 ? (
                                    <div className="py-8 text-center border border-dashed border-gray-200 rounded-2xl">
                                        <p className="text-xs text-gray-400">Hali savol qo'shilmagan.</p>
                                    </div>
                                ) : (
                                    // Har savol - alohida karta. Ilgari ular chetdan chetga
                                    // cho'zilgan bir tekis ro'yxat edi va savollar
                                    // bir-biridan ajralmasdi.
                                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                        {baseQuestions.map((q, i) => {
                                            const isEditing = editingQuestionId === q.id;
                                            return (
                                                <div
                                                    key={q.id}
                                                    className={`group rounded-2xl border transition-colors ${
                                                        isEditing
                                                            ? 'border-sky-300 bg-sky-50/70 ring-1 ring-sky-200'
                                                            : 'border-gray-100 bg-white hover:border-gray-200'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3 p-3">
                                                        <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-extrabold ${
                                                            isEditing ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-500'
                                                        }`}>
                                                            {i + 1}
                                                        </span>

                                                        <div className="flex-1 min-w-0 space-y-2">
                                                            <p className="text-sm font-semibold text-gray-900 leading-snug">{q.text}</p>

                                                            {/* Variantlar ikki ustunda - chetdan chetga
                                                                cho'zilib ketmasin va ko'z bilan solishtirish
                                                                oson bo'lsin. */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                                {(q.options || []).map((opt, oi) => {
                                                                    const correct = oi === q.correctIndex;
                                                                    return (
                                                                        <div
                                                                            key={oi}
                                                                            className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] ${
                                                                                correct
                                                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold'
                                                                                    : 'border-gray-100 bg-gray-50/70 text-gray-600'
                                                                            }`}
                                                                        >
                                                                            <span className={`shrink-0 w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-extrabold ${
                                                                                correct ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border border-gray-200'
                                                                            }`}>
                                                                                {['A', 'B', 'C', 'D', 'E', 'F'][oi]}
                                                                            </span>
                                                                            <span className="min-w-0 break-words">{opt}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* Amallar odatda ko'rinmaydi - sichqoncha
                                                            olib borilganda chiqadi, ro'yxat tinch turadi. */}
                                                        <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditQuestion(q)}
                                                                className="p-1.5 text-sky-600 hover:bg-sky-100 rounded-lg"
                                                                title="Tahrirlash"
                                                            >
                                                                <Edit className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => run(() => db.deleteTestQuestion(q.id))}
                                                                className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg"
                                                                title="Savolni o'chirish"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Question Adding Section */}
                    <div className="p-6 border border-gray-100 rounded-2xl bg-gray-50/50 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-gray-900">
                                {editingQuestionId ? 'Savolni tahrirlash' : 'Yangi savol qo\'shish'}
                                {editingBase && <span className="text-gray-400 font-normal"> — {editingBase.title}</span>}
                            </h3>
                            <div className="flex gap-2">
                                <input
                                    ref={questionFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportQuestions(f); e.target.value = ''; }}
                                />
                                <Button
                                    variant="secondary"
                                    className="bg-sky-50 text-sky-600 border-none text-[10px] font-bold py-1.5 px-3 uppercase tracking-wider"
                                    onClick={() => questionFileRef.current?.click()}
                                >
                                    Excel'dan yuklash
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="bg-purple-50 text-purple-600 border-none text-[10px] font-bold py-1.5 px-3 uppercase tracking-wider"
                                    onClick={downloadQuestionTemplate}
                                >
                                    Shablon yuklab olish
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Savol matni *</label>
                                <textarea
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                                    placeholder="Savol matnini kiriting..."
                                    value={qText}
                                    onChange={e => setQText(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Qiyinlik darajasi *</label>
                                <select
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                                    value={qDifficulty}
                                    onChange={e => setQDifficulty(e.target.value)}
                                >
                                    <option value="easy">Oson</option>
                                    <option value="medium">O'rtacha</option>
                                    <option value="hard">Qiyin</option>
                                </select>
                                <div className="mt-4 p-3 bg-emerald-50 rounded-lg">
                                    <p className="text-[10px] text-emerald-700 leading-tight">
                                        <b>Eslatma:</b> Qiyinlik darajasi talaba to'playdigan yakuniy ballga ta'sir qilishi mumkin.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-gray-500 uppercase">Javob variantlari *</label>
                            {['A', 'B', 'C', 'D'].map((opt, idx) => (
                                <div key={opt} className="flex items-center gap-3 group">
                                    <div className="relative flex items-center">
                                        <input
                                            type="radio"
                                            name="correct_answer"
                                            id={`opt_${opt}`}
                                            className="w-5 h-5 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                                            checked={qCorrect === idx}
                                            onChange={() => setQCorrect(idx)}
                                        />
                                    </div>
                                    <span className="w-5 font-bold text-gray-400">{opt}</span>
                                    <input
                                        type="text"
                                        className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                                        placeholder={`${idx + 1}-variant`}
                                        value={qOptions[idx]}
                                        onChange={e => setQOptions(prev => prev.map((o, i) => (i === idx ? e.target.value : o)))}
                                    />
                                </div>
                            ))}
                        </div>

                        <p className="text-[10px] text-gray-400 italic">To'g'ri javobni belgilang</p>

                        {dataError && (
                            <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{dataError}</p>
                        )}
                        {flash && (
                            <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{flash}</p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button
                                variant="primary"
                                className={`flex-1 border-none text-xs font-bold py-3 ${editingQuestionId ? 'bg-sky-600 hover:bg-sky-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                disabled={!qText.trim()}
                                onClick={handleAddQuestion}
                            >
                                {editingQuestionId ? "O'zgarishlarni saqlash" : "+ Savolni qo'shish"}
                            </Button>
                            <Button variant="outline" className="text-xs font-bold py-3 px-8" onClick={resetQuestionForm}>
                                {editingQuestionId ? 'Bekor qilish' : 'Tozalash'}
                            </Button>
                        </div>
                    </div>

                    {/* Final Footer Buttons */}
                    <div className="flex gap-4 pt-4">
                        <Button
                            variant="outline"
                            className="flex-1 py-4 text-gray-600 font-bold border-gray-200"
                            onClick={closeBaseModal}
                        >
                            {editingBase ? 'Yopish' : 'Bekor qilish'}
                        </Button>
                        <Button
                            variant="primary"
                            className={`flex-[1.5] py-4 font-bold border-none text-white ${editingBase ? 'bg-sky-600 hover:bg-sky-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            disabled={!editingBase && !newBaseName.trim()}
                            onClick={() => {
                                // Baza mavjud bo'lsa saqlanadigan narsa qolmagan -
                                // savollar qo'shilgani zahoti yozilib boradi.
                                // Bo'sh baza yaratish ham mumkin: nom yozib shu
                                // tugmani bosish yetadi.
                                if (editingBase) closeBaseModal();
                                else handleSaveBase();
                            }}
                        >
                            {editingBase ? 'Tayyor' : 'Bo\'sh bazani yaratish'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Test Results Modal */}
            <Modal
                isOpen={isResultsModalOpen}
                onClose={() => { setIsResultsModalOpen(false); setOpenAttemptId(null); }}
                title={selectedTestForResults?.title || "Test Natijalari"}
                subtitle={selectedTestForResults ? `${db.getTestQuestionCount(selectedTestForResults.id)} ta savol` : ''}
                headerClassName="bg-white border-b border-gray-100"
                size="full"
            >
                <div className="space-y-4">
                    {/* Bitta urinish ochilgan bo'lsa - uning ichi. Ro'yxat
                        o'rniga, chunki ikkalasi bir vaqtda kerak emas va
                        yonma-yon oyna torlik qilardi. */}
                    {openAttemptId ? (
                        <AttemptDetailView
                            attemptId={openAttemptId}
                            onBack={() => setOpenAttemptId(null)}
                        />
                    ) : (() => {
                        const rows = testResults.filter(r =>
                            !selectedTestForResults || r.testId === selectedTestForResults.id);

                        if (rows.length === 0) {
                            return (
                                <p className="py-10 text-center text-sm text-gray-400">
                                    Bu test bo'yicha hali natija yo'q.
                                </p>
                            );
                        }

                        const avg = Math.round(rows.reduce((s, r) => s + r.percentage, 0) / rows.length);
                        const passed = rows.filter(r => r.percentage >= 60).length;

                        return (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Topshirganlar', value: rows.length },
                                        { label: "O'rtacha foiz", value: avg + '%' },
                                        { label: '60% dan yuqori', value: passed },
                                        { label: 'Eng yuqori', value: Math.max(...rows.map(r => r.percentage)) + '%' },
                                    ].map(s => (
                                        <div key={s.label} className="px-3 py-2.5 bg-white border border-gray-100 rounded-xl">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{s.label}</p>
                                            <p className="text-xl font-extrabold text-gray-900 tabular-nums mt-0.5">{s.value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-gray-50 text-[10px] uppercase text-gray-500">
                                                <th className="px-3 py-2.5 text-center w-10 font-bold">№</th>
                                                <th className="px-4 py-2.5 text-left font-bold">Ismi sharifi</th>
                                                <th className="px-3 py-2.5 text-right font-bold">To'g'ri javob</th>
                                                <th className="px-3 py-2.5 text-right font-bold">Ball</th>
                                                <th className="px-3 py-2.5 text-right font-bold">Foiz</th>
                                                <th className="px-3 py-2.5 text-right font-bold">Topshirilgan vaqt</th>
                                                <th className="px-3 py-2.5 w-8" aria-hidden="true"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {rows
                                                .slice()
                                                .sort((a, b) => b.percentage - a.percentage)
                                                .map((r, index) => (
                                                    <tr
                                                        key={r.id}
                                                        onClick={() => setOpenAttemptId(r.id)}
                                                        className="group hover:bg-indigo-50/60 cursor-pointer transition-colors"
                                                        title="Batafsil ko'rish"
                                                    >
                                                        <td className="px-3 py-2.5 text-center text-gray-400">{index + 1}</td>
                                                        <td className="px-4 py-2.5 font-bold text-gray-900">{r.studentName}</td>
                                                        <td className="px-3 py-2.5 text-right tabular-nums">{r.correct} / {r.total}</td>
                                                        <td className="px-3 py-2.5 text-right tabular-nums">{r.score} / {r.maxScore}</td>
                                                        <td className={`px-3 py-2.5 text-right tabular-nums font-extrabold ${
                                                            r.percentage >= 60 ? 'text-emerald-600' : 'text-rose-500'
                                                        }`}>
                                                            {r.percentage}%
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-400">
                                                            {r.finishedAt ? new Date(r.finishedAt).toLocaleString('uz-UZ') : '—'}
                                                        </td>
                                                        <td className="px-2 py-2.5 text-gray-300 group-hover:text-indigo-500 transition-colors">
                                                            <ChevronRight size={14} />
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </Modal>
        </div >
    );
};

export default TestManagement;
