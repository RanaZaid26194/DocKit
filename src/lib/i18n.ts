// Small hand-rolled dictionary. English is the source of truth; other
// languages fall back to English for any missing key. Languages chosen from
// HUD's highest-need Limited English Proficiency populations (English,
// Spanish, Simplified Chinese, Vietnamese, Haitian Creole, Tagalog, Somali,
// Arabic). Native strings only cover the renter-facing flow; extend as
// needed.
import { createContext, useContext } from "react";

export type Lang = "en" | "es" | "zh" | "vi" | "ht" | "tl" | "so" | "ar";

export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  es: "Español",
  zh: "简体中文",
  vi: "Tiếng Việt",
  ht: "Kreyòl Ayisyen",
  tl: "Tagalog",
  so: "Soomaali",
  ar: "العربية",
};

export const RTL_LANGS: Lang[] = ["ar"];

const EN = {
  "intro.title": "Get your housing paperwork ready",
  "intro.body":
    "This is a checklist that helps you gather the right documents. We do not decide if you qualify; a real person will review everything you send.",
  "intro.privacy":
    "Your photos are checked on this phone before anything is sent. You can start over at any time.",
  "intro.start": "Get started",
  "intro.resume": "Continue where you left off",
  "intro.language": "Language",
  "applicant.title": "Who is applying?",
  "applicant.name": "Full name",
  "applicant.phone": "Phone number (optional)",
  "applicant.email": "Email (optional)",
  "applicant.coApplicant": "Add another person on this application",
  "applicant.remove": "Remove",
  "applicant.continue": "Continue to documents",
  "checklist.title": "Your documents",
  "checklist.for": "For",
  "checklist.upload": "Take a photo or upload",
  "checklist.retake": "Retake",
  "checklist.pass": "Looks good",
  "checklist.flagged": "May have been edited",
  "checklist.fixing": "Needs fixing",
  "checklist.checking": "Checking your photo",
  "checklist.acknowledge": "I know, this photo is fine",
  "checklist.finish": "Finish and send",
  "checklist.startOver": "Start over",
  "checklist.printable": "Show printable checklist",
  "checklist.download": "Download my packet (PDF)",
  "checklist.tamperCopy":
    "This photo may have been edited. If that's unexpected, try retaking it directly with your camera. It has not been rejected; a reviewer will take a look.",
  "startOver.title": "Start over from the beginning?",
  "startOver.body":
    "Everything you have uploaded will be permanently deleted from our servers. This cannot be undone.",
  "startOver.confirm": "Yes, delete everything and restart",
  "startOver.cancel": "Cancel",
  "done.title": "Your packet has been sent",
  "done.body":
    "A reviewer at the housing office will look at your documents and follow up with you. Keep the download link somewhere safe for your records.",
  "closed.startNew": "Start a new application",
  "footer.notLegal":
    "This tool checks that your paperwork is complete and current. It does not decide who qualifies for housing; a person at the housing office does.",
} as const;

export type DictKey = keyof typeof EN;

// Only the strings that meaningfully change per locale are hand-translated;
// missing keys fall back to English so the UI never shows raw keys.
type PartialDict = Partial<Record<DictKey, string>>;

const ES: Partial = {
  "intro.title": "Prepare sus documentos de vivienda",
  "intro.body":
    "Esta es una lista que le ayuda a reunir los documentos correctos. No decidimos si usted califica; una persona real revisará todo lo que envíe.",
  "intro.privacy": "Sus fotos se revisan en este teléfono antes de enviar cualquier cosa. Puede empezar de nuevo cuando quiera.",
  "intro.start": "Empezar",
  "intro.resume": "Continuar donde lo dejó",
  "intro.language": "Idioma",
  "applicant.title": "¿Quién está aplicando?",
  "applicant.name": "Nombre completo",
  "applicant.phone": "Número de teléfono (opcional)",
  "applicant.email": "Correo electrónico (opcional)",
  "applicant.coApplicant": "Agregar otra persona a esta solicitud",
  "applicant.remove": "Quitar",
  "applicant.continue": "Continuar a los documentos",
  "checklist.title": "Sus documentos",
  "checklist.for": "Para",
  "checklist.pass": "Se ve bien",
  "checklist.flagged": "Puede haber sido editada",
  "checklist.fixing": "Necesita arreglo",
  "checklist.checking": "Revisando su foto",
  "checklist.acknowledge": "Lo sé, esta foto está bien",
  "checklist.finish": "Terminar y enviar",
  "checklist.startOver": "Empezar de nuevo",
  "checklist.printable": "Ver lista para imprimir",
  "checklist.download": "Descargar mi paquete (PDF)",
  "checklist.tamperCopy":
    "Esta foto puede haber sido editada. Si eso no era su intención, intente tomarla de nuevo directamente con su cámara. No ha sido rechazada; un revisor la mirará.",
  "startOver.title": "¿Empezar de nuevo desde el principio?",
  "startOver.body": "Todo lo que ha subido se eliminará permanentemente de nuestros servidores. Esto no se puede deshacer.",
  "startOver.confirm": "Sí, borrar todo y reiniciar",
  "startOver.cancel": "Cancelar",
  "done.title": "Su paquete ha sido enviado",
  "done.body": "Un revisor de la oficina de vivienda mirará sus documentos y se comunicará con usted.",
  "closed.startNew": "Iniciar una nueva solicitud",
  "footer.notLegal":
    "Esta herramienta revisa que sus documentos estén completos y vigentes. No decide quién califica para vivienda; una persona en la oficina de vivienda lo hace.",
};

const ZH: Partial = {
  "intro.title": "准备您的住房申请材料",
  "intro.body": "这是一份帮助您收集正确文件的清单。我们不决定您是否符合资格;将由真人审核您提交的所有内容。",
  "intro.privacy": "您的照片在发送前会在本手机上检查。您可以随时重新开始。",
  "intro.start": "开始",
  "intro.resume": "继续未完成的申请",
  "intro.language": "语言",
  "applicant.title": "申请人是谁?",
  "applicant.name": "全名",
  "applicant.continue": "继续上传文件",
  "checklist.title": "您的文件",
  "checklist.pass": "看起来不错",
  "checklist.fixing": "需要修正",
  "checklist.flagged": "可能已被编辑",
  "checklist.finish": "完成并提交",
  "checklist.startOver": "重新开始",
  "done.title": "您的材料已发送",
  "closed.startNew": "开始新的申请",
};

const VI: Partial = {
  "intro.title": "Chuẩn bị hồ sơ nhà ở của bạn",
  "intro.start": "Bắt đầu",
  "intro.resume": "Tiếp tục",
  "applicant.title": "Ai đang nộp đơn?",
  "applicant.name": "Họ và tên",
  "applicant.continue": "Tiếp tục đến tài liệu",
  "checklist.title": "Tài liệu của bạn",
  "checklist.pass": "Đã tốt",
  "checklist.fixing": "Cần sửa",
  "checklist.finish": "Hoàn tất và gửi",
  "checklist.startOver": "Bắt đầu lại",
  "closed.startNew": "Bắt đầu đơn mới",
};

const HT: Partial = {
  "intro.title": "Prepare papye lojman ou yo",
  "intro.start": "Kòmanse",
  "intro.resume": "Kontinye",
  "applicant.title": "Ki moun k ap aplike?",
  "applicant.name": "Non konplè",
  "applicant.continue": "Kontinye ak dokiman",
  "checklist.title": "Dokiman ou yo",
  "checklist.pass": "Sanble byen",
  "checklist.fixing": "Bezwen ranje",
  "checklist.finish": "Fini epi voye",
  "checklist.startOver": "Rekòmanse",
  "closed.startNew": "Kòmanse yon nouvo aplikasyon",
};

const TL: Partial = {
  "intro.title": "Ihanda ang inyong mga papeles para sa pabahay",
  "intro.start": "Magsimula",
  "intro.resume": "Ipagpatuloy",
  "applicant.title": "Sino ang nag-aaplay?",
  "applicant.name": "Buong pangalan",
  "applicant.continue": "Magpatuloy sa mga dokumento",
  "checklist.title": "Inyong mga dokumento",
  "checklist.pass": "Ayos",
  "checklist.fixing": "Kailangang ayusin",
  "checklist.finish": "Tapusin at ipadala",
  "checklist.startOver": "Magsimulang muli",
  "closed.startNew": "Magsimula ng bagong aplikasyon",
};

const SO: Partial = {
  "intro.title": "Diyaari waraaqahaaga guriga",
  "intro.start": "Bilow",
  "intro.resume": "Sii wad",
  "applicant.title": "Yaa codsanaya?",
  "applicant.name": "Magaca oo dhan",
  "applicant.continue": "Sii wad dokumentiyada",
  "checklist.title": "Dokumentiyadaada",
  "checklist.pass": "Waa fiican yahay",
  "checklist.fixing": "Wax baa saxid u baahan",
  "checklist.finish": "Dhammee oo dir",
  "checklist.startOver": "Bilow mar kale",
  "closed.startNew": "Bilow codsi cusub",
};

const AR: Partial = {
  "intro.title": "جهّز أوراق السكن",
  "intro.start": "ابدأ",
  "intro.resume": "متابعة",
  "applicant.title": "من هو مقدم الطلب؟",
  "applicant.name": "الاسم الكامل",
  "applicant.continue": "المتابعة إلى المستندات",
  "checklist.title": "مستنداتك",
  "checklist.pass": "تبدو جيدة",
  "checklist.fixing": "بحاجة إلى تصحيح",
  "checklist.finish": "إنهاء وإرسال",
  "checklist.startOver": "البدء من جديد",
  "closed.startNew": "بدء طلب جديد",
};

export const DICT: Record<Lang, Partial & typeof EN> = {
  en: EN,
  es: { ...EN, ...ES },
  zh: { ...EN, ...ZH },
  vi: { ...EN, ...VI },
  ht: { ...EN, ...HT },
  tl: { ...EN, ...TL },
  so: { ...EN, ...SO },
  ar: { ...EN, ...AR },
};

export const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
}>({ lang: "en", setLang: () => {} });

export function useT() {
  const { lang } = useContext(LangContext);
  return (key: DictKey): string => DICT[lang][key] ?? EN[key] ?? key;
}

export function useLang() {
  return useContext(LangContext);
}
