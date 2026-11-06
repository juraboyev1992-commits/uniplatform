import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Settings2, Volume2, VolumeX } from 'lucide-react';
import {
    TIMER_SOUNDS, getTimerSound, playTick, playEnd, unlockAudio,
    speechAvailable, listVoices, speakNumber, stopSpeech,
} from '../../utils/timerSounds';
import { useSharedTimer, TIMER_PHASES } from '../../hooks/useSharedTimer';

// SAVOL TAYMERI.
//
// IKKI BOSQICH: asosiy o'ylash vaqti tugagach, javoblarni topshirish
// uchun qisqa ikkinchi vaqt o'zi boshlanadi. Zakovatda aynan shunday
// ishlaydi - savol o'qiladi, jamoa o'ylaydi, keyin varaqani topshirish
// uchun alohida bir necha soniya beriladi.
//
// IKKI OYNADA BIR XIL: holat `useSharedTimer` orqali brauzer kanalida
// uzatiladi, ya'ni jonli ekrandagi katta raqam va yuqori qatordagi
// ixcham raqam bir vaqtda yuradi.
//
// OVOZ FAQAT BITTA OYNADA. Ikkala oyna ham chalsa, ovoz ikki marta
// eshitilardi. Shuning uchun ixcham ko'rinish (`compact`) jim turadi -
// karnay proyektor kompyuterida, ya'ni jonli ekranda.

const TICK_MS = 100;

const fmt = (totalSec) => {
    const s = Math.max(0, Math.ceil(totalSec));
    if (s >= 60) {
        const m = Math.floor(s / 60);
        return `${m}:${String(s % 60).padStart(2, '0')}`;
    }
    return String(s);
};

const PHASE_LABEL = {
    [TIMER_PHASES.MAIN]: "O'ylash vaqti",
    [TIMER_PHASES.SUBMIT]: 'Javoblarni topshiring',
    [TIMER_PHASES.DONE]: 'Vaqt tugadi',
    [TIMER_PHASES.IDLE]: 'Tayyor',
};

const CompetitionTimer = ({
    defaultSeconds = 60,
    defaultSubmitSeconds = 10,
    defaultWarnAt = 10,
    defaultSound = 'beep',
    defaultVoice = '',
    onSettingsChange = null,
    compact = false,
}) => {
    const {
        shared, running, start, pause, reset, goSubmitPhase, finish, applySettings,
    } = useSharedTimer({
        mainSeconds: defaultSeconds,
        submitSeconds: defaultSubmitSeconds,
        warnAt: defaultWarnAt,
    });

    const [soundId, setSoundId] = useState(defaultSound);
    const [voiceName, setVoiceName] = useState(defaultVoice);
    // Ixcham ko'rinish JIM - izohi fayl boshida.
    const [muted, setMuted] = useState(compact);
    const [showSettings, setShowSettings] = useState(false);
    const [voices, setVoices] = useState([]);

    const [remaining, setRemaining] = useState(defaultSeconds);
    const spokenRef = useRef(null);
    const endedRef = useRef(null);

    useEffect(() => { setSoundId(defaultSound); }, [defaultSound]);
    useEffect(() => { setVoiceName(defaultVoice); }, [defaultVoice]);

    // Ovoz ro'yxati brauzerda kechikib yuklanadi.
    useEffect(() => {
        if (!speechAvailable()) return undefined;
        const load = () => setVoices(listVoices());
        load();
        window.speechSynthesis.addEventListener?.('voiceschanged', load);
        return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
    }, []);

    const { phase, endsAt, pausedLeft, mainSeconds, submitSeconds, warnAt, runId } = shared;
    const speaks = getTimerSound(soundId).speaks;

    // Yurmayotganda ko'rsatiladigan raqam.
    useEffect(() => {
        if (running) return;
        if (pausedLeft != null) setRemaining(pausedLeft);
        else if (phase === TIMER_PHASES.DONE) setRemaining(0);
        else setRemaining(mainSeconds);
    }, [running, pausedLeft, phase, mainSeconds]);

    // Sanoq.
    useEffect(() => {
        if (endsAt == null) return undefined;
        const id = setInterval(() => {
            const left = (endsAt - Date.now()) / 1000;

            if (left <= 0) {
                setRemaining(0);
                // Har bosqich uchun bir marta.
                const key = `${runId}:${phase}`;
                if (endedRef.current !== key) {
                    endedRef.current = key;
                    if (!muted) { stopSpeech(); playEnd(soundId); }
                    if (phase === TIMER_PHASES.MAIN) goSubmitPhase();
                    else finish();
                }
                return;
            }

            setRemaining(left);

            const whole = Math.ceil(left);
            // Topshirish bosqichi qisqa - butun davomida sanaladi.
            const inWarn = phase === TIMER_PHASES.SUBMIT || whole <= warnAt;
            if (inWarn && whole > 0 && spokenRef.current !== `${runId}:${phase}:${whole}`) {
                spokenRef.current = `${runId}:${phase}:${whole}`;
                if (!muted) {
                    if (speaks) speakNumber(whole, voiceName);
                    else playTick(soundId);
                }
            }
        }, TICK_MS);
        return () => clearInterval(id);
    }, [endsAt, phase, runId, warnAt, soundId, voiceName, speaks, muted, goSubmitPhase, finish]);

    // Probel - boshlash/to'xtatish. FAQAT to'liq ko'rinishda: ixcham
    // nusxa har sahifada turadi va u yerda probel sahifani aylantirish
    // uchun kerak, taymer uchun emas.
    useEffect(() => {
        if (compact) return undefined;
        const onKey = (e) => {
            if (e.code !== 'Space') return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            if (running) pause(); else { unlockAudio(); start(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [compact, running, start, pause]);

    const onStart = () => { unlockAudio(); start(); };
    const onReset = () => { stopSpeech(); endedRef.current = null; spokenRef.current = null; reset(); };

    const setSettings = (next) => {
        if (next.mainSeconds != null || next.submitSeconds != null || next.warnAt != null) {
            applySettings(next);
        }
        if (next.sound != null) setSoundId(next.sound);
        if (next.voice != null) setVoiceName(next.voice);
        if (onSettingsChange) {
            onSettingsChange({
                seconds: next.mainSeconds ?? mainSeconds,
                submitSeconds: next.submitSeconds ?? submitSeconds,
                warnAt: next.warnAt ?? warnAt,
                sound: next.sound ?? soundId,
                voice: next.voice ?? voiceName,
            });
        }
    };

    const left = Math.ceil(remaining);
    const isSubmit = phase === TIMER_PHASES.SUBMIT;
    const done = phase === TIMER_PHASES.DONE;
    const danger = (left <= 3 && left > 0) || isSubmit;
    const warning = !danger && left <= warnAt;

    const numberColor = done ? 'text-rose-500'
        : danger ? 'text-rose-400'
            : warning ? 'text-amber-400'
                : 'text-white';

    // --- IXCHAM: yuqori qatorda, operator uchun -------------------------
    if (compact) {
        return (
            <div className="flex items-center gap-1.5">
                <div
                    className={`px-2.5 py-1 rounded-lg font-black tabular-nums text-base min-w-[3.25rem] text-center ${
                        done ? 'bg-rose-100 text-rose-700'
                            : isSubmit ? 'bg-rose-100 text-rose-700'
                                : warning ? 'bg-amber-100 text-amber-800'
                                    : 'bg-gray-100 text-gray-700'
                    }`}
                    title={PHASE_LABEL[phase]}
                >
                    {fmt(remaining)}
                </div>
                <button
                    type="button" onClick={running ? pause : onStart}
                    title={running ? "To'xtatish" : 'Boshlash'}
                    className={`p-2 rounded-lg ${running ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} hover:opacity-80`}
                >
                    {running ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button
                    type="button" onClick={onReset} title="Qaytadan"
                    className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                    <RotateCcw size={15} />
                </button>
                <button
                    type="button" onClick={() => setMuted(m => !m)}
                    title={muted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
                    className={`p-2 rounded-lg ${muted ? 'bg-gray-100 text-gray-400' : 'bg-indigo-100 text-indigo-700'} hover:opacity-80`}
                >
                    {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
            </div>
        );
    }

    // --- TO'LIQ: jonli ekranda, zal uchun --------------------------------
    return (
        <div className={`bg-slate-900 border rounded-3xl p-4 lg:p-5 ${isSubmit ? 'border-rose-500/60' : 'border-slate-800'}`}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-baseline gap-3 min-w-0">
                    <span
                        className={`font-black tabular-nums leading-none ${numberColor} ${danger || done ? 'animate-pulse' : ''}`}
                        style={{ fontSize: 'clamp(56px, 11vw, 132px)' }}
                    >
                        {fmt(remaining)}
                    </span>
                    <span className={`text-lg lg:text-2xl font-black shrink-0 ${isSubmit ? 'text-rose-400' : 'text-slate-500'}`}>
                        {PHASE_LABEL[phase]}
                    </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button" onClick={running ? pause : onStart}
                        className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-lg font-black transition-colors ${
                            running ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                                : 'bg-emerald-500 text-white hover:bg-emerald-400'
                        }`}
                    >
                        {running ? <Pause size={22} /> : <Play size={22} />}
                        {running ? "To'xtatish" : pausedLeft != null ? 'Davom' : 'Boshlash'}
                    </button>
                    <button
                        type="button" onClick={onReset} title="Qaytadan"
                        className="flex items-center justify-center p-3.5 rounded-2xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                        <RotateCcw size={22} />
                    </button>
                    <button
                        type="button" onClick={() => setMuted(m => !m)}
                        title={muted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
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
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            O&rsquo;ylash vaqti (soniya)
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                            {[30, 40, 60, 90].map(v => (
                                <button
                                    key={v} type="button" onClick={() => setSettings({ mainSeconds: v })}
                                    className={`px-3 py-2 rounded-xl text-sm font-bold ${
                                        mainSeconds === v ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number" min={5} max={3600} value={mainSeconds}
                            onChange={e => setSettings({ mainSeconds: Math.max(5, Math.min(3600, Number(e.target.value) || 5)) })}
                            className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            Topshirish vaqti (soniya)
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                            {[0, 5, 10, 15].map(v => (
                                <button
                                    key={v} type="button" onClick={() => setSettings({ submitSeconds: v })}
                                    className={`px-3 py-2 rounded-xl text-sm font-bold ${
                                        submitSeconds === v ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {v === 0 ? "Yo'q" : v}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                            Asosiy vaqt tugagach o&rsquo;zi boshlanadi va butun davomida sanaladi.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            Sanash qachondan
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                            {[5, 10, 15, 20].map(v => (
                                <button
                                    key={v} type="button" onClick={() => setSettings({ warnAt: v })}
                                    className={`px-3 py-2 rounded-xl text-sm font-bold ${
                                        warnAt === v ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            Sanoq ovozi
                        </label>
                        <select
                            value={soundId}
                            onChange={e => { unlockAudio(); setSettings({ sound: e.target.value }); }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                        >
                            {TIMER_SOUNDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>

                        {speaks && (
                            <>
                                <select
                                    value={voiceName}
                                    onChange={e => setSettings({ voice: e.target.value })}
                                    className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                                >
                                    <option value="">Brauzer tanlagan ovoz</option>
                                    {voices.map(v => (
                                        <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                                    ))}
                                </select>
                                {/* O'zbekcha ovoz brauzerlarda deyarli yo'q - shuning uchun
                                    SO'Z emas, RAQAM aytiladi va uni har ovoz o'z tilida
                                    to'g'ri o'qiydi. Buni oldindan aytib qo'yamiz. */}
                                <p className="text-[11px] text-slate-500 mt-1.5">
                                    Raqam aytiladi, ovoz tilida. O&rsquo;zbekcha ovoz
                                    kompyuteringizda bo&rsquo;lsa ro&rsquo;yxatda chiqadi.
                                </p>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                unlockAudio();
                                if (speaks) speakNumber(3, voiceName); else playTick(soundId);
                            }}
                            className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold hover:bg-slate-700"
                        >
                            Eshitib ko&rsquo;rish
                        </button>
                    </div>
                </div>
            )}

            {!showSettings && (
                <p className="mt-3 text-sm text-slate-500">
                    Oxirgi {warnAt} soniyada sanaladi
                    {submitSeconds > 0 && <>, keyin topshirish uchun {submitSeconds} soniya</>}.
                    Taymer yuqori qatordan ham boshqariladi.
                </p>
            )}
        </div>
    );
};

export default CompetitionTimer;
