import React, { useState, useEffect } from 'react';
import {
    Settings, Save, RotateCcw, Bell, Palette, Database, Shield,
    GraduationCap, BarChart3, AlertTriangle, Check, ChevronRight,
    Moon, Sun, Globe, Lock, Download, Upload, Trash2, Info, Award, MapPin, Plus, Edit
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import ScoringSourcesManager from '../../components/admin/ScoringSourcesManager';
import SocialCriteriaManager from '../../components/admin/SocialCriteriaManager';
import ClubDirectionsPanel from '../../components/admin/ClubDirectionsPanel';
import {
    VENUE_EQUIPMENT, VENUE_EQUIPMENT_ORDER, formatCapacity,
} from '../../config/venueEquipment';
import CriterionConfirmationPanel from '../../components/admin/CriterionConfirmationPanel';
import DisciplinePanel from '../../components/admin/DisciplinePanel';
import EvidenceAppealsPanel from '../../components/admin/EvidenceAppealsPanel';
import HolidayCalendarPanel from '../../components/admin/HolidayCalendarPanel';
import VolunteeringScalePanel from '../../components/admin/VolunteeringScalePanel';
import CulturalVisitsPanel from '../../components/admin/CulturalVisitsPanel';
import SportTeamsPanel from '../../components/sport/SportTeamsPanel';
import DormitoriesPanel from '../../components/admin/DormitoriesPanel';
import { db } from '../../services/db';
import { useTabParam } from '../../hooks/useTabParam';

const SETTINGS_TAB_IDS = [
    'general', 'scoring', 'social-activity', 'notifications', 'venues', 'theme', 'data',
];

const SettingsPage = () => {
    // Tab manzilda — orqaga bosilganda oldingi tabga qaytadi, sozlamalardan
    // butunlay chiqib ketmaydi.
    const [activeTab, setActiveTab] = useTabParam(SETTINGS_TAB_IDS, 'general');
    const [saved, setSaved] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);

    // Joylar (venues) — O'tkazilish joyi picklist musobaqa/tadbir yaratish vizardlari uchun.
    const [venues, setVenues] = useState(() => db.getVenues());
    const [newVenueBuilding, setNewVenueBuilding] = useState('');
    const [newVenueRoom, setNewVenueRoom] = useState('');
    // Sig'im va jihozlar. Sig'im IXTIYORIY - izohi db.createVenue ustida.
    const [newVenueCapacity, setNewVenueCapacity] = useState('');
    const [newVenueEquipment, setNewVenueEquipment] = useState([]);
    const [newVenueNote, setNewVenueNote] = useState('');
    // Tahrirlanayotgan joy - mavjud xonalarga sig'im va jihozni keyin
    // qo'shish uchun (ular yangi qo'shilgan maydonlar).
    const [editingVenueId, setEditingVenueId] = useState(null);
    const [venueDraft, setVenueDraft] = useState(null);

    const toggleNewEquipment = (key) =>
        setNewVenueEquipment(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

    const handleAddVenue = async () => {
        if (!newVenueBuilding.trim() || !newVenueRoom.trim()) return;
        try {
            await db.createVenue(newVenueBuilding, newVenueRoom, {
                capacity: newVenueCapacity,
                equipment: newVenueEquipment,
                equipmentNote: newVenueNote,
            });
            setVenues(db.getVenues());
            setNewVenueBuilding('');
            setNewVenueRoom('');
            setNewVenueCapacity('');
            setNewVenueEquipment([]);
            setNewVenueNote('');
        } catch (err) {
            alert(err?.message || "Joyni qo'shishda xatolik yuz berdi.");
        }
    };

    const openVenueEdit = (v) => {
        setEditingVenueId(v.id);
        setVenueDraft({
            building: v.building, room: v.room,
            capacity: v.capacity ?? '',
            equipment: v.equipment || [],
            equipmentNote: v.equipmentNote || '',
        });
    };

    const handleSaveVenue = async () => {
        try {
            await db.updateVenue(editingVenueId, venueDraft);
            setVenues(db.getVenues());
            setEditingVenueId(null);
            setVenueDraft(null);
        } catch (err) {
            alert(err?.message || "Saqlashda xatolik yuz berdi.");
        }
    };
    const handleDeleteVenue = async (id) => {
        try {
            await db.deleteVenue(id);
            setVenues(db.getVenues());
        } catch (err) {
            alert(err?.message || "Joyni o'chirishda xatolik yuz berdi.");
        }
    };

    // General settings
    const [generalSettings, setGeneralSettings] = useState({
        universityName: 'Toshkent Davlat Texnika Universiteti',
        shortName: 'TDTU',
        academicYear: '2024-2025',
        semester: '2-semestr',
        language: 'uz',
        timezone: 'Asia/Tashkent'
    });

    // Ijtimoiy faollik mezonlarining maksimal ballari — endi to'g'ridan-to'g'ri
    // socialCriteriaCategories'ni o'qiydi/yozadi (SocialCriteriaManager bilan bitta manba), o'zgarish
    // darhol saqlanadi (alohida "Saqlash" bosishni talab qilmaydi), eski ajratilgan localStorage nusxasi
    // (avval faqat shu tabda ko'rinib, boshqa hech joyga ta'sir qilmasdi) olib tashlandi.
    const [socialCategories, setSocialCategories] = useState(() => db.getSocialCriteriaCategories());
    const refreshSocialCategories = () => setSocialCategories(db.getSocialCriteriaCategories());
    const activeSocialCategories = socialCategories.filter(c => c.isActive && !c.isArchived);
    const adjustCategoryMaxPoints = (category, nextValue) => {
        db.updateSocialCriteriaCategory(category.id, { maxPoints: Math.max(0, nextValue) });
        refreshSocialCategories();
    };
    // Re-sync when switching into this tab — SocialCriteriaManager (Ijtimoiy faollik tab) is a separate
    // component instance with its own state, so an edit made there wouldn't otherwise show up here.
    useEffect(() => {
        if (activeTab === 'scoring') refreshSocialCategories();
    }, [activeTab]);

    // Notification settings
    const [notifSettings, setNotifSettings] = useState({
        emailNotifications: true,
        testReminders: true,
        eventReminders: true,
        scholarshipAlerts: true,
        attendanceAlerts: true,
        weeklyReport: false,
        autoReminderDays: 3
    });

    // Theme settings
    const [themeSettings, setThemeSettings] = useState({
        darkMode: false,
        primaryColor: '#4F46E5',
        accentColor: '#10B981'
    });

    const totalWeight = activeSocialCategories.reduce((sum, c) => sum + c.maxPoints, 0);

    const handleSave = () => {
        // Save to localStorage
        localStorage.setItem('uniplatform_settings', JSON.stringify({
            general: generalSettings,
            notifications: notifSettings,
            theme: themeSettings
        }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleReset = () => {
        db.resetDB();
        setShowResetModal(false);
        window.location.reload();
    };

    const handleExportData = () => {
        const data = localStorage.getItem('uniplatform_clubos_db');
        if (data) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `uniplatform_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
        }
    };

    const handleImportData = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    JSON.parse(ev.target.result);
                    localStorage.setItem('uniplatform_clubos_db', ev.target.result);
                    window.location.reload();
                } catch {
                    alert('Noto\'g\'ri fayl formati!');
                }
            };
            reader.readAsText(file);
        }
    };

    const tabs = [
        { id: 'general', label: 'Umumiy', icon: Settings },
        { id: 'scoring', label: 'Ball tizimi', icon: BarChart3 },
        { id: 'social-activity', label: 'Ijtimoiy faollik', icon: Award },
        { id: 'notifications', label: 'Bildirishnomalar', icon: Bell },
        { id: 'venues', label: 'Joylar', icon: MapPin },
        { id: 'theme', label: 'Ko\'rinish', icon: Palette },
        { id: 'data', label: 'Ma\'lumotlar', icon: Database },
    ];

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sozlamalar</h1>
                    <p className="text-gray-500 text-lg mt-1">Tizim konfiguratsiyasi va sozlamalar</p>
                </div>
                <button
                    onClick={handleSave}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-all ${saved
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                >
                    {saved ? <Check size={18} /> : <Save size={18} />}
                    {saved ? 'Saqlandi!' : 'Saqlash'}
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Tabs sidebar */}
                <Card className="lg:w-64 p-2 border-none bg-white/80 h-fit shrink-0">
                    <nav className="space-y-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                <tab.icon size={18} />
                                {tab.label}
                                <ChevronRight size={14} className="ml-auto opacity-50" />
                            </button>
                        ))}
                    </nav>
                </Card>

                {/* Content */}
                <div className="flex-1 space-y-6">
                    {/* General Settings */}
                    {activeTab === 'general' && (
                        <Card className="p-6 border-none bg-white/80">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-indigo-50 rounded-2xl">
                                    <GraduationCap size={24} className="text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Umumiy sozlamalar</h3>
                                    <p className="text-sm text-gray-500">Universitet va tizim haqidagi asosiy ma'lumotlar</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {[
                                    { key: 'universityName', label: 'Universitet nomi', type: 'text' },
                                    { key: 'shortName', label: 'Qisqartma', type: 'text' },
                                    { key: 'academicYear', label: 'O\'quv yili', type: 'text' },
                                    { key: 'semester', label: 'Semestr', type: 'select', options: ['1-semestr', '2-semestr'] },
                                    { key: 'language', label: 'Til', type: 'select', options: [{ v: 'uz', l: 'O\'zbek' }, { v: 'ru', l: 'Русский' }, { v: 'en', l: 'English' }] },
                                    { key: 'timezone', label: 'Vaqt zonasi', type: 'text' },
                                ].map(field => (
                                    <div key={field.key}>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{field.label}</label>
                                        {field.type === 'select' ? (
                                            <select
                                                value={generalSettings[field.key]}
                                                onChange={(e) => setGeneralSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            >
                                                {(Array.isArray(field.options) ? field.options : []).map(opt => {
                                                    const val = typeof opt === 'object' ? opt.v : opt;
                                                    const lbl = typeof opt === 'object' ? opt.l : opt;
                                                    return <option key={val} value={val}>{lbl}</option>;
                                                })}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={generalSettings[field.key]}
                                                onChange={(e) => setGeneralSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Scoring Weights */}
                    {activeTab === 'scoring' && (
                        <Card className="p-6 border-none bg-white/80">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-amber-50 rounded-2xl">
                                        <BarChart3 size={24} className="text-amber-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Ijtimoiy faollik ball tizimi</h3>
                                        <p className="text-sm text-gray-500">{activeSocialCategories.length} mezon bo'yicha maksimal ballar</p>
                                    </div>
                                </div>
                                <div className={`px-4 py-2 rounded-xl text-sm font-bold ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    Jami: {totalWeight} / 100
                                </div>
                            </div>

                            {totalWeight !== 100 && (
                                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                                    <AlertTriangle size={20} className="text-red-500 shrink-0" />
                                    <p className="text-sm text-red-700">Umumiy ball 100 ga teng bo'lishi kerak. Hozir: <strong>{totalWeight}</strong></p>
                                </div>
                            )}

                            <div className="space-y-4">
                                {activeSocialCategories.map((category, idx) => (
                                    <div key={category.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-indigo-50/50 transition-colors">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-indigo-600 bg-indigo-100 w-6 h-6 rounded-full flex items-center justify-center">{idx + 1}</span>
                                                <h4 className="font-semibold text-gray-900 text-sm">{category.name}</h4>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 ml-8">{category.description}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => adjustCategoryMaxPoints(category, category.maxPoints - 1)}
                                                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 font-bold"
                                            >−</button>
                                            <input
                                                type="number"
                                                value={category.maxPoints}
                                                onChange={(e) => adjustCategoryMaxPoints(category, parseInt(e.target.value) || 0)}
                                                className="w-16 text-center py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <button
                                                onClick={() => adjustCategoryMaxPoints(category, category.maxPoints + 1)}
                                                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 font-bold"
                                            >+</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Social Activity: Criteria/sub-criteria hierarchy, then Scoring Sources — mezon/
                        sub-kategoriya avval sozlanadi (nima kerakligi, qo'lda/avtomatikligi), Ball
                        manbalari esa har mezon uchun REAL ball miqdorini belgilaydi (qo'lda tasdiqlanadigan
                        arizalar shu manbadan ball oladi). */}
                    {activeTab === 'social-activity' && (
                        <div className="space-y-6">
                            {/* "Ijtimoiy faollik indeksi"ning 2-mezoni sozlamasi -
                                klublarni metodikaning 5 yo'nalishiga bog'lash va
                                faollik chegarasi. */}
                            <ClubDirectionsPanel />
                            {/* Ma'lumotnomalarni tasdiqlash - hozircha 2-mezon uchun.
                                Mexanizm umumiy: qolgan qo'lda mezonlar shu qolipga
                                tushadi, faqat `criterionKey` o'zgaradi. */}
                            <CriterionConfirmationPanel criterionKey="CLUBS" />
                            {/* 4-mezon: bu yerda ball qo'yilmaydi, faqat buzilish
                                qayd etiladi - shuning uchun tasdiqlash navbatida
                                emas, alohida turadi. */}
                            <DisciplinePanel />
                            {/* 6-mezon: dars davomati (HEMIS ulanmagunicha qo'lda). */}
                            {/* 6-mezon (dars soati) SOZLAMALARDAN OLIB TASHLANDI:
                                uning o'z joyi "Davomat" bo'limi. Kunlik ish
                                sozlamalar ichida yashirinib turmasligi kerak. */}
                            {/* 8-mezon shkalasi: metodikada taqsimot yo'q. */}
                            <VolunteeringScalePanel />
                            {/* 9-mezon: tashriflarni tasdiqlash + joylar katalogi. */}
                            <CulturalVisitsPanel />
                            {/* 10-mezon: terma jamoalar. Administrator ham
                                ko'radi - sport klubi rahbari bo'lmasa ham
                                jamoani yarata olishi kerak. */}
                            <SportTeamsPanel />
                            {/* Turar joy 10-mezonda baholovchini belgilaydi. */}
                            <DormitoriesPanel />
                            {/* Rad etilgan hujjatlarga bildirilgan e'tirozlar. */}
                            <EvidenceAppealsPanel />
                            {/* Muddatlar ish kunlarida hisoblanadi - taqvim shu yerda. */}
                            <HolidayCalendarPanel />
                            <SocialCriteriaManager />
                            <ScoringSourcesManager />
                        </div>
                    )}

                    {/* Notifications */}
                    {activeTab === 'notifications' && (
                        <Card className="p-6 border-none bg-white/80">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-blue-50 rounded-2xl">
                                    <Bell size={24} className="text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Bildirishnoma sozlamalari</h3>
                                    <p className="text-sm text-gray-500">Eslatma va xabarnomalarni boshqarish</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {[
                                    { key: 'emailNotifications', label: 'Email bildirishnomalar', desc: 'Muhim yangiliklar email orqali yuboriladi' },
                                    { key: 'testReminders', label: 'Test eslatmalari', desc: 'Test muddati yaqinlashganda xabar berish' },
                                    { key: 'eventReminders', label: 'Tadbir eslatmalari', desc: 'Tadbirlar boshlanishidan oldin eslatish' },
                                    { key: 'scholarshipAlerts', label: 'Stipendiya xabarlari', desc: 'Yangi stipendiya imkoniyatlari haqida' },
                                    { key: 'attendanceAlerts', label: 'Davomat ogohlantirishlari', desc: 'Davomat past bo\'lganda xabar berish' },
                                    { key: 'weeklyReport', label: 'Haftalik hisobot', desc: 'Har haftada umumiy hisobot yuborish' },
                                ].map(item => (
                                    <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-blue-50/30 transition-colors">
                                        <div>
                                            <h4 className="font-semibold text-gray-900 text-sm">{item.label}</h4>
                                            <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                                        </div>
                                        <button
                                            onClick={() => setNotifSettings(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${notifSettings[item.key] ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${notifSettings[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                ))}

                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">Avtomatik eslatma muddati (kun)</label>
                                    <input
                                        type="number"
                                        value={notifSettings.autoReminderDays}
                                        onChange={(e) => setNotifSettings(prev => ({ ...prev, autoReminderDays: parseInt(e.target.value) || 1 }))}
                                        className="w-24 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                                        min="1"
                                        max="30"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Tadbirdan necha kun oldin eslatma yuboriladi</p>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Joylar (venues) */}
                    {activeTab === 'venues' && (
                        <Card className="p-6 border-none bg-white/80">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-teal-50 rounded-2xl">
                                    <MapPin size={24} className="text-teal-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">O'tkazilish joylari</h3>
                                    <p className="text-sm text-gray-500">Tadbir/musobaqa yaratishda tanlanadigan bino va xonalar ro'yxati — barcha klublar uchun umumiy</p>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-2xl mb-5 space-y-3">
                                <div className="flex flex-wrap items-end gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Bino</label>
                                        <input
                                            type="text"
                                            value={newVenueBuilding}
                                            onChange={e => setNewVenueBuilding(e.target.value)}
                                            placeholder="Masalan: Bosh bino"
                                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm w-48"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Xona</label>
                                        <input
                                            type="text"
                                            value={newVenueRoom}
                                            onChange={e => setNewVenueRoom(e.target.value)}
                                            placeholder="Masalan: 3-auditoriya"
                                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm w-48"
                                        />
                                    </div>
                                    {/* Sig'im IXTIYORIY - taxminiy raqam yozishdan
                                        ko'ra bo'sh qoldirish yaxshiroq. */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                            Sig'imi
                                        </label>
                                        <input
                                            type="number" min={1}
                                            value={newVenueCapacity}
                                            onChange={e => setNewVenueCapacity(e.target.value)}
                                            placeholder="ixtiyoriy"
                                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm w-32"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                        Jihozlar
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {VENUE_EQUIPMENT_ORDER.map(key => {
                                            const item = VENUE_EQUIPMENT[key];
                                            const active = newVenueEquipment.includes(key);
                                            return (
                                                <button
                                                    key={key} type="button"
                                                    onClick={() => toggleNewEquipment(key)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                                        active
                                                            ? 'bg-teal-600 text-white border-teal-600'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <item.icon size={13} /> {item.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <input
                                        type="text"
                                        value={newVenueNote}
                                        onChange={e => setNewVenueNote(e.target.value)}
                                        placeholder="Ro'yxatda yo'q jihozlar (ixtiyoriy)"
                                        className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                                    />
                                </div>

                                <button
                                    onClick={handleAddVenue}
                                    disabled={!newVenueBuilding.trim() || !newVenueRoom.trim()}
                                    className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Plus size={16} /> Qo'shish
                                </button>
                            </div>

                            {venues.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">Hali joy qo'shilmagan.</p>
                            ) : (
                                <div className="space-y-2">
                                    {venues.map(v => (
                                        <div key={v.id} className="p-4 bg-gray-50 rounded-xl">
                                            {editingVenueId === v.id ? (
                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        <input
                                                            type="text" value={venueDraft.building}
                                                            onChange={e => setVenueDraft(d => ({ ...d, building: e.target.value }))}
                                                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm w-44"
                                                            placeholder="Bino"
                                                        />
                                                        <input
                                                            type="text" value={venueDraft.room}
                                                            onChange={e => setVenueDraft(d => ({ ...d, room: e.target.value }))}
                                                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm w-44"
                                                            placeholder="Xona"
                                                        />
                                                        <input
                                                            type="number" min={1} value={venueDraft.capacity}
                                                            onChange={e => setVenueDraft(d => ({ ...d, capacity: e.target.value }))}
                                                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm w-28"
                                                            placeholder="Sig'imi"
                                                        />
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {VENUE_EQUIPMENT_ORDER.map(key => {
                                                            const item = VENUE_EQUIPMENT[key];
                                                            const active = venueDraft.equipment.includes(key);
                                                            return (
                                                                <button
                                                                    key={key} type="button"
                                                                    onClick={() => setVenueDraft(d => ({
                                                                        ...d,
                                                                        equipment: active
                                                                            ? d.equipment.filter(k => k !== key)
                                                                            : [...d.equipment, key],
                                                                    }))}
                                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                                                        active
                                                                            ? 'bg-teal-600 text-white border-teal-600'
                                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                                    }`}
                                                                >
                                                                    <item.icon size={13} /> {item.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <input
                                                        type="text" value={venueDraft.equipmentNote}
                                                        onChange={e => setVenueDraft(d => ({ ...d, equipmentNote: e.target.value }))}
                                                        placeholder="Ro'yxatda yo'q jihozlar"
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={handleSaveVenue}
                                                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
                                                        >
                                                            Saqlash
                                                        </button>
                                                        <button
                                                            onClick={() => { setEditingVenueId(null); setVenueDraft(null); }}
                                                            className="px-4 py-2 text-gray-500 text-xs font-bold hover:text-gray-700"
                                                        >
                                                            Bekor qilish
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800">{v.label}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            {/* Sig'im ko'rsatilmagan bo'lsa shunday
                                                                deb yoziladi - taxminiy raqam emas. */}
                                                            {formatCapacity(v.capacity) || "Sig'imi ko'rsatilmagan"}
                                                        </p>
                                                        {(v.equipment?.length > 0 || v.equipmentNote) && (
                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                {(v.equipment || []).map(key => {
                                                                    const item = VENUE_EQUIPMENT[key];
                                                                    if (!item) return null;
                                                                    return (
                                                                        <span key={key} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-[11px] text-gray-600">
                                                                            <item.icon size={11} /> {item.label}
                                                                        </span>
                                                                    );
                                                                })}
                                                                {v.equipmentNote && (
                                                                    <span className="px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-[11px] text-gray-500 italic">
                                                                        {v.equipmentNote}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => openVenueEdit(v)}
                                                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50"
                                                            title="Tahrirlash"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                        <button onClick={() => handleDeleteVenue(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Theme */}
                    {activeTab === 'theme' && (
                        <Card className="p-6 border-none bg-white/80">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-purple-50 rounded-2xl">
                                    <Palette size={24} className="text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Ko'rinish sozlamalari</h3>
                                    <p className="text-sm text-gray-500">Ranglar va mavzu sozlamalari</p>
                                </div>
                            </div>
                            <div className="space-y-6">
                                {/* Dark Mode Toggle */}
                                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl">
                                    <div className="flex items-center gap-4">
                                        {themeSettings.darkMode ? <Moon size={24} className="text-indigo-600" /> : <Sun size={24} className="text-amber-500" />}
                                        <div>
                                            <h4 className="font-semibold text-gray-900">Tungi rejim</h4>
                                            <p className="text-xs text-gray-500">Interfeys qorong'i rangda ko'rsatiladi</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setThemeSettings(prev => ({ ...prev, darkMode: !prev.darkMode }))}
                                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${themeSettings.darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                    >
                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${themeSettings.darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {/* Color Pickers */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="p-5 bg-gray-50 rounded-2xl">
                                        <label className="block text-sm font-semibold text-gray-900 mb-3">Asosiy rang</label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="color"
                                                value={themeSettings.primaryColor}
                                                onChange={(e) => setThemeSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                                                className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
                                            />
                                            <input
                                                type="text"
                                                value={themeSettings.primaryColor}
                                                onChange={(e) => setThemeSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                                                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-5 bg-gray-50 rounded-2xl">
                                        <label className="block text-sm font-semibold text-gray-900 mb-3">Qo'shimcha rang</label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="color"
                                                value={themeSettings.accentColor}
                                                onChange={(e) => setThemeSettings(prev => ({ ...prev, accentColor: e.target.value }))}
                                                className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
                                            />
                                            <input
                                                type="text"
                                                value={themeSettings.accentColor}
                                                onChange={(e) => setThemeSettings(prev => ({ ...prev, accentColor: e.target.value }))}
                                                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="p-5 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Ko'rinish namunasi</h4>
                                    <div className="flex items-center gap-3">
                                        <div className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm" style={{ backgroundColor: themeSettings.primaryColor }}>Asosiy tugma</div>
                                        <div className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm" style={{ backgroundColor: themeSettings.accentColor }}>Qo'shimcha tugma</div>
                                        <div className="px-5 py-2.5 rounded-xl font-semibold text-sm border-2" style={{ borderColor: themeSettings.primaryColor, color: themeSettings.primaryColor }}>Kontur tugma</div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Data Management */}
                    {activeTab === 'data' && (
                        <div className="space-y-6">
                            <Card className="p-6 border-none bg-white/80">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-emerald-50 rounded-2xl">
                                        <Database size={24} className="text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Ma'lumotlarni boshqarish</h3>
                                        <p className="text-sm text-gray-500">Eksport, import va tiklash amallari</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Export */}
                                    <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-blue-100 rounded-xl">
                                                <Download size={20} className="text-blue-600" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-gray-900">Ma'lumotlarni eksport qilish</h4>
                                                <p className="text-xs text-gray-500">Barcha ma'lumotlarni JSON formatda yuklab olish</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleExportData}
                                            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                                        >
                                            Eksport
                                        </button>
                                    </div>

                                    {/* Import */}
                                    <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-emerald-100 rounded-xl">
                                                <Upload size={20} className="text-emerald-600" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-gray-900">Ma'lumotlarni import qilish</h4>
                                                <p className="text-xs text-gray-500">JSON fayl orqali ma'lumotlarni tiklash</p>
                                            </div>
                                        </div>
                                        <label className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer">
                                            Import
                                            <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                                        </label>
                                    </div>
                                </div>
                            </Card>

                            {/* Danger Zone */}
                            <Card className="p-6 border-2 border-red-200 bg-red-50/50">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-red-100 rounded-2xl">
                                        <AlertTriangle size={24} className="text-red-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-red-900">Xavfli zona</h3>
                                        <p className="text-sm text-red-600">Bu amallarni qaytarib bo'lmaydi</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-5 bg-white rounded-2xl border border-red-200">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-100 rounded-xl">
                                            <Trash2 size={20} className="text-red-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-red-900">Ma'lumotlar bazasini tiklash</h4>
                                            <p className="text-xs text-red-500">Barcha ma'lumotlar o'chiriladi va boshlang'ich holatga qaytariladi</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowResetModal(true)}
                                        className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
                                    >
                                        Tiklash
                                    </button>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </div>

            {/* Reset Confirmation Modal */}
            <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title="Ma'lumotlar bazasini tiklash" size="sm">
                <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                        <AlertTriangle size={32} className="text-red-600" />
                    </div>
                    <p className="text-gray-700">
                        Barcha ma'lumotlar <strong className="text-red-600">butunlay o'chiriladi</strong> va boshlang'ich holatga qaytariladi.
                        Bu amalni qaytarib bo'lmaydi!
                    </p>
                    <div className="flex gap-3 justify-center pt-2">
                        <button
                            onClick={() => setShowResetModal(false)}
                            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                        >
                            Bekor qilish
                        </button>
                        <button
                            onClick={handleReset}
                            className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
                        >
                            Ha, tiklash
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default SettingsPage;
