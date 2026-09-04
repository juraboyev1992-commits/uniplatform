import React, { useMemo, useState } from 'react';
import { History, UserPlus, UserMinus, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { db, POSITION_TYPE_LABELS } from '../../services/db';

// A'ZOLIK TARIXI.
//
// Ilgari a'zolikdan chiqish yozuvni BUTUNLAY o'chirardi - kim qachon
// kirgani va chiqqani hech qayerda qolmasdi. Lavozimlarda tarix bor edi,
// a'zolikda esa yo'q.
//
// Bu ko'rsatkich emas, DALIL: "bu talaba klubda qancha turdi" degan
// savolga javob. Shuning uchun yozuvlar o'zgartirilmaydi va o'chirilmaydi.
const ACTION_META = {
    joined: { icon: UserPlus, label: "A'zo bo'ldi", tone: 'text-emerald-600 bg-emerald-50' },
    left: { icon: UserMinus, label: "A'zolikdan chiqdi", tone: 'text-rose-600 bg-rose-50' },
    role_changed: { icon: Shield, label: "Roli o'zgardi", tone: 'text-indigo-600 bg-indigo-50' },
};

const ROLE_LABELS = {
    member: "A'zo",
    head_coordinator: 'Asosiy koordinator',
    coordinator: 'Yordamchi koordinator',
    smm: 'SMM menejeri',
    volunteer: 'Volontyor',
};

const roleLabel = (role) => ROLE_LABELS[role] || POSITION_TYPE_LABELS[role] || role || '';

const ClubMembershipHistory = ({ clubId, version = 0 }) => {
    const [open, setOpen] = useState(false);
    const [limit, setLimit] = useState(15);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const events = useMemo(() => db.getClubMembershipHistory(clubId), [clubId, version]);

    // Tarix yozuvi yo'q bo'lsa blok umuman ko'rinmaydi. Sabab: mexanizm
    // yangi va eski a'zoliklarda yozuv yo'q - bo'sh "tarix" bo'limi
    // ma'lumot yo'qolganday taassurot berardi.
    if (events.length === 0) return null;

    const visible = events.slice(0, limit);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-3"
            >
                <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
                    <History size={16} className="text-gray-400" />
                    A'zolik tarixi
                    <span className="text-xs font-black text-gray-400">{events.length}</span>
                </span>
                {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {open && (
                <>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700 mt-3">
                        {visible.map(e => {
                            const meta = ACTION_META[e.action] || ACTION_META.joined;
                            return (
                                <div key={e.id} className="flex items-start gap-3 py-2.5">
                                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
                                        <meta.icon size={13} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                                            {e.student?.fullName || e.userId}
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            {meta.label}
                                            {e.action === 'role_changed' && e.previousRole && (
                                                <> · {roleLabel(e.previousRole)} → {roleLabel(e.role)}</>
                                            )}
                                            {e.action === 'joined' && e.source === 'application' && ' · ariza orqali'}
                                            {e.reason && ` · ${e.reason}`}
                                        </p>
                                    </div>
                                    <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                                        {new Date(e.createdAt).toLocaleDateString('uz-UZ')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {events.length > limit && (
                        <button
                            type="button"
                            onClick={() => setLimit(l => l + 25)}
                            className="w-full mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                        >
                            Yana {events.length - limit} ta yozuv
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default ClubMembershipHistory;
