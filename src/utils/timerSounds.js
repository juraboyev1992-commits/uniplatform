// TAYMER OVOZLARI.
//
// NEGA FAYL EMAS: ovoz fayllari yuklanishi kerak, zalda esa internet
// uzilishi mumkin va aynan o'sha paytda taymer jim qolardi. Brauzerning
// o'zi ovoz hosil qila oladi (Web Audio) - fayl ham, yuklanish ham,
// kutish ham yo'q. Qo'shimcha foyda: ovoz balandligi va uzunligi aniq
// boshqariladi, ya'ni zalda eshitiladigan qilib sozlash mumkin.
//
// BRAUZER QOIDASI: ovoz faqat odam biror narsani BOSGANDAN keyin
// chiqadi. Operator "Boshlash" tugmasini bosadi - shu kifoya, lekin
// audio kontekstini o'sha bosishda uyg'otish kerak (`unlock`), aks holda
// birinchi signal jim ketadi.

// Har ovoz: chastota (Hz), to'lqin shakli va uzunligi.
// `end` - vaqt tugagandagi signal, u har doim uzunroq va pastroq.
export const TIMER_SOUNDS = [
    {
        id: 'beep',
        label: 'Yumshoq signal',
        tick: { freq: 880, type: 'sine', ms: 110 },
        end: { freq: 440, type: 'sine', ms: 900 },
    },
    {
        id: 'sharp',
        label: 'Keskin signal',
        tick: { freq: 1200, type: 'square', ms: 70 },
        end: { freq: 600, type: 'square', ms: 800 },
    },
    {
        id: 'bell',
        label: "Qo'ng'iroq",
        tick: { freq: 1568, type: 'triangle', ms: 160 },
        end: { freq: 784, type: 'triangle', ms: 1200 },
    },
    {
        id: 'metronome',
        label: 'Metronom',
        tick: { freq: 300, type: 'square', ms: 45 },
        end: { freq: 180, type: 'square', ms: 700 },
    },
    {
        id: 'voice',
        label: 'Odam ovozi - raqam',
        // Signal o'rniga son aytiladi - pastdagi `speakNumber`.
        tick: null,
        end: { freq: 440, type: 'sine', ms: 900 },
        speaks: true,
    },
    {
        id: 'voice_uz',
        label: "Odam ovozi - o'zbekcha",
        tick: null,
        end: { freq: 440, type: 'sine', ms: 900 },
        speaks: true,
        uzbek: true,
    },
    {
        id: 'silent',
        label: 'Ovozsiz',
        tick: null,
        end: null,
    },
];

export const getTimerSound = (id) =>
    TIMER_SOUNDS.find(s => s.id === id) || TIMER_SOUNDS[0];

let ctx = null;

const audioContext = () => {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
    return ctx;
};

// Operator tugmani bosganda chaqiriladi. Brauzer audio kontekstni
// "to'xtatilgan" holatda yaratadi va uni faqat odam harakatidan keyin
// uyg'otishga ruxsat beradi.
export const unlockAudio = () => {
    const c = audioContext();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
};

// Bitta signal. Ovoz oxirida BIRDAN uzilmaydi - tez so'nadi, aks holda
// karnayda "chirt" etgan tovush qoladi.
const play = (spec, volume) => {
    if (!spec) return;
    const c = audioContext();
    if (!c || c.state !== 'running') return;
    try {
        const osc = c.createOscillator();
        const gain = c.createGain();
        const now = c.currentTime;
        const dur = spec.ms / 1000;

        osc.type = spec.type;
        osc.frequency.setValueAtTime(spec.freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.012);
        gain.gain.setValueAtTime(volume, now + Math.max(0.012, dur - 0.05));
        gain.gain.linearRampToValueAtTime(0, now + dur);

        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(now);
        osc.stop(now + dur + 0.02);
    } catch {
        // Ovoz chiqmasa taymer baribir ishlayveradi - bu halokat emas.
    }
};

export const playTick = (soundId, volume = 0.35) => play(getTimerSound(soundId).tick, volume);
export const playEnd = (soundId, volume = 0.5) => play(getTimerSound(soundId).end, volume);


// ---------------------------------------------------------------------------
// ODAM OVOZI - brauzerning o'z nutq sintezi (speechSynthesis).
//
// NEGA SON, NEGA SO'Z EMAS: brauzerlarda o'zbekcha ovoz deyarli yo'q.
// Agar "o'n", "to'qqiz" degan SO'ZLARNI boshqa tildagi ovozga bersak, u
// ularni buzib o'qiydi. RAQAM berilsa esa har ovoz uni o'z tilida to'g'ri
// aytadi - inglizcha ovoz "ten", ruscha ovoz o'z tilida. Operator
// ovozni ro'yxatdan tanlaydi.
//
// Ovoz ro'yxati brauzerda KECHIKIB yuklanadi, shuning uchun u har safar
// qaytadan so'raladi - bir marta eslab qolish bo'sh ro'yxat qoldirardi.
// ---------------------------------------------------------------------------

export const speechAvailable = () =>
    typeof window !== 'undefined' && 'speechSynthesis' in window;

export const listVoices = () => {
    if (!speechAvailable()) return [];
    try { return window.speechSynthesis.getVoices() || []; } catch { return []; }
};

// Sanoq tez ketadi (har soniyada bitta), shuning uchun oldingisi
// tugamagan bo'lsa to'xtatiladi - aks holda ovozlar ustma-ust tushib,
// raqamlar kechikib ketardi.
export const speakNumber = (n, voiceName = null, { rate = 1.25, uzbek = false } = {}) => {
    if (!speechAvailable()) return false;
    try {
        const synth = window.speechSynthesis;
        synth.cancel();
        // `uzbek` bo'lsa raqam emas, o'zbekcha SO'Z aytiladi.
        const u = new window.SpeechSynthesisUtterance(uzbek ? uzbekNumber(n) : String(n));
        u.rate = rate;
        if (voiceName) {
            const v = listVoices().find(x => x.name === voiceName);
            if (v) { u.voice = v; u.lang = v.lang; }
        }
        synth.speak(u);
        return true;
    } catch {
        return false;
    }
};

export const stopSpeech = () => {
    if (!speechAvailable()) return;
    try { window.speechSynthesis.cancel(); } catch { /* e'tiborsiz */ }
};


// ---------------------------------------------------------------------------
// O'ZBEKCHA SANOQ
//
// Brauzerlarda o'zbekcha ovoz YO'Q - bu tekshirilgan, taxmin emas.
// Shuning uchun ovozni yarata olmaymiz, lekin o'rnatilgan ovozga
// O'ZBEKCHA SO'ZNI berishimiz mumkin: u so'zni o'z qoidasi bo'yicha
// o'qiydi.
//
// Natija qaysi ovoz tanlanganiga bog'liq:
//   turkcha  - eng yaqin ("bir, ikki, uch, besh" turkchada deyarli
//              bir xil), zalda o'zbekcha eshitiladi;
//   ruscha   - qoniqarli;
//   inglizcha- yomon, so'zlarni buzib o'qiydi.
//
// APOSTROF ATAYLAB YO'Q. "to'rt" yoki "o'n" deb yozilsa, chet tilidagi
// ovoz apostrofda to'xtab, so'zni ikkiga bo'lib o'qiydi. "tort", "on"
// shaklida esa ravon chiqadi va o'zbekchaga yaqinroq eshitiladi.
// ---------------------------------------------------------------------------

const UZ_ONES = ['', 'bir', 'ikki', 'uch', 'tort', 'besh', 'olti', 'yetti', 'sakkiz', 'tokkiz'];
const UZ_TENS = ['', 'on', 'yigirma', 'ottiz', 'qirq', 'ellik', 'oltmish'];

export const uzbekNumber = (n) => {
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (v === 0) return 'nol';
    if (v < 10) return UZ_ONES[v];
    if (v <= 60) {
        const tens = Math.floor(v / 10);
        const ones = v % 10;
        const head = UZ_TENS[tens] || String(tens * 10);
        return ones ? `${head} ${UZ_ONES[ones]}` : head;
    }
    return String(v);
};
