import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Settings2, Volume2, VolumeX, Keyboard } from 'lucide-react';
import {
    SIGNAL_SOUNDS, playTick, playEnd, unlockAudio,
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

    // ESKI SOZLAMANI O'QISH. Avval hammasi bitta `timerSound` maydonida
    // edi ('beep' | 'voice' | 'voice_uz' | 'silent'). Saqlangan
    // musobaqalar buzilmasligi uchun eski qiymat yangi ikki kalitga
    // o'giriladi.
    const [signalOn, setSignalOn] = useState(
        () => !['voice', 'voice_uz', 'silent'].includes(defaultSound));
    const [signalSound, setSignalSound] = useState(
        () => (SIGNAL_SOUNDS.some(x => x.id === defaultSound) ? defaultSound : 'beep'));
    const [voiceOn, setVoiceOn] = useState(
        () => ['voice', 'voice_uz'].includes(defaultSound));
    const [voiceUzbek, setVoiceUzbek] = useState(() => defaultSound === 'voice_uz');
    const [voiceName, setVoiceName] = useState(defaultVoice);
    // Ixcham ko'rinish JIM - izohi fayl boshida.
    const [muted, setMuted] = useState(compact);
    const [showSettings, setShowSettings] = useState(false);
    const [showKeys, setShowKeys] = useState(false);
    const [voices, setVoices] = useState([]);

    const [remaining, setRemaining] = useState(defaultSeconds);
    const spokenRef = useRef(null);
    const endedRef = useRef(null);

    useEffect(() => {
        setSignalOn(!['voice', 'voice_uz', 'silent'].includes(defaultSound));
        setSignalSound(SIGNAL_SOUNDS.some(x => x.id === defaultSound) ? defaultSound : 'beep');
        setVoiceOn(['voice', 'voice_uz'].includes(defaultSound));
        setVoiceUzbek(defaultSound === 'voice_uz');
    }, [defaultSound]);
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
    const anySound = signalOn || voiceOn;

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
                    // YAKUNIY SIGNAL har doim chalinadi - signal o'chirilgan
                    // bo'lsa ham. Vaqt tugaganini zal eshitmay qolsa, butun
                    // taymerning ma'nosi yo'qoladi.
                    if (!muted && anySound) { stopSpeech(); playEnd(signalSound); }
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
                    // Ikkalasi MUSTAQIL: birga ham, alohida ham ishlaydi.
                    if (signalOn) playTick(signalSound);
                    if (voiceOn) speakNumber(whole, voiceName, { uzbek: voiceUzbek });
                }
            }
        }, TICK_MS);
        return () => clearInterval(id);
    }, [endsAt, phase, runId, warnAt, signalOn, signalSound, voiceOn, voiceUzbek, voiceName,
        anySound, muted, goSubmitPhase, finish]);

    // Probel - boshlash/to'xtatish. FAQAT to'liq ko'rinishda: ixcham
    // nusxa har sahifada turadi va u yerda probel sahifani aylantirish
    // uchun kerak, taymer uchun emas.
    // KLAVIATURA. Zalda o'yin tez ketadi - sichqonchani qidirish vaqt
    // yeydi. FAQAT to'liq ko'rinishda: ixcham nusxa har sahifada turadi
    // va u yerda bu tugmalar boshqa ishni buzardi.
    useEffect(() => {
        if (compact) return undefined;
        const onKey = (e) => {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const k = e.key.toLowerCase();

            if (e.code === 'Space') {
                e.preventDefault();
                if (running) pause(); else { unlockAudio(); start(); }
            } else if (e.code === 'Enter') {
                e.preventDefault();
                stopSpeech(); endedRef.current = null; spokenRef.current = null; reset();
            } else if (k === 'k') { setShowKeys(v => !v); }
            else if (k === 'm') { setShowSettings(v => !v); }
            else if (e.code === 'Escape') { setShowKeys(false); setShowSettings(false); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [compact, running, start, pause, reset]);

    const onStart = () => { unlockAudio(); start(); };
    const onReset = () => { stopSpeech(); endedRef.current = null; spokenRef.current = null; reset(); };

    const setSettings = (next) => {
        if (next.mainSeconds != null || next.submitSeconds != null || next.warnAt != null) {
            applySettings(next);
        }
        // SIGNAL VA OVOZ BIR-BIRINI O'CHIRADI. Ikkalasi birga chalinsa
        // zalda ular ustma-ust tushib, sonni eshitib bo'lmasdi. Shuning
        // uchun biri yoqilsa ikkinchisi avtomatik o'chadi - operator
        // ikkinchi tugmani qidirib o'tirmasin. Ikkalasini o'chirib
        // qo'yish mumkin: bu "ovozsiz" degani.
        if (next.signalOn != null) {
            setSignalOn(next.signalOn);
            if (next.signalOn) setVoiceOn(false);
        }
        if (next.signalSound != null) setSignalSound(next.signalSound);
        if (next.voiceOn != null) {
            setVoiceOn(next.voiceOn);
            if (next.voiceOn) setSignalOn(false);
        }
        if (next.voiceUzbek != null) setVoiceUzbek(next.voiceUzbek);
        if (next.voice != null) setVoiceName(next.voice);

        if (onSettingsChange) {
            // Baza maydoni bitta `timerSound` - eski musobaqalar bilan
            // mos qolishi uchun ikki kalit o'sha shaklga qaytariladi.
            // Bir-birini o'chirish saqlanadigan qiymatda ham aks etsin.
            const sOn = next.signalOn != null ? next.signalOn
                : (next.voiceOn ? false : signalOn);
            const vOn = next.voiceOn != null ? next.voiceOn
                : (next.signalOn ? false : voiceOn);
            const vUz = next.voiceUzbek ?? voiceUzbek;
            const sSound = next.signalSound ?? signalSound;
            const legacy = vOn ? (vUz ? 'voice_uz' : 'voice') : (sOn ? sSound : 'silent');
            onSettingsChange({
                seconds: next.mainSeconds ?? mainSeconds,
                submitSeconds: next.submitSeconds ?? submitSeconds,
                warnAt: next.warnAt ?? warnAt,
                sound: legacy,
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

    // --- PANEL: yuqori qatordagi ochiladigan oynada, yorug' fonda -------
    //
    // Jonli ekran qorong'i, yuqori qatordagi oyna esa yorug' - shuning
    // uchun bu alohida ko'rinish. Boshqaruv bir xil, faqat raqam kichik
    // va ranglar yorug' fonga moslangan.
    if (compact) {
        return (
            <div className="p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                    <span className={`font-black tabular-nums leading-none ${
                        done || isSubmit ? 'text-rose-600' : warning ? 'text-amber-600' : 'text-gray-900'
                    }`} style={{ fontSize: '44px' }}>
                        {fmt(remaining)}
                    </span>
                    <span className={`text-sm font-bold ${isSubmit ? 'text-rose-600' : 'text-gray-400'}`}>
                        {PHASE_LABEL[phase]}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button" onClick={running ? pause : onStart}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${
                            running ? 'bg-amber-500 text-white hover:bg-amber-600'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                    >
                        {running ? <Pause size={16} /> : <Play size={16} />}
                        {running ? "To'xtatish" : pausedLeft != null ? 'Davom' : 'Boshlash'}
                    </button>
                    <button
                        type="button" onClick={onReset} title="Qaytadan"
                        className="p-2.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                        <RotateCcw size={16} />
                    </button>
                    <button
                        type="button" onClick={() => setMuted(m => !m)}
                        title={muted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
                        className={`p-2.5 rounded-xl ${muted ? 'bg-gray-100 text-gray-400' : 'bg-indigo-100 text-indigo-700'} hover:opacity-80`}
                    >
                        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <button
                        type="button" onClick={() => setShowSettings(v => !v)} title="Sozlash"
                        className={`p-2.5 rounded-xl ${showSettings ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        <Settings2 size={16} />
                    </button>
                </div>

                {showSettings && (
                    <div className="pt-3 border-t border-gray-100 space-y-3">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                                O&rsquo;ylash vaqti (soniya)
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                                {[30, 40, 60, 90].map(v => (
                                    <button
                                        key={v} type="button" onClick={() => setSettings({ mainSeconds: v })}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                                            mainSeconds === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                                Topshirish vaqti (soniya)
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                                {[0, 5, 10, 15].map(v => (
                                    <button
                                        key={v} type="button" onClick={() => setSettings({ submitSeconds: v })}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                                            submitSeconds === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {v === 0 ? "Yo'q" : v}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-gray-700">Signal</span>
                                <button
                                    type="button" aria-label="Signal"
                                    onClick={() => { unlockAudio(); setSettings({ signalOn: !signalOn }); }}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${
                                        signalOn ? 'bg-indigo-600' : 'bg-gray-300'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                                        signalOn ? 'left-[1.375rem]' : 'left-0.5'
                                    }`} />
                                </button>
                            </div>
                            {signalOn && (
                                <select
                                    value={signalSound}
                                    onChange={e => { unlockAudio(); setSettings({ signalSound: e.target.value }); }}
                                    className="w-full px-3 py-2 rounded-lg bg-white text-gray-800 text-sm border border-gray-200"
                                >
                                    {SIGNAL_SOUNDS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                            )}

                            <div className="flex items-center justify-between gap-2 pt-1">
                                <span className="text-sm font-bold text-gray-700">Inson ovozi</span>
                                <button
                                    type="button" aria-label="Inson ovozi"
                                    onClick={() => { unlockAudio(); setSettings({ voiceOn: !voiceOn }); }}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${
                                        voiceOn ? 'bg-indigo-600' : 'bg-gray-300'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                                        voiceOn ? 'left-[1.375rem]' : 'left-0.5'
                                    }`} />
                                </button>
                            </div>
                            {voiceOn && (
                                <>
                                    <div className="flex gap-1.5">
                                        {[[false, 'Raqam'], [true, "O'zbekcha"]].map(([uz, lbl]) => (
                                            <button
                                                key={lbl} type="button"
                                                onClick={() => setSettings({ voiceUzbek: uz })}
                                                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold ${
                                                    voiceUzbek === uz ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {lbl}
                                            </button>
                                        ))}
                                    </div>
                                    <select
                                        value={voiceName}
                                        onChange={e => setSettings({ voice: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg bg-white text-gray-800 text-sm border border-gray-200"
                                    >
                                        <option value="">Brauzer tanlagan ovoz</option>
                                        {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                                    </select>
                                </>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Ovoz zalda jonli ekrandan chiqadi. Bu yerda jim turadi.
                        </p>
                    </div>
                )}
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
                        type="button" onClick={() => setShowKeys(v => !v)} title="Klaviatura yorliqlari (K)"
                        className={`flex items-center justify-center p-3.5 rounded-2xl ${
                            showKeys ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                        <Keyboard size={22} />
                    </button>
                    <button
                        type="button" onClick={() => setShowSettings(s => !s)} title="Sozlash (M)"
                        className={`flex items-center justify-center p-3.5 rounded-2xl ${
                            showSettings ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                        <Settings2 size={22} />
                    </button>
                </div>
            </div>

            {showKeys && (
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                    {[
                        ["Boshlash / to’xtatish", 'SPACE'],
                        ['Qaytadan', 'ENTER'],
                        ['Sozlamalar', 'M'],
                        ["Shu ro’yxat", 'K'],
                        ['Oynalarni yopish', 'ESC'],
                    ].map(([what, key]) => (
                        <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm text-slate-400">{what}</span>
                            <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300">
                                {key}
                            </kbd>
                        </div>
                    ))}
                </div>
            )}

            {showSettings && (
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Har sozlama ostida BIR QATORLIK IZOH turadi. Ilgari
                        faqat raqamlar bor edi va ularning nima qilishi
                        tushunarsiz edi - operator sinab ko'rib bilishga
                        majbur bo'lardi. */}

                    <div className="space-y-4">
                        <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                            1. Vaqt
                        </p>

                        <div>
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-200">O&rsquo;ylash vaqti</span>
                                <span className="text-xs text-slate-500 tabular-nums">{mainSeconds}s</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mb-2">
                                Savol o&rsquo;qilgandan keyin beriladigan vaqt
                            </p>
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
                                <input
                                    type="number" min={5} max={3600} value={mainSeconds}
                                    onChange={e => setSettings({ mainSeconds: Math.max(5, Math.min(3600, Number(e.target.value) || 5)) })}
                                    className="w-20 px-2 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-200">Javob yozish vaqti</span>
                                {/* Yoqish/o'chirish - bu ikkilik tanlov, raqam emas. */}
                                <button
                                    type="button"
                                    onClick={() => setSettings({ submitSeconds: submitSeconds > 0 ? 0 : 10 })}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${
                                        submitSeconds > 0 ? 'bg-indigo-500' : 'bg-slate-700'
                                    }`}
                                    aria-label="Javob yozish vaqti"
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                                        submitSeconds > 0 ? 'left-[1.375rem]' : 'left-0.5'
                                    }`} />
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500 mb-2">
                                Asosiy vaqt tugagach qo&rsquo;shimcha vaqt beriladi
                            </p>
                            {submitSeconds > 0 && (
                                <div className="flex gap-1.5 flex-wrap">
                                    {[5, 10, 15, 20].map(v => (
                                        <button
                                            key={v} type="button" onClick={() => setSettings({ submitSeconds: v })}
                                            className={`px-3 py-2 rounded-xl text-sm font-bold ${
                                                submitSeconds === v ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                            }`}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                            2. Sanoq
                        </p>
                        <div>
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-200">Oxirgi soniyalar</span>
                                <span className="text-xs text-slate-500 tabular-nums">{warnAt}s</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mb-2">
                                Shu soniya qolganda har soniyada ogohlantiriladi
                            </p>
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
                            <p className="text-[11px] text-slate-500 mt-2">
                                Javob yozish vaqti esa butun davomida sanaladi.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                            3. Ovoz
                        </p>
                        {/* SIGNAL va OVOZ - MUSTAQIL. Ilgari ular bitta
                            ro'yxatda edi va biri tanlansa ikkinchisi
                            o'chardi. Amalda esa ikkalasi birga kerak
                            bo'ladi: qisqa signal soniyani aniq belgilaydi,
                            ovoz esa qolgan sonni aytadi. */}
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-200">Signal</span>
                                <button
                                    type="button" aria-label="Signal"
                                    onClick={() => { unlockAudio(); setSettings({ signalOn: !signalOn }); }}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${
                                        signalOn ? 'bg-indigo-500' : 'bg-slate-700'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                                        signalOn ? 'left-[1.375rem]' : 'left-0.5'
                                    }`} />
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500 mb-2">
                                Elektron tovush. Vaqt tugaganda har doim chalinadi.
                            </p>
                            {signalOn && (
                                <select
                                    value={signalSound}
                                    onChange={e => { unlockAudio(); setSettings({ signalSound: e.target.value }); }}
                                    className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                                >
                                    {SIGNAL_SOUNDS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-bold text-slate-200">Inson ovozi</span>
                                <button
                                    type="button" aria-label="Inson ovozi"
                                    onClick={() => { unlockAudio(); setSettings({ voiceOn: !voiceOn }); }}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${
                                        voiceOn ? 'bg-indigo-500' : 'bg-slate-700'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                                        voiceOn ? 'left-[1.375rem]' : 'left-0.5'
                                    }`} />
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500 mb-2">
                                Qolgan sonni ovoz bilan aytadi. Yoqilsa signal o&rsquo;chadi,
                                lekin vaqt tugaganda baribir tovush chalinadi.
                            </p>
                            {voiceOn && (
                                <>
                                    <div className="flex gap-1.5 mb-2">
                                        {[[false, 'Raqam'], [true, "O'zbekcha"]].map(([uz, lbl]) => (
                                            <button
                                                key={lbl} type="button"
                                                onClick={() => setSettings({ voiceUzbek: uz })}
                                                className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold ${
                                                    voiceUzbek === uz ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                            >
                                                {lbl}
                                            </button>
                                        ))}
                                    </div>
                                    <select
                                        value={voiceName}
                                        onChange={e => setSettings({ voice: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-sm border border-slate-700"
                                    >
                                        <option value="">Brauzer tanlagan ovoz</option>
                                        {voices.map(v => (
                                            <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                                        ))}
                                    </select>
                                    {/* Brauzerlarda o'zbek ovozi yo'q - buni oldindan
                                        aytamiz, aks holda odam uni qidirib vaqt yo'qotadi. */}
                                    <p className="text-[11px] text-slate-500 mt-1.5">
                                        {voiceUzbek
                                            ? "Brauzerda o'zbek ovozi yo'q. TURKCHA ovozni tanlang - u eng yaqin eshitiladi, ruscha ham bo'ladi."
                                            : 'Raqam aytiladi, tanlangan ovoz tilida.'}
                                    </p>
                                </>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                unlockAudio();
                                if (signalOn) playTick(signalSound);
                                if (voiceOn) speakNumber(3, voiceName, { uzbek: voiceUzbek });
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold hover:bg-slate-700"
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
