import React, { useMemo, useState } from 'react';
import { Coins, CheckCircle2, AlertTriangle } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { db } from '../../services/db';
import { PARTICIPATION_ROLES, POINTS_EXPLANATION } from '../../config/activityLifecycle';

// Davomatdan avtomatik ball.
//
// Ilgari zanjir shunday edi: davomat bazada -> talaba ariza yozadi -> admin
// tasdiqlaydi -> ball. Ya'ni ma'lumot allaqachon tizimda bo'lsa-da, ball uchun
// ikki kishi qo'shimcha ish qilardi. Endi: davomat bazada -> ball.
//
// Bir marta beriladi. `pointsAwardedAt` belgilangandan keyin tugma yo'qoladi -
// tugmani ikki marta bosish ballni ikki marta bermaydi.
const ActivityPointsPanel = ({ activityId, activityType, canManage, actingUsername, onChanged }) => {
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const meta = useMemo(
        () => db.getActivityMeta(activityId, activityType),
        [activityId, activityType, version]
    );
    const rows = useMemo(
        () => db.previewActivityPoints(activityId, activityType),
        [activityId, activityType, version]
    );
    const total = rows.reduce((s, r) => s + r.points, 0);
    const awarded = !!meta.pointsAwardedAt;

    const handleAward = async () => {
        setBusy(true); setError('');
        try {
            const res = await db.awardActivityPoints(activityId, activityType, { by: actingUsername });
            setResult(res);
            setVersion(v => v + 1);
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Ball berishda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
                    <Coins size={15} className="text-amber-500" /> Ishtirok bali
                </h3>
                {awarded ? (
                    <Badge variant="success" size="sm">
                        Berilgan — {new Date(meta.pointsAwardedAt).toLocaleDateString('uz-UZ')}
                    </Badge>
                ) : canManage && rows.length > 0 && (
                    <Button variant="primary" size="sm" disabled={busy} onClick={handleAward}>
                        {busy ? 'Yozilmoqda...' : `${rows.length} kishiga ${total} ball berish`}
                    </Button>
                )}
            </div>

            {rows.length === 0 ? (
                <p className="text-xs text-gray-400">
                    Davomat belgilanmagan — ball beriladigan ishtirokchi yo'q.
                </p>
            ) : (
                <>
                    <p className="text-[11px] text-gray-400">{POINTS_EXPLANATION}</p>
                    <div className="flex flex-wrap gap-1">
                        {rows.slice(0, 12).map(r => (
                            <span key={r.participantId} className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${PARTICIPATION_ROLES[r.role]?.tone || ''}`}>
                                {r.studentName} +{r.points}
                            </span>
                        ))}
                        {rows.length > 12 && (
                            <span className="text-[10px] text-gray-400 font-semibold self-center">
                                va yana {rows.length - 12} ta
                            </span>
                        )}
                    </div>
                </>
            )}

            {error && (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                </p>
            )}
            {result && !result.alreadyAwarded && (
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <CheckCircle2 size={12} /> {result.awarded} talabaga jami {result.total} ball yozildi.
                </p>
            )}
        </div>
    );
};

export default ActivityPointsPanel;
