import { useCallback, useEffect, useRef, useState } from 'react';

// IKKI OYNADA BITTA TAYMER.
//
// Operator jonli ekranni o'z ish maydonidan ochadi (`window.open`), ya'ni
// ikkala oyna BIR XIL brauzerda turadi. Shuning uchun ularni serverdan
// sinxronlash shart emas - brauzerning o'z kanali yetarli va u bir zumda
// ishlaydi. Server orqali qilinsa, hozirgi 8 soniyalik so'rov oralig'i
// taymer uchun juda sekin bo'lardi.
//
// SANOQ UZATILMAYDI, TUGASH PAYTI UZATILADI. Har oyna qolgan vaqtni
// o'zi soatdan hisoblaydi, shuning uchun ular millisekundgacha mos
// turadi va biri sekinlashsa ikkinchisi orqada qolmaydi.
//
// CHEKLOV: bu faqat BITTA brauzerdagi oynalar uchun. Jonli ekran boshqa
// kompyuterda ochilsa (masalan proyektor alohida mashinada), ular bir-
// birini ko'rmaydi - har biri o'z taymerini yuritadi. Bu holat uchun
// server orqali sinxronlash kerak bo'ladi, hozir u qurilmagan.

const CHANNEL = 'uniplatform:timer';

// Taymer bosqichlari:
//   idle   - yurmayapti
//   main   - asosiy o'ylash vaqti
//   submit - javoblarni topshirish vaqti (asosiydan keyin avtomatik)
//   done   - ikkalasi ham tugadi
export const TIMER_PHASES = { IDLE: 'idle', MAIN: 'main', SUBMIT: 'submit', DONE: 'done' };

const makeChannel = () => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
    try { return new window.BroadcastChannel(CHANNEL); } catch { return null; }
};

export const useSharedTimer = ({
    mainSeconds = 60,
    submitSeconds = 10,
    warnAt = 10,
} = {}) => {
    // Umumiy holat - ikkala oynada bir xil turadi.
    const [shared, setShared] = useState(() => ({
        phase: TIMER_PHASES.IDLE,
        endsAt: null,          // ms - shu paytda joriy bosqich tugaydi
        pausedLeft: null,      // pauzada qolgan soniya
        mainSeconds, submitSeconds, warnAt,
        // Har boshlashda o'zgaradi - ikki oyna bitta signalni ikki marta
        // chalmasligi uchun emas (har biri o'zi chaladi), balki yangi
        // seansni eskisidan ajratish uchun.
        runId: 0,
    }));

    const chanRef = useRef(null);
    const sharedRef = useRef(shared);
    sharedRef.current = shared;

    // Tashqaridan sozlama o'zgarsa (boshqa musobaqa ochilsa) qabul qilamiz,
    // lekin taymer yurib turgan bo'lsa tegmaymiz.
    useEffect(() => {
        setShared(s => (s.phase === TIMER_PHASES.IDLE
            ? { ...s, mainSeconds, submitSeconds, warnAt }
            : s));
    }, [mainSeconds, submitSeconds, warnAt]);

    const publish = useCallback((next) => {
        setShared(next);
        const ch = chanRef.current;
        if (ch) { try { ch.postMessage({ kind: 'state', state: next }); } catch { /* yopilgan */ } }
    }, []);

    useEffect(() => {
        const ch = makeChannel();
        chanRef.current = ch;
        if (!ch) return undefined;

        ch.onmessage = (e) => {
            const msg = e.data;
            if (!msg) return;
            if (msg.kind === 'state') {
                setShared(msg.state);
            } else if (msg.kind === 'whoHasState') {
                // Yangi ochilgan oyna so'rayapti - yurib turgan bo'lsa javob beramiz.
                const cur = sharedRef.current;
                if (cur.phase !== TIMER_PHASES.IDLE) {
                    try { ch.postMessage({ kind: 'state', state: cur }); } catch { /* yopilgan */ }
                }
            }
        };
        // Ochilganda joriy holatni so'raymiz - o'rtada qo'shilgan oyna
        // taymerni noldan emas, davomidan ko'rsatsin.
        try { ch.postMessage({ kind: 'whoHasState' }); } catch { /* yopilgan */ }

        return () => { try { ch.close(); } catch { /* allaqachon yopiq */ } };
    }, []);

    // --- Amallar ---------------------------------------------------------

    const startPhase = useCallback((phase, seconds, patch = {}) => {
        publish({
            ...sharedRef.current, ...patch,
            phase, endsAt: Date.now() + seconds * 1000, pausedLeft: null,
            runId: sharedRef.current.runId + 1,
        });
    }, [publish]);

    const start = useCallback(() => {
        const s = sharedRef.current;
        // Pauzadan davom: qolgan vaqtdan.
        if (s.pausedLeft != null && s.phase !== TIMER_PHASES.IDLE) {
            publish({ ...s, endsAt: Date.now() + s.pausedLeft * 1000, pausedLeft: null });
            return;
        }
        startPhase(TIMER_PHASES.MAIN, s.mainSeconds);
    }, [publish, startPhase]);

    const pause = useCallback(() => {
        const s = sharedRef.current;
        if (s.endsAt == null) return;
        publish({ ...s, pausedLeft: Math.max(0, (s.endsAt - Date.now()) / 1000), endsAt: null });
    }, [publish]);

    const reset = useCallback(() => {
        publish({
            ...sharedRef.current,
            phase: TIMER_PHASES.IDLE, endsAt: null, pausedLeft: null,
            runId: sharedRef.current.runId + 1,
        });
    }, [publish]);

    // Asosiy vaqt tugagach topshirish bosqichiga o'tish. Faqat BITTA oyna
    // o'tkazishi uchun - har ikkisi ham chaqirsa ham, ikkinchisi allaqachon
    // o'zgargan holatni ko'radi va qaytadan boshlamaydi.
    const goSubmitPhase = useCallback(() => {
        const s = sharedRef.current;
        if (s.phase !== TIMER_PHASES.MAIN) return;
        if (!s.submitSeconds || s.submitSeconds <= 0) {
            publish({ ...s, phase: TIMER_PHASES.DONE, endsAt: null, pausedLeft: null });
            return;
        }
        // Yangi bosqich SOATDAN emas, oldingi bosqich oxiridan hisoblanadi.
        // Sabab: ikkala oyna ham "vaqt tugadi" degan xulosaga deyarli bir
        // paytda keladi va ikkalasi ham shu funksiyani chaqiradi. `Date.now()`
        // ishlatilsa ular bir-biridan bir necha millisekund farq qiladigan
        // ikki xil holat e'lon qilardi va raqam sakrab ketardi. Oldingi
        // oxirdan hisoblansa ikkalasi AYNAN bir xil natija chiqaradi, ya'ni
        // kim oldin e'lon qilishi ahamiyatsiz.
        const base = s.endsAt || Date.now();
        publish({
            ...s, phase: TIMER_PHASES.SUBMIT,
            endsAt: base + s.submitSeconds * 1000, pausedLeft: null,
        });
    }, [publish]);

    const finish = useCallback(() => {
        const s = sharedRef.current;
        if (s.phase === TIMER_PHASES.DONE || s.phase === TIMER_PHASES.IDLE) return;
        publish({ ...s, phase: TIMER_PHASES.DONE, endsAt: null, pausedLeft: null });
    }, [publish]);

    const applySettings = useCallback((patch) => {
        publish({ ...sharedRef.current, ...patch });
    }, [publish]);

    return {
        shared,
        running: shared.endsAt != null,
        start, pause, reset, goSubmitPhase, finish, applySettings,
    };
};

export default useSharedTimer;
