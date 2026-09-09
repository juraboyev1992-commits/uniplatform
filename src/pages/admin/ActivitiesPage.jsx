import React from 'react';
import { Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { useTabParam } from '../../hooks/useTabParam';
import EventManagement from '../../components/admin/EventManagement';
import CompetitionWorkspacePage from './CompetitionWorkspacePage';

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
    const [kind, setKind] = useTabParam(KIND_IDS, defaultKind, 'kind');

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
            </div>

            {kind === 'events' ? <EventManagement /> : <CompetitionWorkspacePage />}
        </div>
    );
};

export default ActivitiesPage;
