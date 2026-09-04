import React from 'react';
import Badge from '../common/Badge';
import { db } from '../../services/db';

const LOCATION_TYPE_LABELS = { online: 'Online', tbd: 'Joyi aniqlanmagan', hybrid: 'Gibrid' };

const formatCountdown = (ms) => {
    if (ms <= 0) return '';
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days} kun ${hours} soat`;
    if (hours > 0) return `${hours} soat ${minutes} daqiqa`;
    return `${minutes} daqiqa`;
};

// The 4-state registration badge (Hali ochilmagan / Ochiq / To'lgan / Yopilgan) + countdown text +
// location-type badge (Online/Joyi aniqlanmagan/Gibrid) — reused identically wherever an activity
// (event or competition) is listed, for every role. Only the surrounding action buttons differ by
// permission (see ActivityRegistrationPanel.jsx) — this badge itself never changes by role.
const RegistrationStatusBadge = ({ activity, startDateTime, registeredCount = 0, size = 'sm' }) => {
    const locationBadge = activity.locationType && LOCATION_TYPE_LABELS[activity.locationType]
        ? <Badge variant="default" size={size}>{LOCATION_TYPE_LABELS[activity.locationType]}</Badge>
        : null;

    if (!activity.registrationRequired) {
        return locationBadge;
    }

    const now = new Date();
    // Same window-state derivation isRegistrationOpen/registerForActivity enforce server-side (db.js's
    // getRegistrationWindowState) — used to reimplement this same opensAt/closesAt comparison from
    // scratch, a real drift risk since nothing enforced the two copies staying in sync.
    const { state: windowState, opensAt } = db.getRegistrationWindowState(activity, startDateTime);
    const isFull = activity.maxParticipants != null && registeredCount >= activity.maxParticipants;

    let variant, label, text;
    if (windowState === 'not_open') {
        variant = 'warning'; label = 'Hali ochilmagan';
        text = `Ro'yxatdan o'tish ${formatCountdown(opensAt - now)}dan so'ng ochiladi`;
    } else if (windowState === 'closed') {
        variant = 'default'; label = 'Yopilgan';
        text = "Ro'yxatdan o'tish muddati tugagan";
    } else if (isFull) {
        variant = 'danger'; label = "To'lgan";
        text = activity.waitlistEnabled ? "Joy yo'q — kutish ro'yxatiga yozilishingiz mumkin" : "Bo'sh joy yo'q";
    } else {
        variant = 'success'; label = 'Ochiq';
        text = activity.maxParticipants != null ? `${Math.max(0, activity.maxParticipants - registeredCount)} ta bo'sh joy` : null;
    }

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={variant} size={size}>{label}</Badge>
                {locationBadge}
            </div>
            {text && <p className="text-[11px] text-gray-500">{text}</p>}
        </div>
    );
};

export default RegistrationStatusBadge;
