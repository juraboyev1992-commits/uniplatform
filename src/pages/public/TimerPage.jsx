import React from 'react';
import { Timer as TimerIcon } from 'lucide-react';
import CompetitionTimer from '../../components/common/CompetitionTimer';

// ALOHIDA TAYMER SAHIFASI.
//
// NEGA ALOHIDA MANZIL: taymer hozir ikki joyda bor - jonli ekran ichida
// (jadval bilan birga) va yuqori qatordagi ochiladigan oynada. Ikkalasi
// ham boshqa narsa bilan band. Operator esa ba'zan FAQAT taymerni
// ikkinchi monitorga yoki alohida oynaga chiqarmoqchi bo'ladi.
//
// Bu sahifa jonli ekran bilan O'ZI sinxronlanadi (brauzer kanali
// orqali), ya'ni bu yerda bosilgan tugma u yerda ham ishlaydi.
//
// KIRISH TALAB QILINMAYDI: sahifada hech qanday ma'lumot yo'q - na
// natija, na ism, na musobaqa nomi. Faqat raqam. Shuning uchun
// proyektor kompyuterida uni to'g'ridan-to'g'ri ochsa bo'ladi.
//
// Sozlama MUSOBAQAGA bog'lanmagan: bu sahifa qaysi musobaqa ekanini
// bilmaydi. Vaqtni shu yerda qo'lda qo'yasiz. Musobaqaning o'z vaqti
// kerak bo'lsa, jonli ekrandagi taymerdan foydalaning.
const TimerPage = () => (
    <div className="min-h-screen bg-slate-950 text-white p-4 lg:p-8 flex flex-col">
        <div className="flex items-center gap-3 mb-6 shrink-0">
            <TimerIcon size={28} className="text-indigo-400" />
            <h1 className="text-2xl lg:text-3xl font-black">Savol taymeri</h1>
        </div>

        <div className="flex-1 flex items-start">
            <div className="w-full">
                <CompetitionTimer />
            </div>
        </div>

        <p className="mt-6 text-sm text-slate-600 shrink-0">
            Bu oyna jonli ekran bilan birga yuradi &mdash; bir xil brauzerda
            ochilgan bo&rsquo;lsa.
        </p>
    </div>
);

export default TimerPage;
