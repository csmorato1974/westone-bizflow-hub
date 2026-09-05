import { describe, expect, it } from "vitest";
import { reconstruirDictado } from "@/hooks/useVoiceDictation";

const resultado = (transcript: string, isFinal: boolean) => ({
  isFinal,
  0: { transcript },
});

describe("dictado por voz", () => {
  it("no multiplica resultados finales que el navegador vuelve a enviar", () => {
    const first = reconstruirDictado("", {}, [resultado("empresa", true)]);
    const repeated = reconstruirDictado("", first.finalResults, [resultado("empresa", true)]);
    const repeatedAgain = reconstruirDictado("", repeated.finalResults, [resultado("empresa", true)]);

    expect(repeatedAgain.transcript).toBe("empresa");
  });

  it("reemplaza el resultado provisional sin acumular sus versiones anteriores", () => {
    const partial = reconstruirDictado("", {}, [resultado("nú", false)]);
    const expanded = reconstruirDictado("", partial.finalResults, [resultado("número", false)]);
    const confirmed = reconstruirDictado("", expanded.finalResults, [resultado("número 5", true)]);

    expect(partial.transcript).toBe("");
    expect(expanded.interimTranscript).toBe("número");
    expect(confirmed.transcript).toBe("número 5");
  });

  it("conserva el texto escrito antes de iniciar una nueva sesión", () => {
    const next = reconstruirDictado("Empresa Lubricantes", {}, [resultado("contacto Ana Pérez", true)]);

    expect(next.transcript).toBe("Empresa Lubricantes contacto Ana Pérez");
  });
});
