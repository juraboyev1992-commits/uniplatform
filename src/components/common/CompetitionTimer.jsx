import React, { useEffect, useRef, useState } from 'react';
import {
    Play, Pause, RotateCcw, Settings2, Volume2, VolumeX, Keyboard,
    Bell, BellOff, Mic,
} from 'lucide-react';
import {
    SIGNAL_SOUNDS, playTick, playEnd, playBegin, unlockAudio,
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

// OVOZ - BITTA TANLOV, UCHTA QIYMAT.
//
// Ilgari ikkita mustaqil kalit edi: "Signal" va "Inson ovozi". Ular
// bir-biriga zid holatga tushardi - panelda signal tanlangan ko'rinardi,
// zalda esa inson ovozi sanardi. Nuqson uch marta tuzatildi va har safar
// qaytdi, chunki qo'riqchi qo'yish ikkala kalit yoqilgan HOLATNI
// yo'qotmaydi, faqat unga boradigan bir yo'lni yopadi.
//
// Bitta tanlovda bu holat umuman mavjud emas. Shu bilan birga interfeys
// ham rostgo'y bo'ldi: ikki kalit "ikkalasini birga yoqsa bo'ladi" deb
// yolg'on aytardi, uchta tugma esa tanlov bitta ekanini ko'rsatib turadi.
const SOUND_MODES = [
    { id: 'signal', label: 'Signal', icon: Bell, hint: 'Qisqa elektron tovush' },
    { id: 'voice', label: 'Inson ovozi', icon: Mic, hint: 'Qolgan sonni aytadi' },
    { id: 'silent', label: 'Ovozsiz', icon: BellOff, hint: 'Faqat vaqt tugaganda' },
];

// Bazada ovoz hamon BITTA `timerSound` maydonida saqlanadi
// ('beep' | 'voice' | 'voice_uz' | 'silent' | boshqa signal nomi).
// Eski musobaqalar ishlashdan to'xtamasligi uchun o'qishda va yozishda
// shu shaklga o'giriladi.
const legacyToMode = (sound) => {
    if (sound === 'voice' || sound === 'voice_uz') return 'voice';
    if (sound === 'silent') return 'silent';
    return 'signal';
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
    const legacy = {
        soundMode: legacyToMode(defaultSound),
        signalSound: SIGNAL_SOUNDS.some(x => x.id === defaultSound) ? defaultSound : 'beep',
        voiceUzbek: defaultSound === 'voice_uz',
        voiceName: defaultVoice,
    };

    const {
        shared, running, start, pause, reset, goSubmitPhase, finish, applySettings,
    } = useSharedTimer({
        mainSeconds: defaultSeconds,
        submitSeconds: defaultSubmitSeconds,
        warnAt: defaultWarnAt,
        ...legacy,
    });

    // Ixcham ko'rinish JIM - izohi fayl boshida.
    const [muted, setMuted] = useState(compact);
    const [showSettings, setShowSettings] = useState(false);
    const [showKeys, setShowKeys] = useState(false);
    const [voices, setVoices] = useState([]);

    const [remaining, setRemaining] = useState(defaultSeconds);
    const spokenRef = useRef(null);
    const begunRef = useRef(null);
    const endedRef = useRef(null);

    // Ovoz ro'yxati brauzerda kechikib yuklanadi.
    useEffect(() => {
        if (!speechAvailable()) return undefined;
        const load = () => setVoices(listVoices());
        load();
        window.speechSynthesis.addEventListener?.('voiceschanged', load);
        return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
    }, []);

    const {
        phase, endsAt, pausedLeft, mainSeconds, submitSeconds, warnAt, runId,
        soundMode, signalSound, voiceUzbek, voiceName,
    } = shared;
    const anySound = soundMode !== 'silent';

    // Yurmayotganda ko'rsatiladigan raqam.
    useEffect(() => {
        if (running) return;
        if (pausedLeft != null) setRemaining(pausedLeft);
        else if (phase === TIMER_PHASES.DONE) setRemaining(0);
        else setRemaining(mainSeconds);
    }, [running, pausedLeft, phase, mainSeconds]);

    // INSON OVOZIDAN CHIQQANDA NUTQ DARHOL TO'XTAYDI.
    //
    // `speechSynthesis` o'z navbatiga ega: `speak()` ga berilgan gap
    // to'xtatilmasa oxirigacha aytiladi. Operator sanoq o'rtasida
    // signalga o'tsa, navbatda turgan son baribir aytilib qolardi.
    useEffect(() => {
        if (soundMode !== 'voice') stopSpeech();
    }, [soundMode]);

    // BOSHLASH SIGNALI.
    //
    // Tugma bosilishiga emas, HOLAT o'zgarishiga bog'langan. Sabab:
    // operator yuqori qatordagi paneldan boshlashi mumkin, u esa jim -
    // bosish hodisasiga bog'lasak, zaldagi jonli ekran signal
    // chalmay qolardi. Holatga bog'lansa, ovozi yoqilgan har qanday
    // oyna chaladi.
    //
    // Faqat ASOSIY bosqich boshlanganda. Topshirish bosqichi o'zi
    // asosiy vaqt tugagan signalidan keyin keladi - u yerda yana
    // signal berish ortiqcha bo'lardi.
    useEffect(() => {
        if (endsAt == null || phase !== TIMER_PHASES.MAIN) return;
        if (begunRef.current === endsAt) return;
        begunRef.current = endsAt;
        if (!muted && anySound) playBegin(signalSound);
    }, [endsAt, phase, muted, anySound, signalSound]);

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
                    // YAKUNIY SIGNAL - "Ovozsiz" tanlanmagan bo'lsa har doim
                    // chalinadi, inson ovozi rejimida ham. Vaqt tugaganini zal
                    // eshitmay qolsa, butun taymerning ma'nosi yo'qoladi.
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
                // BITTA tanlov - bitta tarmoq. Ikkisi birga chiqishi mumkin emas.
                if (!muted) {
                    if (soundMode === 'signal') playTick(signalSound);
                    else if (soundMode === 'voice') speakNumber(whole, voiceName, { uzbek: voiceUzbek });
                }
            }
        }, TICK_MS);
        return () => clearInterval(id);
    }, [endsAt, phase, runId, warnAt, soundMode, signalSound, voiceUzbek, voiceName,
        anySound, muted, goSubmitPhase, finish]);

    const onStart = () => { unlockAudio(); start(); };
    const onReset = () => {
        stopSpeech();
        endedRef.current = null; spokenRef.current = null; begunRef.current = null;
        reset();
    };

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

    const setSettings = (next) => {
        // Vaqt va ovoz bitta yo'ldan o'tadi - umumiy xotiraga, ya'ni
        // ikkala oyna ham darhol biladi.
        applySettings(next.voice != null ? { ...next, voiceName: next.voice } : next);

        if (onSettingsChange) {
            const mode = next.soundMode ?? soundMode;
            const uz = next.voiceUzbek ?? voiceUzbek;
            const sig = next.signalSound ?? signalSound;
            const legacySound = mode === 'voice' ? (uz ? 'voice_uz' : 'voice')
                : mode === 'signal' ? sig : 'silent';
            onSettingsChange({
                seconds: next.mainSeconds ?? mainSeconds,
                submitSeconds: next.submitSeconds ?? submitSeconds,
                warnAt: next.warnAt ?? warnAt,
                sound: legacySound,
                voice: next.voice ?? voiceName,
            });
        }
    };

    const left = Math.ceil(remaining);
    const isSubmit = phase === TIMER_PHASES.SUBMIT;
    const done = phase === TIMER_PHASES.DONE;
    const danger = (left <= 3 && left > 0) || isSubmit;
    const warning = !danger && left <= warnAt && phase !== TIMER_PHASES.IDLE;

    // BIR QARASHDA O'QILADIGAN HOLAT.
    //
    // Zaldagi odam raqamni o'qishga ulgurmasligi mumkin, lekin yo'lakchaning
    // qisqarishi va rangi uzoqdan ham ko'rinadi. Shuning uchun holat ikki
    // marta - raqam bilan ham, rang va uzunlik bilan ham - ko'rsatiladi.
    const phaseTotal = isSubmit ? submitSeconds : mainSeconds;
    const pct = phaseTotal > 0
        ? Math.max(0, Math.min(100, (remaining / phaseTotal) * 100))
        : 0;

    const tone = done ? 'done' : isSubmit ? 'submit' : danger ? 'danger' : warning ? 'warn' : 'calm';
    const TONE = {
        calm: { dark: 'text-white', light: 'text-gray-900', rail: 'bg-emerald-400', chip: 'text-emerald-400', chipL: 'text-emerald-600 bg-emerald-50' },
        warn: { dark: 'text-amber-300', light: 'text-amber-600', rail: 'bg-amber-400', chip: 'text-amber-300', chipL: 'text-amber-700 bg-amber-50' },
        danger: { dark: 'text-rose-400', light: 'text-rose-600', rail: 'bg-rose-500', chip: 'text-rose-400', chipL: 'text-rose-700 bg-rose-50' },
        submit: { dark: 'text-rose-400', light: 'text-rose-600', rail: 'bg-rose-500', chip: 'text-rose-400', chipL: 'text-rose-700 bg-rose-50' },
        done: { dark: 'text-rose-500', light: 'text-rose-600', rail: 'bg-rose-600', chip: 'text-rose-400', chipL: 'text-rose-700 bg-rose-50' },
    }[tone];

    const activeMode = SOUND_MODES.find(m => m.id === soundMode) || SOUND_MODES[0];

    // --- OVOZ TANLOVI (ikki ko'rinishda bir xil) -------------------------
    const soundChoice = (dark) => (
        <div className="grid grid-cols-3 gap-1.5">
            {SOUND_MODES.map(m => {
                const on = soundMode === m.id;
                const Icon = m.icon;
                return (
                    <button
                        key={m.id} type="button"
                        onClick={() => { unlockAudio(); setSettings({ soundMode: m.id }); }}
                        aria-pressed={on}
                        className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[11px] font-bold transition-colors ${
                            on
                                ? 'bg-indigo-500 text-white'
                                : dark
                                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                    >
                        <Icon size={16} />
                        {m.label}
                    </button>
                );
            })}
        </div>
    );

    // --- SOZLAMALAR (ikki ko'rinishda bir xil mazmun) --------------------
    //
    // Har sozlama ostida BIR QATORLIK IZOH turadi. Ilgari faqat raqamlar
    // bor edi va ularning nima qilishi tushunarsiz edi - operator sinab
    // ko'rib bilishga majbur bo'lardi.
    const settingsBody = (dark) => {
        const lbl = dark ? 'text-slate-200' : 'text-gray-700';
        const hint = dark ? 'text-slate-500' : 'text-gray-400';
        const head = dark ? 'text-indigo-400' : 'text-indigo-600';
        const chip = (on) => `px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
            on ? 'bg-indigo-500 text-white'
                : dark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`;
        const field = dark
            ? 'bg-slate-800 text-white border-slate-700'
            : 'bg-white text-gray-800 border-gray-200';
        const sw = (on) => `relative w-11 h-6 rounded-full transition-colors ${
            on ? 'bg-indigo-500' : dark ? 'bg-slate-700' : 'bg-gray-300'
        }`;

        return (
            <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-3'} gap-6`}>
                {/* 1. VAQT */}
                <div className="space-y-4">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${head}`}>1. Vaqt</p>

                    <div>
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                            <span className={`text-sm font-bold ${lbl}`}>O&rsquo;ylash vaqti</span>
                            <span className={`text-xs tabular-nums ${hint}`}>{mainSeconds}s</span>
                        </div>
                        <p className={`text-[11px] mb-2 ${hint}`}>
                            Savol o&rsquo;qilgandan keyin beriladigan vaqt
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                            {[30, 40, 60, 90].map(v => (
                                <button key={v} type="button" onClick={() => setSettings({ mainSeconds: v })} className={chip(mainSeconds === v)}>
                                    {v}
                                </button>
                            ))}
                            <input
                                type="number" min={5} max={3600} value={mainSeconds}
                                onChange={e => setSettings({ mainSeconds: Math.max(5, Math.min(3600, Number(e.target.value) || 5)) })}
                                className={`w-20 px-2 py-2 rounded-xl text-sm border ${field}`}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`text-sm font-bold ${lbl}`}>Javob yozish vaqti</span>
                            {/* Yoqish/o'chirish - bu ikkilik tanlov, raqam emas. */}
                            <button
                                type="button" aria-label="Javob yozish vaqti"
                                onClick={() => setSettings({ submitSeconds: submitSeconds > 0 ? 0 : 10 })}
                                className={sw(submitSeconds > 0)}
                            >
                                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                                    submitSeconds > 0 ? 'left-[1.375rem]' : 'left-0.5'
                                }`} />
                            </button>
                        </div>
                        <p className={`text-[11px] mb-2 ${hint}`}>
                            Asosiy vaqt tugagach qo&rsquo;shimcha vaqt beriladi
                        </p>
                        {submitSeconds > 0 && (
                            <div className="flex gap-1.5 flex-wrap">
                                {[5, 10, 15, 20].map(v => (
                                    <button key={v} type="button" onClick={() => setSettings({ submitSeconds: v })} className={chip(submitSeconds === v)}>
                                        {v}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. SANOQ */}
                <div className="space-y-4">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${head}`}>2. Sanoq</p>
                    <div>
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                            <span className={`text-sm font-bold ${lbl}`}>Oxirgi soniyalar</span>
                            <span className={`text-xs tabular-nums ${hint}`}>{warnAt}s</span>
                        </div>
                        <p className={`text-[11px] mb-2 ${hint}`}>
                            Shu soniya qolganda har soniyada ogohlantiriladi
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                            {[5, 10, 15, 20].map(v => (
                                <button key={v} type="button" onClick={() => setSettings({ warnAt: v })} className={chip(warnAt === v)}>
                                    {v}
                                </button>
                            ))}
                        </div>
                        <p className={`text-[11px] mt-2 ${hint}`}>
                            Javob yozish vaqti esa butun davomida sanaladi.
                        </p>
                    </div>
                </div>

                {/* 3. OVOZ */}
                <div className="space-y-4">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${head}`}>3. Ovoz</p>

                    <div>
                        {soundChoice(dark)}
                        <p className={`text-[11px] mt-2 ${hint}`}>{activeMode.hint}</p>
                    </div>

                    {soundMode === 'signal' && (
                        <select
                            value={signalSound}
                            onChange={e => { unlockAudio(); setSettings({ signalSound: e.target.value }); }}
                            className={`w-full px-3 py-2 rounded-xl text-sm border ${field}`}
                        >
                            {SIGNAL_SOUNDS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                    )}

                    {soundMode === 'voice' && (
                        <div className="space-y-2">
                            <div className="flex gap-1.5">
                                {[[false, 'Raqam'], [true, "O'zbekcha"]].map(([uz, text]) => (
                                    <button
                                        key={text} type="button"
                                        onClick={() => setSettings({ voiceUzbek: uz })}
                                        className={`flex-1 ${chip(voiceUzbek === uz)}`}
                                    >
                                        {text}
                                    </button>
                                ))}
                            </div>
                            <select
                                value={voiceName}
                                onChange={e => setSettings({ voice: e.target.value })}
                                className={`w-full px-3 py-2 rounded-xl text-sm border ${field}`}
                            >
                                <option value="">Brauzer tanlagan ovoz</option>
                                {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                            </select>
                            {/* Brauzerlarda o'zbek ovozi yo'q - buni oldindan
                                aytamiz, aks holda odam uni qidirib vaqt yo'qotadi. */}
                            <p className={`text-[11px] ${hint}`}>
                                {voiceUzbek
                                    ? "Brauzerda o'zbek ovozi yo'q. TURKCHA ovozni tanlang - u eng yaqin eshitiladi, ruscha ham bo'ladi."
                                    : 'Raqam aytiladi, tanlangan ovoz tilida.'}
                            </p>
                        </div>
                    )}

                    <p className={`text-[11px] ${hint}`}>
                        Vaqt tugaganda tovush &laquo;Ovozsiz&raquo;dan boshqa hamma rejimda chalinadi.
                    </p>

                    <button
                        type="button"
                        onClick={() => {
                            unlockAudio();
                            if (soundMode === 'signal') playTick(signalSound);
                            else if (soundMode === 'voice') speakNumber(3, voiceName, { uzbek: voiceUzbek });
                        }}
                        disabled={soundMode === 'silent'}
                        className={`w-full px-3 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${
                            dark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        Eshitib ko&rsquo;rish
                    </button>
                </div>
            </div>
        );
    };

    // --- PANEL: yuqori qatordagi ochiladigan oynada, yorug' fonda -------
    //
    // Jonli ekran qorong'i, yuqori qatordagi oyna esa yorug' - shuning
    // uchun bu alohida ko'rinish. Boshqaruv bir xil, faqat raqam kichik
    // va ranglar yorug' fonga moslangan.
    if (compact) {
        return (
            <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${TONE.chipL}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {PHASE_LABEL[phase]}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${muted ? 'text-gray-400' : 'text-indigo-600'}`}>
                        <activeMode.icon size={13} />
                        {activeMode.label}
                    </span>
                </div>

                <div className={`font-black tabular-nums leading-none tracking-tight ${TONE.light}`} style={{ fontSize: '52px' }}>
                    {fmt(remaining)}
                </div>

                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                        className={`h-full rounded-full ${TONE.rail} transition-[width] duration-200 ease-linear`}
                        style={{ width: `${pct}%` }}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button" onClick={running ? pause : onStart}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors ${
                            running ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'
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
                        className={`p-2.5 rounded-xl hover:opacity-80 ${muted ? 'bg-gray-100 text-gray-400' : 'bg-indigo-100 text-indigo-700'}`}
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
                    <div className="pt-3 border-t border-gray-100">
                        {settingsBody(false)}
                    </div>
                )}

                <p className="text-[11px] text-gray-400">
                    Ovoz zalda jonli ekrandan chiqadi. Bu yerda jim turadi.
                </p>
            </div>
        );
    }

    // --- TO'LIQ: jonli ekranda, zal uchun --------------------------------
    return (
        <div className={`rounded-3xl p-5 lg:p-6 bg-slate-900 ring-1 transition-colors ${
            isSubmit || done ? 'ring-rose-500/50' : 'ring-white/5'
        }`}>
            <div className="flex items-start justify-between gap-5 flex-wrap">
                <div className="min-w-0">
                    {/* Holat yorlig'i raqam USTIDA - raqam yonida turganda u
                        bilan bellashardi va ikkisi ham yutqazardi. */}
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className={`inline-flex items-center gap-2 text-sm lg:text-base font-black uppercase tracking-widest ${TONE.chip}`}>
                            <span className={`w-2 h-2 rounded-full bg-current ${running ? 'animate-pulse' : ''}`} />
                            {PHASE_LABEL[phase]}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                            <activeMode.icon size={13} />
                            {activeMode.label}
                            {muted && <span className="text-rose-400">&middot; jim</span>}
                        </span>
                    </div>
                    <div
                        className={`font-black tabular-nums leading-[0.85] tracking-tighter ${TONE.dark} ${danger || done ? 'animate-pulse' : ''}`}
                        style={{ fontSize: 'clamp(64px, 12vw, 148px)' }}
                    >
                        {fmt(remaining)}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button" onClick={running ? pause : onStart}
                        className={`flex items-center gap-2 px-7 py-4 rounded-2xl text-lg font-black transition-colors ${
                            running ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                                : 'bg-emerald-500 text-white hover:bg-emerald-400'
                        }`}
                    >
                        {running ? <Pause size={22} /> : <Play size={22} />}
                        {running ? "To'xtatish" : pausedLeft != null ? 'Davom' : 'Boshlash'}
                    </button>

                    {/* Ikkilamchi tugmalar bitta guruhda - ilgari ular
                        boshlash tugmasi bilan bir xil vaznda ko'rinardi. */}
                    <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-800/60">
                        <button
                            type="button" onClick={onReset} title="Qaytadan (ENTER)"
                            className="p-3 rounded-xl text-slate-300 hover:bg-slate-700"
                        >
                            <RotateCcw size={20} />
                        </button>
                        <button
                            type="button" onClick={() => setMuted(m => !m)}
                            title={muted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
                            className={`p-3 rounded-xl ${muted ? 'bg-rose-500/20 text-rose-400' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                        <button
                            type="button" onClick={() => setShowKeys(v => !v)} title="Klaviatura yorliqlari (K)"
                            className={`p-3 rounded-xl ${showKeys ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                            <Keyboard size={20} />
                        </button>
                        <button
                            type="button" onClick={() => setShowSettings(s => !s)} title="Sozlash (M)"
                            className={`p-3 rounded-xl ${showSettings ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                            <Settings2 size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* QOLGAN VAQT YO'LAKCHASI - zalning orqa qatoridan ham o'qiladi. */}
            <div className="mt-4 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                    className={`h-full rounded-full ${TONE.rail} transition-[width] duration-200 ease-linear`}
                    style={{ width: `${pct}%` }}
                />
            </div>

            {showKeys && (
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                    {[
                        ["Boshlash / to'xtatish", 'SPACE'],
                        ['Qaytadan', 'ENTER'],
                        ['Sozlamalar', 'M'],
                        ["Shu ro'yxat", 'K'],
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
                <div className="mt-5 pt-5 border-t border-slate-800">
                    {settingsBody(true)}
                </div>
            )}

            {!showSettings && !showKeys && (
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
