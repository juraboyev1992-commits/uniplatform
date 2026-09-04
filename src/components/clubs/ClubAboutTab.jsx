import React from 'react';
import {
    Target, Compass, Sparkles, Users, Phone, Mail, MapPin,
    Send, Instagram, Youtube, Facebook, Globe, ExternalLink,
} from 'lucide-react';
import { getClubDirection } from '../../config/clubDirections';
import { listClubContacts } from '../../config/clubContacts';
import { db } from '../../services/db';

// Kanal ikonkalari - kanallar ro'yxatining O'ZI clubContacts.js da.
// Ikonka bu yerda qoladi, chunki u KO'RINISH masalasi: konfiguratsiya
// faylini React kutubxonasiga bog'lab qo'yish kerak emas.
const CHANNEL_ICONS = {
    phone: Phone, email: Mail, room: MapPin,
    telegram: Send, instagram: Instagram, youtube: Youtube,
    facebook: Facebook, website: Globe,
};

// "Haqida" tab, enriched into tidy cards (klub tavsifi/maqsadlar/yo'nalishlar/faoliyatlar/kimlar uchun)
// instead of a single paragraph. Content beyond the real `club.description` comes from a display-only
// per-direction config (clubAboutContent.js) — no new club data field, nothing fabricated per-club.
const ClubAboutTab = ({ club, canManage = false, onEditContacts = null }) => {
    const direction = getClubDirection(club.category);
    // Ariza bosqichida kiritilgan "Faoliyat davri" - manba arizaning o'zi
    // (izohi db.getFoundingApplicationFields da). Faqat arizadan yaratilgan
    // klublarda bor, bevosita yaratilganlarda bo'lmaydi - shuning uchun
    // ixtiyoriy ko'rsatiladi.
    const foundingFields = db.getFoundingApplicationFields(club.id);

    // KLUBNING O'Z MATNI.
    //
    // Ilgari bu yerda YO'NALISH bo'yicha oldindan yozilgan umumiy matn
    // turardi: barcha huquqiy klublarda bir xil "Maqsadlar", barcha sport
    // klublarida bir xil "Kimlar uchun". U klub haqida hech narsa
    // aytmasdi, lekin klubning o'z matnidek ko'rinardi.
    //
    // Endi har klub o'zi yozadi. To'ldirilmagan bo'lsa karta UMUMAN
    // ko'rsatilmaydi - bo'sh joyni umumiy matn bilan to'ldirish
    // avvalgi holatga qaytish bo'lardi.
    const about = club.about || {};
    const cards = [
        { key: 'goals', icon: Target, title: 'Maqsadlar', text: about.goals },
        { key: 'activities', icon: Sparkles, title: "Qanday faoliyatlar o'tkaziladi", text: about.activities },
        { key: 'audience', icon: Users, title: "Kimlar uchun mo'ljallangan", text: about.audience },
    ].filter(c => String(c.text || '').trim());

    // Faqat TO'LDIRILGAN kanallar qaytadi - bo'sh qatorlar ro'yxatni
    // uzaytirib, "aloqa bor" degan yolg'on taassurot berardi.
    const contacts = listClubContacts(club.contacts);
    const direct = contacts.filter(c => c.kind === 'contact');
    const social = contacts.filter(c => c.kind === 'social');

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Klub tavsifi</h4>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{club.description || "Tavsif kiritilmagan."}</p>
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                    <Compass size={12} /> {direction} yo'nalishi
                    {foundingFields?.activityPeriod && (
                        <> · Faoliyat davri: {foundingFields.activityPeriod}</>
                    )}
                </p>
            </div>

            {cards.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {cards.map(c => (
                        <div key={c.key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                            <div className="flex items-center gap-2 mb-1.5">
                                <c.icon size={16} className="text-indigo-500" />
                                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">{c.title}</h4>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-line">{c.text}</p>
                        </div>
                    ))}
                </div>
            )}

            {cards.length === 0 && canManage && (
                <button
                    type="button"
                    onClick={onEditContacts}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                >
                    <Target size={15} /> Klub maqsadi va faoliyatini yozish
                </button>
            )}

            {/* ALOQA VA IJTIMOIY TARMOQLAR.
                Bevosita aloqa (telefon/pochta/xona) va tarmoqlar ajratilgan:
                birinchisi "qanday bog'lanaman", ikkinchisi "qayerda kuzatib
                boraman" - boshqa-boshqa savol.
                Kanallar to'ldirilmagan bo'lsa, blok umuman ko'rinmaydi; faqat
                tahrirlay oladigan odamga uni to'ldirish taklifi chiqadi. */}
            {contacts.length > 0 ? (
                <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="text-xs font-bold text-gray-400 uppercase">Aloqa</h4>
                        {canManage && onEditContacts && (
                            <button
                                type="button"
                                onClick={onEditContacts}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                            >
                                Tahrirlash
                            </button>
                        )}
                    </div>

                    {direct.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                            {direct.map(c => {
                                const Icon = CHANNEL_ICONS[c.key] || Globe;
                                const inner = (
                                    <>
                                        <Icon size={15} className="text-indigo-500 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[11px] text-gray-400">{c.label}</p>
                                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{c.text}</p>
                                        </div>
                                    </>
                                );
                                const className = 'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800';
                                return c.href ? (
                                    <a key={c.key} href={c.href} className={`${className} hover:border-indigo-200 transition-colors`}>
                                        {inner}
                                    </a>
                                ) : (
                                    <div key={c.key} className={className}>{inner}</div>
                                );
                            })}
                        </div>
                    )}

                    {social.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {social.map(c => {
                                const Icon = CHANNEL_ICONS[c.key] || Globe;
                                const inner = (
                                    <>
                                        <Icon size={15} className="shrink-0" />
                                        <span className="truncate max-w-[180px]">{c.text}</span>
                                        {c.href && <ExternalLink size={12} className="shrink-0 opacity-50" />}
                                    </>
                                );
                                const className = 'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-100 dark:border-gray-700';
                                // Havolalar YANGI OYNADA - talaba klub sahifasidan
                                // chiqib ketib qolmasin.
                                return c.href ? (
                                    <a
                                        key={c.key} href={c.href} target="_blank" rel="noopener noreferrer"
                                        className={`${className} hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors`}
                                    >
                                        {inner}
                                    </a>
                                ) : (
                                    <span key={c.key} className={className}>{inner}</span>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : canManage && onEditContacts && (
                <button
                    type="button"
                    onClick={onEditContacts}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                >
                    <Phone size={15} /> Aloqa va ijtimoiy tarmoqlarni qo'shish
                </button>
            )}
        </div>
    );
};

export default ClubAboutTab;
