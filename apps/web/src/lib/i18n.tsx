import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type Lang = "en" | "ar";

const copy = {
  en: {
    brand: "Vodafone Charge",
    welcome: "Welcome",
    signInTitle: "Sign in to Charge",
    signInSub: "Staff access for the HQ bays",
    username: "Username",
    password: "Password",
    signIn: "Sign in",
    forgot: "Forgot password?",
    about: "About",
    adminConsole: "Admin console",
    hidePassword: "Hide password",
    showPassword: "Show password",
    hq: "HQ Garage · Level −1",
    operational: "Operational",
    free: "Free",
    busy: "Busy",
    closed: "Closed",
    charging: "Charging",
    booked: "Booked",
    available: "Available",
    garage: "Garage",
    bays: "Bays",
    yourReservation: "Your reservation",
    yourSession: "Your charging session",
    minLeft: "min left",
    edit: "Edit",
    cancel: "Cancel",
    endSession: "End session",
    tapGreen: "Tap a bay to reserve or join the waitlist.",
    slot: "Bay",
    connector: "Connector",
    status: "Status",
    sensorLed: "Sensor LED",
    estimate: "Estimate",
    duration: "Duration",
    start: "Start",
    fastOnly: "Fast bays are 30 min only",
    reserve: "Reserve",
    alreadyBooked: "Already booked",
    notAvailable: "Not available",
    editReservation: "Edit reservation",
    moveBooking: "Move my booking here",
    close: "Close",
    reopen: "Mark available",
    closeMaint: "Close for maintenance",
    min: "min",
    fast: "Fast",
    slow: "Slow",
    where: "Where it sits in the garage",
    staff: "Staff",
    reports: "Reports",
    floor: "Floor",
    add: "Add",
    save: "Save",
    back: "Back",
    saveChanges: "Save changes",
    cancelBooking: "Cancel booking",
    keep: "Keep it",
    cancelTitle: "Cancel reservation",
    admin: "Admin",
    bayOverride: "Bay override",
    open: "Open",
    reminder: "Reminder",
    notification: "Notification",
    remindDetail: "5 min before reservation",
    notifyDetail: "5 min before charge ends",
    today: "Today",
    reportTitle: "HQ garage report",
    sessions: "Sessions",
    energy: "Energy",
    avgSession: "Avg session",
    utilisation: "Utilisation",
    savePdf: "Save PDF",
    signOut: "Sign out",
    forgotTitle: "Forgot password",
    forgotBody: "Staff passwords are reset by garage admin — not by email. Enter your username and they will set a new one.",
    requestReset: "Request reset",
    aboutBody:
      "Internal app for the HQ garage. Five employee bays, live occupancy from the pillar LED, and timed sessions — 30 minutes on DC fast, 60 minutes on AC.",
    facilities: "Facilities · Level −1 · 24/7 with security",
    editEmployee: "Edit employee",
    addEmployee: "Add employee",
    name: "Name",
    phone: "Phone",
    department: "Department",
    role: "Role",
    employee: "Employee",
    tempPassword: "Temporary password",
    youAreHere: "This bay",
    ledOff: "Off",
    ledGreen: "Green — free",
    ledRed: "Red — taken",
    reservedStarts: "Your reservation starts in 5 minutes",
    chargeEnds: "Your charging session ends in 5 minutes",
    nothingBooked: "Nothing booked",
    lang: "English",
    locHint: "Position in the garage",
    waiting: "waiting",
    waitlist: "Waitlist",
    joinWaitlist: "Join waitlist",
    upNext: "Up next",
    you: "You",
    evLine: "EV Charging · HQ Garage",
    nowOn: "Now",
    nextFree: "Next free",
    bayStatus: "Bay status",
    currentUser: "Current user",
    queueNow: "Charging now",
    queueNext: "Next",
    queueThen: "Waiting",
    inQueue: "in queue",
    waitingAfter: "waiting after",
    tapBay: "Tap a bay to reserve or join the waitlist.",
    ledAmber: "Amber — booked",
    noneHere: "Empty",
    all: "All",
  },
  ar: {
    brand: "فودافون تشارج",
    welcome: "مرحباً",
    signInTitle: "تسجيل الدخول إلى تشارج",
    signInSub: "دخول الموظفين لمواقف الشحن في المقر",
    username: "اسم المستخدم",
    password: "كلمة المرور",
    signIn: "دخول",
    forgot: "نسيت كلمة المرور؟",
    about: "حول",
    adminConsole: "لوحة المسؤول",
    hidePassword: "إخفاء كلمة المرور",
    showPassword: "إظهار كلمة المرور",
    hq: "جراج المقر · الدور −1",
    operational: "يعمل",
    free: "شاغر",
    busy: "مشغول",
    closed: "مغلق",
    charging: "يشحن",
    booked: "محجوز",
    available: "متاح",
    garage: "الجراج",
    bays: "المواقف",
    yourReservation: "حجزك",
    yourSession: "جلسة الشحن",
    minLeft: "دقيقة متبقية",
    edit: "تعديل",
    cancel: "إلغاء",
    endSession: "إنهاء الجلسة",
    tapGreen: "اضغط موقفاً للحجز أو للانضمام للقائمة.",
    slot: "موقف",
    connector: "الفيش",
    status: "الحالة",
    sensorLed: "لمبة المستشعر",
    estimate: "التقدير",
    duration: "المدة",
    start: "البداية",
    fastOnly: "الشحن السريع ٣٠ دقيقة فقط",
    reserve: "حجز",
    alreadyBooked: "لديك حجز",
    notAvailable: "غير متاح",
    editReservation: "تعديل الحجز",
    moveBooking: "انقل حجزي إلى هنا",
    close: "إغلاق",
    reopen: "إعادة فتح",
    closeMaint: "إغلاق للصيانة",
    min: "د",
    fast: "سريع",
    slow: "عادي",
    where: "مكانه في الجراج",
    staff: "الموظفون",
    reports: "التقارير",
    floor: "المواقف",
    add: "إضافة",
    save: "حفظ",
    back: "رجوع",
    saveChanges: "حفظ التعديل",
    cancelBooking: "إلغاء الحجز",
    keep: "إبقاء",
    cancelTitle: "إلغاء الحجز",
    admin: "المسؤول",
    bayOverride: "تجاوز الموقف",
    open: "فتح",
    reminder: "تذكير",
    notification: "إشعار",
    remindDetail: "قبل الحجز بـ ٥ دقائق",
    notifyDetail: "قبل انتهاء الشحن بـ ٥ دقائق",
    today: "اليوم",
    reportTitle: "تقرير جراج المقر",
    sessions: "جلسات",
    energy: "طاقة",
    avgSession: "متوسط الجلسة",
    utilisation: "الإشغال",
    savePdf: "حفظ PDF",
    signOut: "خروج",
    forgotTitle: "نسيت كلمة المرور",
    forgotBody: "يعيد مسؤول الجراج تعيين كلمة المرور. أدخل اسم المستخدم.",
    requestReset: "طلب إعادة التعيين",
    aboutBody:
      "تطبيق داخلي لجراج المقر. خمسة مواقف للموظفين، إشغال مباشر من لمبة العمود، وجلسات ٣٠ دقيقة للشحن السريع و٦٠ للعادي.",
    facilities: "المرافق · الدور −١ · على مدار الساعة",
    editEmployee: "تعديل موظف",
    addEmployee: "إضافة موظف",
    name: "الاسم",
    phone: "الهاتف",
    department: "القسم",
    role: "الدور",
    employee: "موظف",
    tempPassword: "كلمة مرور مؤقتة",
    youAreHere: "هذا الموقف",
    ledOff: "مطفأة",
    ledGreen: "خضراء — شاغر",
    ledRed: "حمراء — مشغول",
    reservedStarts: "حجزك يبدأ خلال ٥ دقائق",
    chargeEnds: "جلسة الشحن تنتهي خلال ٥ دقائق",
    nothingBooked: "لا يوجد حجز",
    lang: "العربية",
    locHint: "الموقع في الجراج",
    waiting: "انتظار",
    waitlist: "قائمة الانتظار",
    joinWaitlist: "انضم للقائمة",
    upNext: "التالي",
    you: "أنت",
    evLine: "شحن كهربائي · جراج المقر",
    nowOn: "الآن",
    nextFree: "أول وقت شاغر",
    bayStatus: "حالة الموقف",
    currentUser: "المستخدم الحالي",
    queueNow: "يشحن الآن",
    queueNext: "التالي",
    queueThen: "انتظار",
    inQueue: "في الانتظار",
    waitingAfter: "ينتظرون بعده",
    tapBay: "اضغط موقفاً للحجز أو للانضمام للقائمة.",
    ledAmber: "عنبري — محجوز",
    noneHere: "شاغر",
    all: "الكل",
  },
} as const;

export type CopyKey = keyof typeof copy.en;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: CopyKey) => string;
  dir: "ltr" | "rtl";
  theme: "light" | "dark";
  toggleTheme: () => void;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (k) => copy[lang][k],
      dir: lang === "ar" ? "rtl" : "ltr",
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
    }),
    [lang, theme],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("i18n");
  return ctx;
}

export function LangToggle({ variant = "segment" }: { variant?: "segment" | "pill" }) {
  const { lang, setLang } = useI18n();
  if (variant === "pill") {
    return (
      <button
        type="button"
        className="lang-pill"
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        aria-label="Language"
      >
        {lang === "en" ? "EN" : "ع"}
        <ChevronDown className="size-3.5" strokeWidth={2.4} />
      </button>
    );
  }
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button type="button" className={lang === "en" ? "is-on" : ""} onClick={() => setLang("en")}>
        EN
      </button>
      <button type="button" className={lang === "ar" ? "is-on" : ""} onClick={() => setLang("ar")}>
        ع
      </button>
    </div>
  );
}
