import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

type FinalResults = Record<number, string>;

const clavePalabra = (palabra: string) =>
  palabra
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]/g, "");

const limpiarFragmento = (fragmento: string) => {
  const palabras = fragmento.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return palabras.filter((palabra, indice) => {
    if (indice === 0) return true;
    const actual = clavePalabra(palabra);
    return !actual || actual !== clavePalabra(palabras[indice - 1]);
  });
};

export function combinarFragmentosDictado(base: string, fragmentos: string[]) {
  const resultado = limpiarFragmento(base);

  for (const fragmento of fragmentos) {
    const palabras = limpiarFragmento(fragmento);
    let solapamiento = Math.min(resultado.length, palabras.length);

    while (solapamiento > 0) {
      const anteriores = resultado.slice(-solapamiento).map(clavePalabra);
      const nuevas = palabras.slice(0, solapamiento).map(clavePalabra);
      if (anteriores.every((palabra, indice) => palabra && palabra === nuevas[indice])) break;
      solapamiento -= 1;
    }

    resultado.push(...palabras.slice(solapamiento));
  }

  return resultado.join(" ");
}

export function reconstruirDictado(
  base: string,
  previousFinalResults: FinalResults,
  results: ArrayLike<SpeechRecognitionResultLike>,
) {
  const finalResults = { ...previousFinalResults };
  let interimTranscript = "";

  for (const index of Object.keys(finalResults).map(Number)) {
    if (index >= results.length) delete finalResults[index];
  }

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const fragment = result[0].transcript.trim().replace(/\s+/g, " ");
    if (result.isFinal) {
      finalResults[index] = fragment;
    } else {
      delete finalResults[index];
      if (fragment) interimTranscript += `${interimTranscript ? " " : ""}${fragment}`;
    }
  }

  const confirmedTranscript = Object.entries(finalResults)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, fragment]) => fragment)
    .filter(Boolean);

  return {
    finalResults,
    interimTranscript,
    transcript: combinarFragmentosDictado(base, confirmedTranscript),
  };
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const errorMessage = (error: string) => {
  if (error === "not-allowed" || error === "service-not-allowed") return "No se concedió acceso al micrófono.";
  if (error === "no-speech") return "No se detectó voz. Intentá nuevamente.";
  if (error === "network") return "El servicio de reconocimiento no está disponible.";
  return "No se pudo completar el dictado.";
};

export function useVoiceDictation() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTranscriptRef = useRef("");
  const finalResultsRef = useRef<FinalResults>({});
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Este navegador no permite dictado por voz. Podés pegar o escribir los datos.");
      return;
    }

    const previousRecognition = recognitionRef.current;
    recognitionRef.current = null;
    previousRecognition?.abort();
    const recognition = new Recognition();
    recognition.lang = "es-BO";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const next = reconstruirDictado(baseTranscriptRef.current, finalResultsRef.current, event.results);
      finalResultsRef.current = next.finalResults;
      setTranscript(next.transcript);
      setInterimTranscript(next.interimTranscript);
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      setError(errorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setListening(false);
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    setError(null);
    setInterimTranscript("");
    baseTranscriptRef.current = transcript.trim();
    finalResultsRef.current = {};
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("El dictado ya está activo en otra ventana. Cerralo e intentá de nuevo.");
    }
  }, [transcript]);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  const reset = useCallback(() => {
    baseTranscriptRef.current = "";
    finalResultsRef.current = {};
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  return { supported, listening, transcript, setTranscript, interimTranscript, error, start, stop, reset };
}
