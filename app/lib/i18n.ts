/**
 * Checkout UI translations.
 *
 * The language is chosen per request:
 *   1. `?lang=xx` query param (explicit override, e.g. from the brand site)
 *   2. `site_settings.default_language` for the resolved brand
 *   3. English
 *
 * Safe to import from both server and client components — plain data only.
 */

export type Lang = "en" | "fr" | "es" | "de" | "ar";

export const SUPPORTED_LANGS: Lang[] = ["en", "fr", "es", "de", "ar"];
const RTL_LANGS: Lang[] = ["ar"];

export function isRtl(lang: Lang): boolean {
    return RTL_LANGS.includes(lang);
}

export function resolveLang(
    siteDefault: string | null | undefined,
    queryLang: string | string[] | null | undefined
): Lang {
    const q = (Array.isArray(queryLang) ? queryLang[0] : queryLang || "").trim().toLowerCase();
    if ((SUPPORTED_LANGS as string[]).includes(q)) return q as Lang;
    const d = (siteDefault || "").trim().toLowerCase();
    if ((SUPPORTED_LANGS as string[]).includes(d)) return d as Lang;
    return "en";
}

export interface CheckoutDict {
    back: string;
    secureCheckout: string;
    steps: { personal: string; device: string; payment: string; processing: string; confirmation: string };

    step1Title: string;
    step1Subtitle: string;
    fullName: string;
    emailLabel: string;
    countryLabel: string;
    countryPlaceholder: string;
    phoneLabel: string;

    step2Title: string;
    step2Subtitle: string;
    deviceTypeLabel: string;
    devicePlaceholder: string;
    hasPlayerQuestion: string;
    hasPlayerYes: string;
    hasPlayerYesDesc: string;
    hasPlayerNo: string;
    hasPlayerNoDesc: string;

    step3Title: string;
    step3Subtitle: string;
    captchaPrompt: string;
    captchaDone: string;

    btnBack: string;
    btnContinue: string;
    btnComplete: string;
    btnProcessing: string;

    errRequired: string;
    errEmail: string;
    errPhone: string;
    errNameShort: string;
    errNameLong: string;
    errEmailLong: string;
    errSelectPlayer: string;
    errSelectPayment: string;
    errCaptcha: string;
    errPaymentFailed: string;
    errNoPaymentUrl: string;
    errUnexpected: string;

    orderSummary: string;
    /** "{name} Plan" — brand plan name slot. */
    planLine: string;
    connection: string;
    connections: string;
    subscription: string;
    setupFee: string;
    free: string;
    total: string;
    discount: string;
    /** Badge on a payment method that carries a discount, e.g. "Save $5". */
    save: string;

    couponPlaceholder: string;
    couponApply: string;
    couponChecking: string;
    couponInvalid: string;
    couponApplied: string;
    couponRemove: string;

    trustSsl: string;
    trustInstant: string;
    trustSupport: string;

    /** "© {year} {brand}. All rights reserved." */
    footerRights: string;
    planFallbackNotice: string;

    month1: string;
    /** "{n} Months" */
    monthsN: string;

    pmNames: Record<string, string>;
    pmDescs: Record<string, string>;
    pmBadges: Record<string, string>;
}

const en: CheckoutDict = {
    back: "Back",
    secureCheckout: "Secure Checkout",
    steps: { personal: "Personal Info", device: "Device Info", payment: "Payment", processing: "Processing", confirmation: "Confirmation" },

    step1Title: "Personal Information",
    step1Subtitle: "Please provide your contact details.",
    fullName: "Full Name",
    emailLabel: "Email Address",
    countryLabel: "Country",
    countryPlaceholder: "Select your country",
    phoneLabel: "Phone Number",

    step2Title: "Device Information",
    step2Subtitle: "Tell us about your streaming setup.",
    deviceTypeLabel: "Device Type",
    devicePlaceholder: "Select your device",
    hasPlayerQuestion: "Do you already have an IPTV Player?",
    hasPlayerYes: "Yes, I already have an IPTV Player",
    hasPlayerYesDesc: "I have my own app installed and ready to use",
    hasPlayerNo: "No, I want to use your IPTV Player",
    hasPlayerNoDesc: "Set me up with a recommended player app",

    step3Title: "Payment Method",
    step3Subtitle: "Choose your preferred payment option.",
    captchaPrompt: "Quick security check — verify to unlock payment options",
    captchaDone: "✓ Verification complete — choose a payment method below",

    btnBack: "← Back",
    btnContinue: "Continue →",
    btnComplete: "Complete Order",
    btnProcessing: "Processing...",

    errRequired: "Please fill in all required fields",
    errEmail: "Please enter a valid email address",
    errPhone: "Please enter a valid phone number",
    errNameShort: "Please enter your full name",
    errNameLong: "That name is too long",
    errEmailLong: "That email address is too long",
    errSelectPlayer: "Please select whether you have an IPTV player",
    errSelectPayment: "Please select a payment method",
    errCaptcha: "Please complete the security verification first",
    errPaymentFailed: "Failed to create payment",
    errNoPaymentUrl: "No payment URL received",
    errUnexpected: "An unexpected error occurred",

    orderSummary: "Order Summary",
    planLine: "{name} Plan",
    connection: "Connection",
    connections: "Connections",
    subscription: "Subscription",
    setupFee: "Setup Fee",
    free: "Free",
    total: "Total",
    discount: "Discount",
    save: "Save",

    couponPlaceholder: "Discount code",
    couponApply: "Apply",
    couponChecking: "Checking...",
    couponInvalid: "Invalid or expired code",
    couponApplied: "Discount applied",
    couponRemove: "Remove",

    trustSsl: "256-bit SSL",
    trustInstant: "Instant Activation",
    trustSupport: "24/7 Support",

    footerRights: "© {year} {brand}. All rights reserved.",
    planFallbackNotice: "The requested plan is unavailable — showing our default plan instead.",

    month1: "1 Month",
    monthsN: "{n} Months",

    pmNames: {
        paypal: "PayPal",
        crypto: "Cryptocurrency",
        card: "Credit / Debit Card",
        "card-crypto": "Card via Crypto",
    },
    pmDescs: {
        paypal: "Pay securely with your PayPal account",
        crypto: "Bitcoin, Ethereum, USDT and more",
        card: "Pay with your bank card",
        "card-crypto": "Pay with card through a crypto payment processor",
    },
    pmBadges: {
        "card-crypto": "Different from above",
    },
};

const fr: CheckoutDict = {
    back: "Retour",
    secureCheckout: "Paiement sécurisé",
    steps: { personal: "Informations", device: "Appareil", payment: "Paiement", processing: "Traitement", confirmation: "Confirmation" },

    step1Title: "Informations personnelles",
    step1Subtitle: "Veuillez fournir vos coordonnées.",
    fullName: "Nom complet",
    emailLabel: "Adresse e-mail",
    countryLabel: "Pays",
    countryPlaceholder: "Sélectionnez votre pays",
    phoneLabel: "Numéro de téléphone",

    step2Title: "Informations sur l'appareil",
    step2Subtitle: "Parlez-nous de votre installation.",
    deviceTypeLabel: "Type d'appareil",
    devicePlaceholder: "Sélectionnez votre appareil",
    hasPlayerQuestion: "Avez-vous déjà un lecteur IPTV ?",
    hasPlayerYes: "Oui, j'ai déjà un lecteur IPTV",
    hasPlayerYesDesc: "J'ai ma propre application installée et prête à l'emploi",
    hasPlayerNo: "Non, je veux utiliser votre lecteur IPTV",
    hasPlayerNoDesc: "Proposez-moi une application recommandée",

    step3Title: "Mode de paiement",
    step3Subtitle: "Choisissez votre mode de paiement préféré.",
    captchaPrompt: "Vérification rapide — validez pour débloquer les options de paiement",
    captchaDone: "✓ Vérification terminée — choisissez un mode de paiement ci-dessous",

    btnBack: "← Retour",
    btnContinue: "Continuer →",
    btnComplete: "Finaliser la commande",
    btnProcessing: "Traitement...",

    errRequired: "Veuillez remplir tous les champs obligatoires",
    errEmail: "Veuillez saisir une adresse e-mail valide",
    errPhone: "Veuillez saisir un numéro de téléphone valide",
    errNameShort: "Veuillez saisir votre nom complet",
    errNameLong: "Ce nom est trop long",
    errEmailLong: "Cette adresse e-mail est trop longue",
    errSelectPlayer: "Veuillez indiquer si vous avez un lecteur IPTV",
    errSelectPayment: "Veuillez choisir un mode de paiement",
    errCaptcha: "Veuillez d'abord compléter la vérification de sécurité",
    errPaymentFailed: "Échec de la création du paiement",
    errNoPaymentUrl: "Aucune URL de paiement reçue",
    errUnexpected: "Une erreur inattendue s'est produite",

    orderSummary: "Récapitulatif",
    planLine: "Formule {name}",
    connection: "Connexion",
    connections: "Connexions",
    subscription: "Abonnement",
    setupFee: "Frais d'activation",
    free: "Gratuit",
    total: "Total",
    discount: "Remise",
    save: "Économisez",

    couponPlaceholder: "Code promo",
    couponApply: "Appliquer",
    couponChecking: "Vérification...",
    couponInvalid: "Code invalide ou expiré",
    couponApplied: "Remise appliquée",
    couponRemove: "Retirer",

    trustSsl: "SSL 256 bits",
    trustInstant: "Activation immédiate",
    trustSupport: "Support 24h/24",

    footerRights: "© {year} {brand}. Tous droits réservés.",
    planFallbackNotice: "La formule demandée n'est pas disponible — formule par défaut affichée.",

    month1: "1 mois",
    monthsN: "{n} mois",

    pmNames: {
        paypal: "PayPal",
        crypto: "Cryptomonnaie",
        card: "Carte de crédit / débit",
        "card-crypto": "Carte via crypto",
    },
    pmDescs: {
        paypal: "Payez en toute sécurité avec votre compte PayPal",
        crypto: "Bitcoin, Ethereum, USDT et plus",
        card: "Payez avec votre carte bancaire",
        "card-crypto": "Payez par carte via un processeur de paiement crypto",
    },
    pmBadges: {
        "card-crypto": "Différent de l'option ci-dessus",
    },
};

const es: CheckoutDict = {
    back: "Volver",
    secureCheckout: "Pago seguro",
    steps: { personal: "Datos personales", device: "Dispositivo", payment: "Pago", processing: "Procesando", confirmation: "Confirmación" },

    step1Title: "Información personal",
    step1Subtitle: "Por favor, proporcione sus datos de contacto.",
    fullName: "Nombre completo",
    emailLabel: "Correo electrónico",
    countryLabel: "País",
    countryPlaceholder: "Seleccione su país",
    phoneLabel: "Número de teléfono",

    step2Title: "Información del dispositivo",
    step2Subtitle: "Cuéntenos sobre su equipo de streaming.",
    deviceTypeLabel: "Tipo de dispositivo",
    devicePlaceholder: "Seleccione su dispositivo",
    hasPlayerQuestion: "¿Ya tiene un reproductor IPTV?",
    hasPlayerYes: "Sí, ya tengo un reproductor IPTV",
    hasPlayerYesDesc: "Tengo mi propia aplicación instalada y lista para usar",
    hasPlayerNo: "No, quiero usar su reproductor IPTV",
    hasPlayerNoDesc: "Configúrenme una aplicación recomendada",

    step3Title: "Método de pago",
    step3Subtitle: "Elija su opción de pago preferida.",
    captchaPrompt: "Verificación rápida — complete para desbloquear las opciones de pago",
    captchaDone: "✓ Verificación completada — elija un método de pago abajo",

    btnBack: "← Volver",
    btnContinue: "Continuar →",
    btnComplete: "Completar pedido",
    btnProcessing: "Procesando...",

    errRequired: "Complete todos los campos obligatorios",
    errEmail: "Introduzca un correo electrónico válido",
    errPhone: "Introduzca un número de teléfono válido",
    errNameShort: "Introduce tu nombre completo",
    errNameLong: "Ese nombre es demasiado largo",
    errEmailLong: "Ese correo es demasiado largo",
    errSelectPlayer: "Indique si tiene un reproductor IPTV",
    errSelectPayment: "Seleccione un método de pago",
    errCaptcha: "Complete primero la verificación de seguridad",
    errPaymentFailed: "Error al crear el pago",
    errNoPaymentUrl: "No se recibió la URL de pago",
    errUnexpected: "Ocurrió un error inesperado",

    orderSummary: "Resumen del pedido",
    planLine: "Plan {name}",
    connection: "Conexión",
    connections: "Conexiones",
    subscription: "Suscripción",
    setupFee: "Cuota de activación",
    free: "Gratis",
    total: "Total",
    discount: "Descuento",
    save: "Ahorra",

    couponPlaceholder: "Código de descuento",
    couponApply: "Aplicar",
    couponChecking: "Comprobando...",
    couponInvalid: "Código inválido o caducado",
    couponApplied: "Descuento aplicado",
    couponRemove: "Quitar",

    trustSsl: "SSL de 256 bits",
    trustInstant: "Activación instantánea",
    trustSupport: "Soporte 24/7",

    footerRights: "© {year} {brand}. Todos los derechos reservados.",
    planFallbackNotice: "El plan solicitado no está disponible — se muestra el plan predeterminado.",

    month1: "1 mes",
    monthsN: "{n} meses",

    pmNames: {
        paypal: "PayPal",
        crypto: "Criptomonedas",
        card: "Tarjeta de crédito / débito",
        "card-crypto": "Tarjeta vía cripto",
    },
    pmDescs: {
        paypal: "Pague de forma segura con su cuenta PayPal",
        crypto: "Bitcoin, Ethereum, USDT y más",
        card: "Pague con su tarjeta bancaria",
        "card-crypto": "Pague con tarjeta a través de un procesador cripto",
    },
    pmBadges: {
        "card-crypto": "Diferente a la opción anterior",
    },
};

const de: CheckoutDict = {
    back: "Zurück",
    secureCheckout: "Sichere Zahlung",
    steps: { personal: "Persönliche Daten", device: "Gerät", payment: "Zahlung", processing: "Verarbeitung", confirmation: "Bestätigung" },

    step1Title: "Persönliche Angaben",
    step1Subtitle: "Bitte geben Sie Ihre Kontaktdaten an.",
    fullName: "Vollständiger Name",
    emailLabel: "E-Mail-Adresse",
    countryLabel: "Land",
    countryPlaceholder: "Land auswählen",
    phoneLabel: "Telefonnummer",

    step2Title: "Geräteinformationen",
    step2Subtitle: "Erzählen Sie uns von Ihrem Streaming-Setup.",
    deviceTypeLabel: "Gerätetyp",
    devicePlaceholder: "Gerät auswählen",
    hasPlayerQuestion: "Haben Sie bereits einen IPTV-Player?",
    hasPlayerYes: "Ja, ich habe bereits einen IPTV-Player",
    hasPlayerYesDesc: "Meine eigene App ist installiert und einsatzbereit",
    hasPlayerNo: "Nein, ich möchte Ihren IPTV-Player nutzen",
    hasPlayerNoDesc: "Richten Sie mir eine empfohlene Player-App ein",

    step3Title: "Zahlungsmethode",
    step3Subtitle: "Wählen Sie Ihre bevorzugte Zahlungsart.",
    captchaPrompt: "Kurze Sicherheitsprüfung — bestätigen Sie, um die Zahlungsoptionen freizuschalten",
    captchaDone: "✓ Verifizierung abgeschlossen — wählen Sie unten eine Zahlungsmethode",

    btnBack: "← Zurück",
    btnContinue: "Weiter →",
    btnComplete: "Bestellung abschließen",
    btnProcessing: "Wird verarbeitet...",

    errRequired: "Bitte füllen Sie alle Pflichtfelder aus",
    errEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein",
    errPhone: "Bitte geben Sie eine gültige Telefonnummer ein",
    errNameShort: "Bitte geben Sie Ihren vollständigen Namen ein",
    errNameLong: "Dieser Name ist zu lang",
    errEmailLong: "Diese E-Mail-Adresse ist zu lang",
    errSelectPlayer: "Bitte geben Sie an, ob Sie einen IPTV-Player haben",
    errSelectPayment: "Bitte wählen Sie eine Zahlungsmethode",
    errCaptcha: "Bitte schließen Sie zuerst die Sicherheitsprüfung ab",
    errPaymentFailed: "Zahlung konnte nicht erstellt werden",
    errNoPaymentUrl: "Keine Zahlungs-URL erhalten",
    errUnexpected: "Ein unerwarteter Fehler ist aufgetreten",

    orderSummary: "Bestellübersicht",
    planLine: "{name}-Paket",
    connection: "Verbindung",
    connections: "Verbindungen",
    subscription: "Abonnement",
    setupFee: "Einrichtungsgebühr",
    free: "Kostenlos",
    total: "Gesamt",
    discount: "Rabatt",
    save: "Spare",

    couponPlaceholder: "Rabattcode",
    couponApply: "Einlösen",
    couponChecking: "Prüfung...",
    couponInvalid: "Ungültiger oder abgelaufener Code",
    couponApplied: "Rabatt angewendet",
    couponRemove: "Entfernen",

    trustSsl: "256-Bit-SSL",
    trustInstant: "Sofortige Aktivierung",
    trustSupport: "24/7-Support",

    footerRights: "© {year} {brand}. Alle Rechte vorbehalten.",
    planFallbackNotice: "Das angeforderte Paket ist nicht verfügbar — Standardpaket wird angezeigt.",

    month1: "1 Monat",
    monthsN: "{n} Monate",

    pmNames: {
        paypal: "PayPal",
        crypto: "Kryptowährung",
        card: "Kredit- / Debitkarte",
        "card-crypto": "Karte via Krypto",
    },
    pmDescs: {
        paypal: "Zahlen Sie sicher mit Ihrem PayPal-Konto",
        crypto: "Bitcoin, Ethereum, USDT und mehr",
        card: "Zahlen Sie mit Ihrer Bankkarte",
        "card-crypto": "Kartenzahlung über einen Krypto-Zahlungsdienst",
    },
    pmBadges: {
        "card-crypto": "Anders als oben",
    },
};

const ar: CheckoutDict = {
    back: "رجوع",
    secureCheckout: "دفع آمن",
    steps: { personal: "المعلومات الشخصية", device: "معلومات الجهاز", payment: "الدفع", processing: "المعالجة", confirmation: "التأكيد" },

    step1Title: "المعلومات الشخصية",
    step1Subtitle: "يرجى إدخال بيانات التواصل الخاصة بك.",
    fullName: "الاسم الكامل",
    emailLabel: "البريد الإلكتروني",
    countryLabel: "الدولة",
    countryPlaceholder: "اختر دولتك",
    phoneLabel: "رقم الهاتف",

    step2Title: "معلومات الجهاز",
    step2Subtitle: "أخبرنا عن جهاز المشاهدة الخاص بك.",
    deviceTypeLabel: "نوع الجهاز",
    devicePlaceholder: "اختر جهازك",
    hasPlayerQuestion: "هل لديك تطبيق IPTV بالفعل؟",
    hasPlayerYes: "نعم، لدي تطبيق IPTV بالفعل",
    hasPlayerYesDesc: "لدي تطبيقي الخاص مثبت وجاهز للاستخدام",
    hasPlayerNo: "لا، أريد استخدام التطبيق الخاص بكم",
    hasPlayerNoDesc: "جهزوني بتطبيق مُوصى به",

    step3Title: "طريقة الدفع",
    step3Subtitle: "اختر طريقة الدفع المفضلة لديك.",
    captchaPrompt: "تحقق أمني سريع — أكمل التحقق لفتح خيارات الدفع",
    captchaDone: "✓ اكتمل التحقق — اختر طريقة الدفع أدناه",

    btnBack: "رجوع",
    btnContinue: "متابعة",
    btnComplete: "إتمام الطلب",
    btnProcessing: "جارٍ المعالجة...",

    errRequired: "يرجى تعبئة جميع الحقول المطلوبة",
    errEmail: "يرجى إدخال بريد إلكتروني صحيح",
    errPhone: "يرجى إدخال رقم هاتف صحيح",
    errNameShort: "الرجاء إدخال اسمك الكامل",
    errNameLong: "هذا الاسم طويل جداً",
    errEmailLong: "هذا البريد طويل جداً",
    errSelectPlayer: "يرجى تحديد ما إذا كان لديك تطبيق IPTV",
    errSelectPayment: "يرجى اختيار طريقة الدفع",
    errCaptcha: "يرجى إكمال التحقق الأمني أولاً",
    errPaymentFailed: "فشل إنشاء عملية الدفع",
    errNoPaymentUrl: "لم يتم استلام رابط الدفع",
    errUnexpected: "حدث خطأ غير متوقع",

    orderSummary: "ملخص الطلب",
    planLine: "خطة {name}",
    connection: "اتصال",
    connections: "اتصالات",
    subscription: "الاشتراك",
    setupFee: "رسوم التفعيل",
    free: "مجاناً",
    total: "الإجمالي",
    discount: "الخصم",
    save: "وفّر",

    couponPlaceholder: "كود الخصم",
    couponApply: "تطبيق",
    couponChecking: "جارٍ التحقق...",
    couponInvalid: "كود غير صالح أو منتهي",
    couponApplied: "تم تطبيق الخصم",
    couponRemove: "إزالة",

    trustSsl: "تشفير SSL 256-bit",
    trustInstant: "تفعيل فوري",
    trustSupport: "دعم 24/7",

    footerRights: "© {year} {brand}. جميع الحقوق محفوظة.",
    planFallbackNotice: "الخطة المطلوبة غير متوفرة — تم عرض الخطة الافتراضية بدلاً منها.",

    month1: "شهر واحد",
    monthsN: "{n} أشهر",

    pmNames: {
        paypal: "PayPal",
        crypto: "عملات رقمية",
        card: "بطاقة ائتمان / خصم",
        "card-crypto": "بطاقة عبر معالج كريبتو",
    },
    pmDescs: {
        paypal: "ادفع بأمان عبر حساب PayPal الخاص بك",
        crypto: "بيتكوين، إيثيريوم، USDT والمزيد",
        card: "ادفع ببطاقتك البنكية",
        "card-crypto": "ادفع بالبطاقة عبر معالج دفع بالعملات الرقمية",
    },
    pmBadges: {
        "card-crypto": "مختلف عن الخيار أعلاه",
    },
};

const DICTS: Record<Lang, CheckoutDict> = { en, fr, es, de, ar };

export function getDict(lang: Lang): CheckoutDict {
    return DICTS[lang] ?? en;
}

/** Localized "{n} Months" label. Falls back to the raw duration string when months is unknown. */
export function durationLabel(months: number | undefined, fallback: string, t: CheckoutDict): string {
    if (!months || months < 1) return fallback;
    return months === 1 ? t.month1 : t.monthsN.replace("{n}", String(months));
}
