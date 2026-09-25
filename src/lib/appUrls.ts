/** Origen público de la app en el entorno actual. */
export function getPublicAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://westone.vinculovirtual.com";
}

export function getPublicLoginUrl(): string {
  return `${getPublicAppOrigin()}/login`;
}
