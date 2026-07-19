// Tiny hand-rolled EN/ES dictionary. Not a full i18n runtime — the renter
// flow copy is small enough that a lookup map is simpler than i18next.
// If the app grows past a few dozen keys, swap this for i18next.
import { createContext, useContext } from "react";

export type Lang = "en" | "es";

export const DICT = {
  en: {
    "intro.title": "Get your housing paperwork ready",
    "intro.body":
      "This is a checklist that helps you gather the right documents. We do not decide if you qualify — a real person will review everything you send.",
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
    "checklist.checking": "Checking your photo…",
    "checklist.acknowledge": "I know — this photo is fine",
    "checklist.finish": "Finish and send",
    "checklist.startOver": "Start over",
    "checklist.printable": "Show printable checklist",
    "checklist.download": "Download my packet (PDF)",
    "checklist.tamperCopy":
      "This photo may have been edited. If that's unexpected, try retaking it directly with your camera. It has not been rejected — a reviewer will take a look.",
    "startOver.title": "Start over from the beginning?",
    "startOver.body":
      "Everything you have uploaded will be permanently deleted from our servers. This cannot be undone.",
    "startOver.confirm": "Yes, delete everything and restart",
    "startOver.cancel": "Cancel",
    "done.title": "Your packet has been sent",
    "done.body":
      "A reviewer at the housing office will look at your documents and follow up with you. Keep the download link somewhere safe for your records.",
    "footer.notLegal":
      "This tool checks that your paperwork is complete and current. It does not decide who qualifies for housing — a person at the housing office does.",
  },
  es: {
    "intro.title": "Prepare sus documentos de vivienda",
    "intro.body":
      "Esta es una lista que le ayuda a reunir los documentos correctos. No decidimos si usted califica — una persona real revisará todo lo que envíe.",
    "intro.privacy":
      "Sus fotos se revisan en este teléfono antes de enviar cualquier cosa. Puede empezar de nuevo cuando quiera.",
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
    "checklist.upload": "Tomar foto o subir",
    "checklist.retake": "Volver a tomar",
    "checklist.pass": "Se ve bien",
    "checklist.flagged": "Puede haber sido editada",
    "checklist.fixing": "Necesita arreglo",
    "checklist.checking": "Revisando su foto…",
    "checklist.acknowledge": "Lo sé — esta foto está bien",
    "checklist.finish": "Terminar y enviar",
    "checklist.startOver": "Empezar de nuevo",
    "checklist.printable": "Ver lista para imprimir",
    "checklist.download": "Descargar mi paquete (PDF)",
    "checklist.tamperCopy":
      "Esta foto puede haber sido editada. Si eso no era su intención, intente tomarla de nuevo directamente con su cámara. No ha sido rechazada — un revisor la mirará.",
    "startOver.title": "¿Empezar de nuevo desde el principio?",
    "startOver.body":
      "Todo lo que ha subido se eliminará permanentemente de nuestros servidores. Esto no se puede deshacer.",
    "startOver.confirm": "Sí, borrar todo y reiniciar",
    "startOver.cancel": "Cancelar",
    "done.title": "Su paquete ha sido enviado",
    "done.body":
      "Un revisor de la oficina de vivienda mirará sus documentos y se comunicará con usted. Guarde el enlace de descarga en un lugar seguro.",
    "footer.notLegal":
      "Esta herramienta revisa que sus documentos estén completos y vigentes. No decide quién califica para vivienda — una persona en la oficina de vivienda lo hace.",
  },
} as const;

export type DictKey = keyof (typeof DICT)["en"];

export const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
}>({ lang: "en", setLang: () => {} });

export function useT() {
  const { lang } = useContext(LangContext);
  return (key: DictKey): string => DICT[lang][key] ?? DICT.en[key] ?? key;
}

export function useLang() {
  return useContext(LangContext);
}
