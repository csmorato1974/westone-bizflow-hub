# PRE-DEPLOY 0 — WESTONE

## Objetivo

Definir un único camino de release para evitar pasos redundantes, entornos duplicados y cambios de infraestructura no aprobados.

## Entornos oficiales

- **Lovable STAGING**: desarrollo y validación funcional temprana.
- **GitHub `main`**: fuente canónica del código aprobado.
- **Raiola STAGING**: preproducción/UAT real en `staging.westone.vinculovirtual.com`.
- **Producción**: `westone.vinculovirtual.com`. Solo se toca después de un GO explícito en STAGING.

No se crea ningún dominio, subdominio ni entorno adicional durante una release sin aprobación explícita.

## Flujo obligatorio

1. **Código cerrado**
   - El cambio queda terminado.
   - Se abre PR.
   - El PR se valida y se integra en `main`.
   - Se identifica el SHA exacto que se va a desplegar.

2. **Artifact**
   - GitHub Actions genera el artifact desde ese SHA.
   - Tests y build deben estar en verde.
   - El artifact debe apuntar al backend de STAGING y nunca al de producción.

3. **Despliegue en Raiola STAGING**
   - Se despliega ese mismo artifact en `staging.westone.vinculovirtual.com`.
   - Raiola STAGING es el entorno real de preproducción. No se añade otra capa intermedia.

4. **Smoke test**
   - La aplicación carga correctamente.
   - Login y navegación básica funcionan.
   - Se prueban los cambios incluidos en la release.
   - Si corresponde, se verifica la conexión al backend de STAGING.

5. **Decisión**
   - **PASS** → Raiola STAGING = **GO**.
   - **FAIL** → se corrige el código y se repite el ciclo con nuevo PR, SHA y artifact.

6. **Producción**
   - Solo se plantea después del GO de STAGING.
   - Requiere una decisión explícita separada.
   - Nunca se usa producción para probar una release.

## Regla de `_releases`

Una carpeta como `_releases/<SHA>` puede usarse para guardar artifacts identificados y facilitar rollback o trazabilidad.

**No es un entorno de prueba y no cuenta como smoke test.**

Guardar o extraer un artifact allí no sustituye el despliegue y la prueba en Raiola STAGING.

## Condiciones de parada

Antes de continuar, se debe detener el proceso y pedir aprobación si aparece cualquiera de estas situaciones:

- se propone crear un dominio, subdominio o entorno nuevo;
- el SHA del artifact no coincide con el SHA aprobado;
- el build apunta a un backend distinto del STAGING esperado;
- aparece una referencia a producción;
- una migración, seed o cambio de datos no estaba previsto;
- se propone repetir una subida, copia o validación que no aporta una evidencia nueva;
- existe cualquier duda sobre qué entorno se está modificando.

## Formato operativo para agentes

En tareas de release o despliegue, antes de dar instrucciones operativas el agente debe indicar de forma breve:

**Estado:** PRE-DEPLOY 0 / paso actual.  
**Acción siguiente:** una sola acción concreta.  
**Resultado esperado:** qué evidencia confirma que el paso terminó bien.

Las respuestas deben ser ejecutivas. No se añaden capas, controles o trabajo extra fuera de este protocolo sin justificar primero qué riesgo concreto resuelven y obtener aprobación.

## Flujo resumido

`Lovable → PR → main → artifact → Raiola STAGING → smoke → GO → producción`
