import React from 'react';
import { Library, Info } from 'lucide-react';
import Card from '../../components/common/Card';
import ReadingTestsPanel from './ReadingTestsPanel';

// KUTUBXONA BOSHQARUVI.
//
// Ilgari bu sahifada ikkita ko'rinish bor edi: "Katalog" va "Kitobxonlik
// mezoni". Katalog TO'LIQ TO'QIMA edi — kodga yozib qo'yilgan kitoblar,
// muqovalar, "3 nusxa mavjud" kabi ko'rsatkichlar. Platformada kitoblar
// jadvali umuman yo'q, ya'ni u yerda hech narsa saqlanmasdi ham.
//
// Katalog OLIB TASHLANDI. Universitetga haqiqiy kutubxona tizimi (kitob
// berish-qaytarish, ombor, band qilish) kerak emas — bu bo'lim metodikaning
// 1-mezoni uchun: TAVSIYA ETILGAN ASARLAR RO'YXATI va ular bo'yicha testlar.
//
// Ro'yxat POTOK bo'yicha ajratiladi: o'zbek va rus potoklari alohida asarlar
// o'qiydi, shuning uchun har asarga ta'lim tili belgilanadi.
const LibraryManagement = () => (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter flex items-center gap-2">
                    <Library className="w-6 h-6 text-emerald-600" />
                    Kutubxona
                </h1>
                <p className="text-gray-500 font-medium">
                    Tavsiya etilgan badiiy adabiyot ro'yxati va ular bo'yicha testlar
                </p>
            </div>
        </div>

        <Card className="border-l-4 border-l-emerald-400">
            <p className="text-xs text-gray-600 flex items-start gap-2">
                <Info size={14} className="text-emerald-600 shrink-0 mt-px" />
                <span>
                    Bu bo'lim <b>ijtimoiy faollik indeksining 1-mezoni</b> uchun. Talaba asarni
                    o'qiganini test orqali tasdiqlaydi va ball avtomatik qo'shiladi.
                    Har asarga <b>ta'lim tili</b> belgilanadi — o'zbek va rus potoklari
                    o'z ro'yxatini ko'radi.
                </span>
            </p>
        </Card>

        <ReadingTestsPanel />
    </div>
);

export default LibraryManagement;
