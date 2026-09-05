import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
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
  if (error === "no-speech") return "No se detectó voz. Intenta nuevamente.";
  if (error === "network") return "El servicio de reconocimiento no está disponible.";
  return "No se pudo completar el dictado.";
};

const limpiarEspacios = (value: string) => value.replace(/\s+/g, " ").trim();

export function useVoiceDictation() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTranscriptRef = useRef("");
  const finalSegmentsRef = useRef<Map<number, string>>(new Map());
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
      setError("Este navegador no permite dictado por voz. Puedes pegar o escribir los datos.");
      return;
    }

    recognitionRef.current?.abort();
    baseTranscriptRef.current = limpiarEspacios(transcript);
    finalSegmentsRef.current.clear();

    const recognition = new Recognition();
    recognition.lang = "es-BO";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = limpiarEspacios(result[0].transcript);

        if (result.isFinal) {
          if (text) finalSegmentsRef.current.set(index, text);
          else finalSegmentsRef.current.delete(index);
        } else if (text) {
          interimText += `${interimText ? " " : ""}${text}`;
        }
      }

      const finalText = Array.from(finalSegmentsRef.current.entries())
        .sort(([a], [b]) => a - b)
        .map(([, text]) => text)
        .join(" ");

      setTranscript(limpiarEspacios([baseTranscriptRef.current, finalText].filter(Boolean).join(" ")));
      setInterimTranscript(limpiarEspacios(interimText));
    };
    recognition.onerror = (event) => {
      setError(errorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };

    setError(null);
    setInterimTranscript("");
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("El dictado ya está activo en otra ventana. Ciérralo e intenta de nuevo.");
    }
  }, [transcript]);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  const reset = useCallback(() => {
    baseTranscriptRef.current = "";
    finalSegmentsRef.current.clear();
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  return { supported, listening, transcript, setTranscript, interimTranscript, error, start, stop, reset };
}
