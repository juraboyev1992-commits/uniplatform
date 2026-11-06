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

// OYNA ICHIDAGI UMUMIY XOTIRA.
//
// `BroadcastChannel` xabarni O'ZI YUBORGAN oynaga qaytarmaydi. Shuning
// uchun bitta oynada ikkita taymer bo'lsa (yuqori qatordagi tugma va
// uning ichidagi panel) ular bir-birini eshitmas edi: biri yurib,
// ikkinchisi to'xtab turardi.
//
// Yechim: oyna ichida oddiy umumiy xotira. Har o'zgarish avval shu
// yerga yoziladi va shu oynadagi hamma taymerga xabar beriladi, keyin
// kanal orqali BOSHQA oynalarga uzatiladi.
let localState = null;
const subscribers = new Set();

// QAYSI SOZLAMA ALLAQACHON QABUL QILINGAN.
//
// Modul darajasida, ATAYLAB - `useRef` emas. Sabab nuqsonning o'zida:
// header ichidagi taymer ochilgan-yopilgan sayin QAYTA mount bo'ladi,
// jonli ekrandagi nusxa ham ko'rsatish almashsa mount bo'ladi. Har
// mountda yangi `useRef(null)` paydo bo'lardi, props-sync esa "men bu
// qiymatni hali qo'llamaganman" deb hisoblab, BAZADAN kelgan eski
// qiymatni umumiy xotira ustiga yozardi. Operator panelda signalni
// tanlagan bo'lsa ham, keyingi mountda inson ovozi qaytib kelardi -
// nuqson uch marta tuzatilib, har safar shu yo'l bilan qaytgan.
//
// Modul darajasida bo'lsa, oynada BIRINCHI nusxa urug' qo'yadi, keyin
// mount bo'lganlar esa tayyor holatni oladi. Ya'ni props - boshlang'ich
// URUG', doimiy haqiqat manbasi emas; tanlov qilingandan keyin umumiy
// xotira ustun turadi.
let seededSig = null;

const pushLocal = (next) => {
    localState = next;
    subscribers.forEach(fn => { try { fn(next); } catch { /* o'chgan komponent */ } });
};

export const useSharedTimer = ({
    mainSeconds = 60,
    submitSeconds = 10,
    warnAt = 10,
    soundMode = 'signal',
    signalSound = 'beep',
    voiceUzbek = false,
    voiceName = '',
    // VAKOLAT. Faqat HAQIQIY sozlamasi bor nusxa urug' qo'yadi.
    //
    // Header ichidagi taymer va alohida `/timer` oynasi hech qanday
    // sozlama olmaydi - ularda yuqoridagi qiymatlar tanlov emas, shunchaki
    // o'rin to'ldiruvchi. Ilgari ular ham urug' qo'yardi va natijada HAR
    // OYNA O'Z qiymatida qolardi: operator panelida "Signal" turardi,
    // karnay turgan jonli ekranda esa bazadan kelgan "voice". Zalda
    // inson ovozi eshitilar, panelda esa signal tanlangan ko'rinardi.
    seed = false,
} = {}) => {
    // Umumiy holat - ikkala oynada bir xil turadi.
    const [shared, setShared] = useState(() => localState || {
        phase: TIMER_PHASES.IDLE,
        endsAt: null,          // ms - shu paytda joriy bosqich tugaydi
        pausedLeft: null,      // pauzada qolgan soniya
        mainSeconds, submitSeconds, warnAt,
        // OVOZ - BITTA MAYDON, UCH QIYMAT: 'signal' | 'voice' | 'silent'.
        //
        // Ilgari ikkita mustaqil bayroq edi (`signalOn`, `voiceOn`) va
        // ular bir-biriga ZID holatga tushib qolardi: panelda signal
        // tanlangan ko'rinardi, zalda esa inson ovozi sanardi. Nuqson
        // uch marta tuzatilgan, har safar qaytgan - chunki qo'riqchi
        // qo'yish bilan ikkala bayroq rost bo'lgan holatning O'ZI
        // yo'qolmaydi, faqat bir yo'li yopiladi.
        //
        // Bitta maydonda esa bu holat IFODALANISHI MUMKIN EMAS: qiymat
        // yo 'signal', yo 'voice'. Shuning uchun bu yerda qo'riqchi
        // ham kerak emas.
        soundMode, signalSound, voiceUzbek, voiceName,
        // Har boshlashda o'zgaradi - yangi seansni eskisidan ajratadi,
        // shunda bitta signal ikki marta chalinmaydi.
        runId: 0,
    });

    const chanRef = useRef(null);
    const sharedRef = useRef(shared);
    sharedRef.current = shared;

    // Tashqaridan kelgan sozlama (boshqa musobaqa ochilsa) qabul qilinadi.
    //
    // AYNI QIYMAT QAYTA KELSA TEGILMAYDI. Jonli ekran musobaqani har 8
    // soniyada qayta o'qiydi va o'sha o'zgarmagan qiymatni qayta
    // uzatadi. Buni har safar qo'llasak, foydalanuvchining yangi
    // tanlovi bosib ketilardi - ayniqsa saqlash ruxsati bo'lmaganda,
    // chunki unda baza eski qiymatni qaytaraverardi.
    useEffect(() => {
        const incoming = {
            mainSeconds, submitSeconds, warnAt,
            soundMode, signalSound, voiceUzbek, voiceName,
        };
        if (!seed) return;
        const sig = JSON.stringify(incoming);
        if (seededSig === sig) return;
        seededSig = sig;
        const cur = sharedRef.current;
        if (cur.phase === TIMER_PHASES.IDLE) pushLocal({ ...cur, ...incoming });
    }, [seed, mainSeconds, submitSeconds, warnAt, soundMode, signalSound, voiceUzbek, voiceName]);

    const publish = useCallback((next) => {
        pushLocal(next);                       // shu oynadagi hamma taymer
        const ch = chanRef.current;
        if (ch) { try { ch.postMessage({ kind: 'state', state: next }); } catch { /* yopilgan */ } }
    }, []);

    // Shu oynadagi o'zgarishlarga obuna.
    useEffect(() => {
        const fn = (next) => setShared(next);
        subscribers.add(fn);
        if (localState) setShared(localState);
        return () => { subscribers.delete(fn); };
    }, []);

    useEffect(() => {
        const ch = makeChannel();
        chanRef.current = ch;
        if (!ch) return undefined;

        ch.onmessage = (e) => {
            const msg = e.data;
            if (!msg) return;
            if (msg.kind === 'state') {
                // Boshqa oynadan kelgan holat - shu oynadagi hammaga tarqatiladi.
                pushLocal(msg.state);
            } else if (msg.kind === 'whoHasState') {
                // Yangi ochilgan oyna so'rayapti - HAR DOIM javob beramiz.
                //
                // Ilgari javob faqat taymer YURIB TURGANDA berilardi. Oqibati:
                // bo'sh turganda yangi oyna o'z qiymatida qolar va ikki oyna
                // boshqa-boshqa sozlama bilan ishlardi - ovoz rejimi ham shu
                // yo'l bilan ajralib ketgan edi. Sozlama butun brauzerda bitta
                // bo'lishi kerak, taymer yurgan-yurmaganidan qat'i nazar.
                try {
                    ch.postMessage({ kind: 'state', state: sharedRef.current });
                } catch { /* yopilgan */ }
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
