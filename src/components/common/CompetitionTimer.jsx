import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Settings2, Volume2, VolumeX } from 'lucide-react';
import { TIMER_SOUNDS, playTick, playEnd, unlockAudio } from '../../utils/timerSounds';

// SAVOL TAYMERI - zaldagi proyektor uchun.
//
// Klublar har xil vaqt beradi: ba'zisida 1 daqiqa, ba'zisida 40 soniya.
// Shuning uchun vaqt qotib qolgan son emas, sozlanadigan qiymat.
//
// QOLGAN VAQT SANAB KAMAYTIRILMAYDI. Agar har soniyada `remaining--`
// qilsak, brauzer fonda sekinlashganda (boshqa oynaga o'tilsa) taymer
// orqada qolardi va zaldagi vaqt noto'g'ri bo'lardi. O'rniga TUGASH
// PAYTI eslab qolinadi va qolgan vaqt har safar soatdan hisoblanadi -
// brauzer nima qilsa ham raqam to'g'ri qoladi.
//
// OVOZ: operator tugmani bosganda uyg'otiladi (brauzer qoidasi), keyin
// ogohlantirish oynasida har soniyada bir marta chaladi. Qaysi soniya
// aytilganini eslab qolamiz, aks holda bitta soniyada bir necha marta
// chalinardi (ekran soniyada 10 marta yangilanadi).

const TICK_MS = 100;

const fmt = (totalSec) => {
    const s = Math.max(0, Math.ceil(totalSec));
    if (s >= 60) {
        const m = Math.floor(s / 60);
        return `${m}:${String(s % 60).padStart(2, '0')}`;
    }
    return String(s);
};

const CompetitionTimer = ({
    defaultSeconds = 60,
    defaultWarnAt = 10,
    defaultSound = 'beep',
    onSettingsChange = null,
}) => {
    const [duration, setDuration] = useState(defaultSeconds);
    const [warnAt, setWarnAt] = useState(defaultWarnAt);
    const [soundId, setSoundId] = useState(defaultSound);
    const [muted, setMuted] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // `endsAt` - tugash payti (ms). `null` bo'lsa taymer yurmayapti.
    const [endsAt, setEndsAt] = useState(null);
    const [remaining, setRemaining] = useState(defaultSeconds);
    const lastSpokenRef = useRef(null);
    const finishedRef = useRef(false);

    // Musobaqa almashsa yoki sozlama tashqaridan kelsa - qabul qilamiz.
    useEffect(() => { setDuration(defaultSeconds); setRemaining(defaultSeconds); }, [defaultSeconds]);
    useEffect(() => { setWarnAt(defaultWarnAt); }, [defaultWarnAt]);
    useEffect(() => { setSoundId(defaultSound); }, [defaultSound]);

    const running = endsAt != null;

    const start = useCallback(() => {
        unlockAudio();
        finishedRef.current = false;
        lastSpokenRef.current = null;
        // Pauzadan davom ettirish: qolgan vaqtdan boshlanadi.
        const from = remaining > 0 ? remaining : duration;
        setEndsAt(Date.now() + from * 1000);
    }, [remaining, duration]);

    const pause = useCallback(() => {
        setEndsAt(null);
    }, []);

    const reset = useCallback(() => {
        setEndsAt(null);
        setRemaining(duration);
        finishedRef.current = false;
        lastSpokenRef.current = null;
    }, [duration]);

    // Yurish.
    useEffect(() => {
        if (endsAt == null) return undefined;
        const id = setInterval(() => {
            const left = (endsAt - Date.now()) / 1000;
            if (left <= 0) {
                setRemaining(0);
                setEndsAt(null);
                if (!finishedRef.current) {
                    finishedRef.current = true;
                    if (!muted) playEnd(soundId);
                }
                return;
            }
            setRemaining(left);

            // Ogohlantirish oynasida har soniyada bir marta.
            const whole = Math.ceil(left);
            if (whole <= warnAt && whole > 0 && lastSpokenRef.current !== whole) {
                lastSpokenRef.current = whole;
                if (!muted) playTick(soundId);
            }
        }, TICK_MS);
        return () => clearInterval(id);
    }, [endsAt, warnAt, soundId, muted]);

    // Probel - boshlash/to'xtatish. Zalda sichqonchani qidirmaslik uchun.
    // Sozlama oynasi ochiq bo'lsa yoki maydonga yozilayotgan bo'lsa tegmaydi.
    useEffect(() => {
        const onKey = (e) => {
            if (e.code !== 'Space') return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            if (running) pause(); else start();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [running, start, pause]);

    const applySettings = (next) => {
        const merged = { seconds: duration, warnAt, sound: soundId, ...next };
        if (next.seconds != null) { setDuration(next.seconds); if (!running) setRemaining(next.seconds); }
        if (next.warnAt != null) setWarnAt(next.warnAt);
        if (next.sound != null) setSoundId(next.sound);
        // Saqlash IXTIYORIY - ruxsati bo'lmasa ham taymer ishlayveradi.
        if (onSettingsChange) onSettingsChange(merged);
    };

    const left = Math.ceil(remaining);
    const finished = !running && left <= 0;
    const danger = left <= 3 && left > 0;
    const warning = !danger && left <= warnAt;

    const numberColor = finished ? 'text-rose-500'
        : danger ? 'text-rose-400'
            : warning ? 'text-amber-400'
                : 'text-white';

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 lg:p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* RAQAM - 5 metrdan o'qilishi kerak. */}
                <div className="flex items-baseline gap-3 min-w-0">
                    <span
                        className={`font-black tabular-nums leading-none ${numberColor} ${danger || finished ? 'animate-pulse' : ''}`}
                        style={{ fontSize: 'clamp(56px, 11vw, 132px)' }}
                    >
                        {fmt(remaining)}
                    </span>
                    <span className="text-slate-500 text-lg lg:text-xl font-bold shrink-0">
                        {finished ? "vaqt tugadi" : left >= 60 ? 'daqiqa' : 'soniya'}
                    </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={running ? pause : start}
                        className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-lg font-black transition-colors ${
                            running ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                                : 'bg-emerald-500 text-white hover:bg-emerald-400'
                        }`}
                    >
                        {running ? <Pause size={22} /> : <Play size={22} />}
                        {running ? "To'xtatish" : left < duration && left > 0 ? 'Davom' : 'Boshlash'}
                    </button>
                    <button
                        type="button" onClick={reset} title="Qaytadan"
                        className="flex items-center justify-center w-13 h-13 p-3.5 rounded-2xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                        <RotateCcw size={22} />
                    </button>
                    <button
                        type="button" onClick={() => setMuted(m => !m)}
                        title={muted ? "Ovozni yoqish" : "Ovozni o'chirish"}
                        className={`flex items-center justify-center p-3.5 rounded-2xl ${
                            muted ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                        {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                    </button>
                    <button
                        type="button" onClick={() => setShowSettings(s => !s)} title="Sozlash"
                        className={`flex items-center justify-center p-3.5 rounded-2xl ${
                            showSettings ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                        <Settings2 size={22} />
                    </button>
                </div>
            </div>

            {showSettings && (
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            Savolga vaqt (soniya)
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                            {[30, 40, 60, 90, 120].map(v => (
                                <button
                                    key={v} type="button" onClick={() => applySettings({ seconds: v })}
                                    className={`px-3 py-2 rounded-xl text-sm font-bold ${
                                        duration === v ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number" min={5} max={3600} value={duration}
                            onChange={e => {
                                const v = Math.max(5, Math.min(3600, Number(e.target.value) || 5));
                                applySettings({ seconds: v });
                            }}
                            className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            Sanash qachondan (soniya)
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                            {[5, 10, 15, 20].map(v => (
                                <button
                                    key={v} type="button" onClick={() => applySettings({ warnAt: v })}
                                    className={`px-3 py-2 rounded-xl text-sm font-bold ${
                                        warnAt === v ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                            Shu soniya qolganda har soniyada signal chalinadi.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            Sanoq ovozi
                        </label>
                        <select
                            value={soundId}
                            onChange={e => { unlockAudio(); applySettings({ sound: e.target.value }); }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                        >
                            {TIMER_SOUNDS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => { unlockAudio(); playTick(soundId); }}
                            className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold hover:bg-slate-700"
                        >
                            Eshitib ko&rsquo;rish
                        </button>
                    </div>
                </div>
            )}

            {!showSettings && (
                <p className="mt-3 text-sm text-slate-500">
                    Bo&rsquo;sh tugma (probel) &mdash; boshlash va to&rsquo;xtatish.
                    Oxirgi {warnAt} soniyada signal chalinadi.
                </p>
            )}
        </div>
    );
};

export default CompetitionTimer;
