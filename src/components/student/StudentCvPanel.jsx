import React, { useMemo } from 'react';
import { FileText, ShieldCheck, Info } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { buildCv } from '../../utils/cvEngine';
import CvPreviewDocument from './CvPreviewDocument';

// XODIM KO'RINISHIDAGI CV / PORTFOLIO.
//
// Bitta komponent uch joyda: admin va rahbariyat "Global talabalar"
// modalida, tyutor esa o'z mentee oynasida ishlatadi.
//
// IDENTIFIKATOR. CV profili USERNAME bo'yicha saqlanadi (RLS
// `student_id = current_username()`), talabalar ro'yxati esa `id` bilan
// ishlaydi va u uch xil bo'lishi mumkin: sintetik `student_42`, eski real
// akkaunt `talaba` (o'zi username), yoki Supabase profilining UUID si.
// Shuning uchun username loyihadagi mavjud naqsh bilan echiladi
// (`username === x || id === x`). Buni adashtirsak, CV jimgina bo'sh
// chiqardi - xato ham bermasdi.
//
// ALOQA MA'LUMOTI hech qachon `manual.links` dan olinmaydi: u talabaning
// o'zi yozgan va filtrlanmagan. Xodim uchun qaror `db.getStudentContact`
// ichidagi pasport qoidalarida qabul qilinadi.
const resolveUsername = (student, studentId) => {
    const raw = student?.username || studentId || student?.id;
    if (student?.username) return student.username;
    const profiles = db.getSyncedProfiles() || [];
    const hit = profiles.find(p => p.username === raw || p.id === raw);
    return hit?.username || raw;
};

const StudentCvPanel = ({ student = null, studentId = null }) => {
    const { user } = useAuth();
    const uname = useMemo(() => resolveUsername(student, studentId), [student, studentId]);

    const cv = useMemo(() => (uname ? buildCv(db, uname) : null), [uname]);
    const contact = useMemo(
        () => (uname ? db.getStudentContact(uname, user) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [uname, user?.username]
    );

    if (!cv) return null;

    // Qo'lda kiritiladigan qism. U bo'sh bo'lishining IKKI sababi bor va
    // ularni brauzerdan ajratib bo'lmaydi: talaba hali kiritmagan, yoki
    // RLS bu foydalanuvchiga qatorni umuman bermagan (rahbariyat aynan
    // shunday holatda). Shuning uchun matn ikkalasini ham qamraydi -
    // "kiritilmagan" deb yozish yolg'on bo'lishi mumkin edi.
    const manualEmpty = !cv.manual?.bio
        && (cv.manual?.skills || []).length === 0
        && (cv.manual?.languages || []).length === 0
        && (cv.manual?.experience || []).length === 0;

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h4 className="flex items-center gap-2 font-bold text-gray-900 text-sm">
                        <FileText size={15} className="text-blue-700" /> CV va portfolio
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        Talabaning o'z sahifasidagi hujjatning aynan o'zi
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                        <ShieldCheck size={12} /> {cv.completeness.filled}/{cv.completeness.total} bo'lim
                    </span>
                </div>
            </div>

            {/* ALOQA - pasport qoidalari bo'yicha. Ko'rsatilmasa, sababi
                ruxsat, ma'lumot yo'qligi emas - shuni aytib qo'yamiz. */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Aloqa</p>
                {contact?.phone || contact?.email ? (
                    <p className="text-xs text-gray-700">
                        {[contact.phone, contact.email].filter(Boolean).join('  ·  ')}
                    </p>
                ) : (
                    <p className="text-xs text-gray-400">
                        {contact?.restricted
                            ? "Ko'rsatilmadi — sizning ruxsat darajangizda ochilmaydi"
                            : "Kiritilmagan"}
                    </p>
                )}
            </div>

            {manualEmpty && (
                <p className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
                    <Info size={13} className="shrink-0 mt-px" />
                    <span>
                        CV ning qo'lda kiritiladigan qismi (qisqacha ma'lumot, ko'nikmalar, tillar,
                        ish tajribasi) ko'rinmayapti. Bu talaba uni hali to'ldirmaganini yoki sizning
                        ruxsat darajangizda ochilmasligini bildiradi — ikkalasini bu yerdan ajratib
                        bo'lmaydi. Quyidagi tasdiqlangan bo'limlar har qanday holatda to'liq.
                    </span>
                </p>
            )}

            <CvPreviewDocument studentId={uname} contactOverride={contact} showMetrics={false} />
        </div>
    );
};

export default StudentCvPanel;
