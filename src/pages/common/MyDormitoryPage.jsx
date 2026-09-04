import React, { useMemo, useState } from 'react';
import { Building, Users, Info } from 'lucide-react';
import Card from '../../components/common/Card';
import ConductAssessmentPanel from '../../components/sport/ConductAssessmentPanel';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// "Mening yotoqxonam" — yotoqxona mudirining ish maydoni.
//
// VAKOLAT ROLGA EMAS, BIRIKTIRUVGA bog'liq: sahifa faqat mudir sifatida
// biriktirilgan akkauntga ochiladi va faqat O'SHA yotoqxonadagi talabalarni
// ko'rsatadi. Yangi rol ochilmadi - "Mening shogirdlarim" bilan bir xil
// tamoyil.
//
// Mudirning yagona ishi: 10-mezonning "toza-ozoda yurish" bandi. Ball
// qo'ymaydi - faqat buzilishni qayd etadi.
const MyDormitoryPage = () => {
    const { user } = useAuth();
    const [openId, setOpenId] = useState(null);

    const myDorms = useMemo(
        () => db.getMyDormitories(user?.username),
        [user?.username]
    );

    const activeDormId = openId || myDorms[0]?.id || null;
    const residents = useMemo(
        () => (activeDormId ? db.getDormitoryStudents(activeDormId) : []),
        [activeDormId]
    );
    const students = useMemo(() => residents.map(r => r.student), [residents]);

    return (
        <div className="space-y-6 font-sans">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                    <Building className="w-7 h-7 text-slate-600" />
                    Mening yotoqxonam
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Ijtimoiy faollik indeksining 10-mezoni — «toza-ozoda yurish, saranjom-sarishtalik»
                </p>
            </div>

            {myDorms.length === 0 ? (
                <Card>
                    <div className="p-8 text-center space-y-2">
                        <Users size={28} className="mx-auto text-gray-300" />
                        <p className="text-sm font-semibold text-gray-700">
                            Sizga yotoqxona biriktirilmagan
                        </p>
                        <p className="text-xs text-gray-500 max-w-md mx-auto">
                            Mudirning vakolati rolga emas, biriktiruvga bog'liq. Administrator
                            sizni yotoqxonaga mudir sifatida biriktirgach, u yerdagi talabalar
                            shu yerda ko'rinadi.
                        </p>
                    </div>
                </Card>
            ) : (
                <>
                    {/* Bir necha yotoqxonaga biriktirilgan bo'lishi mumkin. */}
                    {myDorms.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                            {myDorms.map(d => (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => setOpenId(d.id)}
                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                                        activeDormId === d.id
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-white border border-gray-200 text-gray-600'
                                    }`}
                                >
                                    {d.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {residents.length === 0 ? (
                        <Card>
                            <div className="p-8 text-center space-y-2">
                                <p className="text-sm font-semibold text-gray-700">
                                    Bu yotoqxonada talaba qayd etilmagan
                                </p>
                                <p className="text-xs text-gray-500 max-w-md mx-auto flex items-center justify-center gap-1.5">
                                    <Info size={12} />
                                    Talabaning turar joyini administrator kiritadi.
                                </p>
                            </div>
                        </Card>
                    ) : (
                        <ConductAssessmentPanel students={students} />
                    )}
                </>
            )}
        </div>
    );
};

export default MyDormitoryPage;
