import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Trophy, LayoutGrid, List } from 'lucide-react';
import { useTabParam } from '../../hooks/useTabParam';
import EventManagement from '../../components/admin/EventManagement';
import ActivityCalendar from '../../components/admin/ActivityCalendar';
import CompetitionWorkspacePage from './CompetitionWorkspacePage';
import { db } from '../../services/db';

// TADBIRLAR VA MUSOBAQALAR — bitta bo'lim.
//
// Ilgari menyuda ikkita alohida yozuv turardi ("Tadbirlar" va "Musobaqalar")
// va ular bir-biriga umuman bog'lanmagan ikki sahifaga olib borardi. Talaba
// panelida esa ular ALLAQACHON bitta bo'lim edi: yuqorida ikkita tab, ostida
// bir xil qobiq. Mas'ul va talaba bir xil narsani ikki xil shaklda ko'rar edi.
//
// Endi admin tomonida ham shu shakl: yuqorida "Tadbirlar / Musobaqa-Turnirlar"
// tablari (talaba panelidagi bilan bir xil ko'rinishda), ostida esa
// tegishli sahifa.
//
// SAHIFALARNING ICHIGA TEGILMADI. Ikkalasi ham avvalgidek ishlaydi:
// tadbirda kalendar, xonalar bandligi, yaratish/tahrirlash, arxiv;
// musobaqada ro'yxat, qidiruv va katalog/ro'yxat ko'rinishi. Bu ataylab -
// birlashtirish KO'RINISH masalasi edi, funksiyalarni qayta yozish emas.
//
// Tab MANZILDA saqlanadi (`?kind=`), ya'ni hamkasbga yuborilgan havola
// to'g'ri tabni ochadi va brauzerning "orqaga" tugmasi ishlaydi.
const KIND_TABS = [
    { id: 'events', label: 'Tadbirlar', icon: CalendarIcon },
    { id: 'competitions', label: 'Musobaqa / Turnirlar', icon: Trophy },
];
const KIND_IDS = KIND_TABS.map(t => t.id);

const ActivitiesPage = ({ defaultKind = 'events' }) => {
    const navigate = useNavigate();
    const [kind, setKind] = useTabParam(KIND_IDS, defaultKind, 'kind');
    // Musobaqalar tabining ko'rinishi. Sukut - RO'YXAT: musobaqa bilan
    // ishlashning asosiy yo'li o'sha (qidiruv, natija kiritish, sozlash).
    // Kalendar "qachon nima bo'ladi" degan boshqa savolga javob beradi.
    const [compView, setCompView] = useState('list'); // 'list' | 'calendar'

    // Kalendar uchun yozuvlar - tadbir, musobaqa va Turlar birga. Filtrni
    // kalendarning o'zi qiladi, bu yerda faqat boshlang'ich qamrov beriladi.
    const calendarEntries = useMemo(() => db.getCalendarEntries(), [kind, compView]);

    return (
        <div className="space-y-6">
            {/* Talaba panelidagi bilan AYNI ko'rinish: oq fon, yumaloq
                burchak, faol tab to'q ko'k. Ikki panelda bir xil narsa bir
                xil ko'rinishi kerak - aks holda odam rol almashtirganda
                qaytadan o'rganishga majbur bo'ladi. */}
            <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                {KIND_TABS.map(t => {
                    const active = kind === t.id;
                    return (
                        <button
                            key={t.id} type="button" onClick={() => setKind(t.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                                active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <t.icon size={15} /> {t.label}
                        </button>
                    );
                })}
                {/* Ro'yxat / Kalendar - FAQAT musobaqalar tabida. Tadbirlar
                    tabida kalendar allaqachon o'z ichida turadi va u yerda
                    yaratish, xonalar bandligi va arxiv ham shu qatorda -
                    ikkinchi almashtirgich qo'yish ikki xil boshqaruvni bir
                    ekranga tiqishtirardi. */}
                {kind === 'competitions' && (
                    <div className="flex bg-gray-100 rounded-2xl p-1 w-fit">
                        <button
                            type="button"
                            onClick={() => setCompView('list')}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                compView === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                            }`}
                        >
                            <List size={14} /> Ro'yxat
                        </button>
                        <button
                            type="button"
                            onClick={() => setCompView('calendar')}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                compView === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                            }`}
                        >
                            <LayoutGrid size={14} /> Kalendar
                        </button>
                    </div>
                )}
            </div>

            {kind === 'events' && <EventManagement />}

            {kind === 'competitions' && compView === 'list' && <CompetitionWorkspacePage />}

            {/* Musobaqa kalendari. Boshlang'ich qamrov - "Musobaqalar"
                (musobaqa + Tur), lekin filtr o'z joyida qoladi: kerak bo'lsa
                mas'ul "Hammasi" ga o'tib, tadbir bilan musobaqa bitta xonaga
                tushib qolganini ko'radi. Aynan shu tekshiruvni yo'qotmaslik
                uchun tab bo'yicha qat'iy ajratish qilinmadi.
                Yaratish tugmasi yo'q: musobaqa kalendardan emas, sehrgar
                orqali yaratiladi. */}
            {kind === 'competitions' && compView === 'calendar' && (
                <ActivityCalendar
                    entries={calendarEntries}
                    defaultScope="competitions"
                    onOpenEntry={(entry) => {
                        if (entry.kind === 'event') {
                            navigate(`/admin/events/${entry.id}`);
                            return;
                        }
                        navigate(`/admin/competitions/${entry.id}`);
                    }}
                />
            )}
        </div>
    );
};

export default ActivitiesPage;
