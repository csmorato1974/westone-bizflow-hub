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
  if (error === "no-speech") return "No se detectó voz. Intentá nuevamente.";
  if (error === "network") return "El servicio de reconocimiento no está disponible.";
  return "No se pudo completar el dictado.";
};

export function useVoiceDictation() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = "es-BO";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interimText += result[0].transcript;
      }
      if (finalText) setTranscript((current) => `${current}${current ? " " : ""}${finalText.trim()}`);
      setInterimTranscript(interimText.trim());
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
      setError("El dictado ya está activo en otra ventana. Cerralo e intentá de nuevo.");
    }
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  const reset = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  return { supported, listening, transcript, setTranscript, interimTranscript, error, start, stop, reset };
}
