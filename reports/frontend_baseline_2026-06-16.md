# Informe de Línea Base del Frontend — Asistente RRHH IA (Plastitec)
**Fecha:** 2026-06-16 · **Propósito:** Documentar el estado ACTUAL (diseño + funcionalidad) como línea base y checklist de no-regresión para el rediseño. Solo lectura.

> **Nota de ruta:** El path asumido `src/AsistenteRRHH_IA/` **no existe**. El frontend real vive en `src/` con `src/components/` y `src/utils/`.

---

## SECCIÓN 1 — INVENTARIO DE COMPONENTES

Stack: React 19 + Vite 7 + Tailwind CSS v4 + framer-motion. **No hay librería de router ni de estado global** (no Redux/Zustand/Context). El "ruteo" es un `if` sobre `window.location.search`.

### Árbol de componentes (jerarquía real)

```
main.jsx  (StrictMode → App)
└── App.jsx
    ├── if (?dashboard=true) → AnalyticsDashboard
    │                          └── SystemStatus
    └── else                 → VoiceChat  ◄── COMPONENTE PRINCIPAL (~1054 líneas)
        ├── ListeningProgressBar   (sub-componente inline, definido en VoiceChat.jsx)
        ├── NexusCore              (orbe animado de fondo)
        ├── CompanyLogo            (logo con fallback)
        ├── TypewriterText         (efecto de tipeo de la respuesta)
        ├── HelpGuide              (modal "¿Cómo preguntar?")
        └── AnalyticsDashboard     (importado pero NO renderizado aquí; ver nota)
```

| Componente | Ruta | Responsabilidad | Hijos | Estado que maneja |
|---|---|---|---|---|
| **App** | `src/App.jsx` | Decide vista según `?dashboard=true` en la URL | VoiceChat / AnalyticsDashboard | Ninguno (lee `window.location.search`) |
| **VoiceChat** | `src/components/VoiceChat.jsx` | Componente central del kiosco: máquina de estados de voz, chat, modales, TTS | ListeningProgressBar, NexusCore, CompanyLogo, TypewriterText, HelpGuide | **15 `useState`** (`appState`, `isModalOpen`, `isGuideOpen`, `transcript`, `response`, `error`, `timeLeft`, `processingStep`, `showAnalytics`, `performanceMetrics`, `showPinModal`, `isSupported`) + **~18 `useRef`** (recognition, synth, stream, locks, métricas, detección de dispositivo) + 2 `useMotionValue` |
| **ListeningProgressBar** | inline en `VoiceChat.jsx` | Barra de cuenta regresiva del límite de grabación (10s) | — | `useRef(onTimeUp)` |
| **NexusCore** | `src/components/NexusCore.jsx` | Orbe de energía animado de fondo; color según `status` | — | `useMotionValue` + `useTransform` (sincroniza `volume`) |
| **CompanyLogo** | `src/components/CompanyLogo.jsx` | Renderiza `logo-plastitec.png` con fallback a texto | — | Ninguno |
| **TypewriterText** | `src/components/TypewriterText.jsx` | Efecto de tipeo carácter a carácter del texto de respuesta | — | `useState(index)` |
| **HelpGuide** | `src/components/HelpGuide.jsx` | Modal con convenciones de uso (ejemplos correctos/incorrectos, keywords) | — | Ninguno (controlado por props `isOpen`/`onClose`) |
| **AnalyticsDashboard** | `src/components/AnalyticsDashboard.jsx` | Panel admin (3 pestañas: Estadísticas, Servicios, Errores); auto-refresh 10s | SystemStatus | `useState`: events, loading, stats, systemErrors, activeTab, errorFilter |
| **SystemStatus** | `src/components/SystemStatus.jsx` | Monitor de servicios backend (auto-refresh 30s) | — | `useState`: stats, loading, error |
| **EmojiMascot** | `src/components/EmojiMascot.jsx` | ⚠️ **HUÉRFANO** — no lo importa ningún componente | — | — |
| **TalkingCat** | `src/components/TalkingCat.jsx` | ⚠️ **HUÉRFANO** — no lo importa ningún componente | — | — |

### Utilidades (`src/utils/`)
| Archivo | Responsabilidad |
|---|---|
| `aiClient.js` | Cliente híbrido (singleton). Orquesta: IntentEngine → QuickCache → backend `/api/query`. Maneja `conversationId`, timeouts adaptativos (120s primer query / 65s siguientes), parseo de errores. |
| `NexusIntentEngine.js` | NLU local basado en reglas (regex). Resuelve saludos/identidad/capacidades/agradecimiento/despedida/emergencia sin tocar la red. |
| `QuickCache.js` | Caché LRU en RAM (TTL 10 min, máx 50 entradas). |
| `apiConfig.js` | Exporta `API_BASE_URL = ''` (rutas relativas siempre). |

---

## SECCIÓN 2 — MAPA DE FUNCIONALIDADES ACTUALES

| # | Funcionalidad | Qué hace | Implementado en | Backend |
|---|---|---|---|---|
| 1 | **Envío de mensaje (texto)** | Input inferior; Enter o botón ➤ dispara `handleQuery` | `VoiceChat` (input `#manualInput`, acceso por `getElementById` — **no controlado**) | vía `aiClient.query` → ver #11 |
| 2 | **Entrada por voz** | Botón mic → `SpeechRecognition` (es-MX), transcribe y auto-envía al `isFinal` | `VoiceChat.startListening` (Web Speech API nativa) | No directo (transcribe local) |
| 3 | **Renderizado de respuesta** | Muestra respuesta en card central con efecto typewriter | `VoiceChat` + `TypewriterText` | — |
| 4 | **Síntesis de voz (TTS)** | Lee la respuesta en voz alta (es-MX), limpia emojis/markdown | `VoiceChat.speakText` (`speechSynthesis`) | No (API navegador) |
| 5 | **Indicador de procesamiento** | Sub-estados: "Recibiendo→Analizando→Generando" con timers (800ms/3500ms) | `VoiceChat.getStateConfig` + `processingStep` | — |
| 6 | **Resolución local de intención** | Saludos/meta-preguntas respondidas en <5ms sin red | `aiClient.query` → `IntentEngine.analyze` | No (evita backend) |
| 7 | **Caché de sesión (cliente)** | Respuestas previas servidas desde RAM | `aiClient` → `QuickCache` | No |
| 8 | **Manejo de errores de red** | Mensajes diferenciados (503, HTML, JSON malformado, timeout); toast rojo | `aiClient.query` (catch) + `VoiceChat` (toast) | Reporta a `/api/report-error` |
| 9 | **Temas sugeridos (FAQ)** | Modal ℹ️ con 10 temas predefinidos; al tocar uno dispara `handleQuery` | `VoiceChat` (modal `isModalOpen`) | vía #11 |
| 10 | **Guía de uso** | Modal 💡 con ejemplos correctos/incorrectos y keywords | `HelpGuide` | — |
| 11 | **Consulta RAG al backend** | Envía query al pipeline RAG | `aiClient.query` | **POST `/api/query`** |
| 12 | **Auto-cierre de respuesta** | Timer de 25s que limpia la respuesta; se resetea con interacción | `VoiceChat` (useEffect sobre `response`/`appState`) | — |
| 13 | **Modal PIN admin** | 5 clicks secretos en el logo → modal PIN → valida → abre dashboard | `VoiceChat.handleSecretClick` + `showPinModal` | **POST `/api/verify-pin`** |
| 14 | **Dashboard de analytics** | Vista admin con KPIs y log de eventos en vivo | `AnalyticsDashboard` | **GET `/api/analytics`** |
| 15 | **Monitor de servicios** | Estado de servicios backend (online/degraded/inactive) | `SystemStatus` | **GET `/api/system-status`** |
| 16 | **Log de errores del sistema** | Lista errores reportados; marca como resueltos | `AnalyticsDashboard` (tab errores) | **GET `/api/system-errors`**, **POST `/api/system-errors/resolve`** |
| 17 | **Logging de analytics (cliente)** | Envía eventos de uso (intención local, cache hit) sin bloquear UI | `aiClient.logAnalytics` | **POST `/api/analytics`** |
| 18 | **Health check al iniciar** | Verifica backend al montar | `aiClient.initialize` | **GET `/api/health`** |
| 19 | **Reporte de errores** | Envía errores de mic/IA con metadata del dispositivo | `VoiceChat.reportError` | **POST `/api/report-error`** |
| 20 | **Auto-voz en kiosco/tablet** | Detecta tablet táctil ≥768px y dispara voz tras activación | `VoiceChat.activateApp` | — |

### Funcionalidades PARCIALES / con observaciones (reportadas como tal)
- **Panel de latencia "secreto" (showAnalytics):** El bloque "CONSOLA DE ADMINISTRACIÓN" (líneas ~834-878) depende de `showAnalytics===true`, pero **no existe ningún `setShowAnalytics(true)` en el código** — solo el botón CERRAR (`setShowAnalytics(false)`). Por tanto este panel y las `performanceMetrics` que calcula `handleQuery` **están actualmente inalcanzables (UI muerta)**.
- **Métricas de mic/grabación/transcripción** (`micMs`, `recMs`, `transMs`) se inicializan en `metricsRef` pero quedan en 0; no hay flujo que las popule (residuo de una implementación de grabación previa por `MediaRecorder`, cuyos refs existen pero no se usan en el camino actual de Web Speech).
- **`POST /api/reset`** existe en backend y `aiClient.resetConversation()` se llama al montar, pero **resetea solo estado local** (conversationId + QuickCache); no invoca el endpoint `/api/reset`.

---

## SECCIÓN 3 — CONEXIONES CON EL BACKEND

**Configuración de URL base:** `apiConfig.js` exporta `API_BASE_URL = ''` (string vacío → rutas relativas). En **dev**, el proxy de Vite (`vite.config.js`) redirige `/api → http://localhost:3000`. En **prod**, Express sirve SPA + API desde el mismo origen. No hay variable de entorno de API en el cliente; el puerto del backend (3000) solo aparece en el proxy de Vite.

| Endpoint | Método | Payload enviado | Respuesta esperada | Componente/función |
|---|---|---|---|---|
| `/api/query` | POST | `{ query, conversationId }` | `{ response, conversationId, cached?, category?, confidence?, sources?, ... }` (el cliente usa `response`, `conversationId`, `cached`) | `aiClient.query` |
| `/api/health` | GET | — | `{ status, engine? }` (espera `status==='ready'`) | `aiClient.initialize` |
| `/api/analytics` | POST | `{ type, data }` | (ignorado; fire-and-forget) | `aiClient.logAnalytics` |
| `/api/analytics` | GET | — | `{ events: [...] }` | `AnalyticsDashboard.fetchAnalytics` |
| `/api/report-error` | POST | `{ type, module, message, stack, details }` | (ignorado) | `VoiceChat.reportError` |
| `/api/verify-pin` | POST | `{ pin }` | `{ success: boolean }` | `VoiceChat` (form PIN) |
| `/api/system-errors` | GET | — | `{ errors: [...] }` | `AnalyticsDashboard.fetchSystemErrors` |
| `/api/system-errors/resolve` | POST | `{ id }` | `200 OK` | `AnalyticsDashboard.resolveError` |
| `/api/system-status` | GET | — | `{ services: [{ id, name, status, latency, message }] }` | `SystemStatus.checkStatus` |

**Endpoints del backend NO consumidos por el frontend:** `/api/reset`, `/api/analytics/quality`, `/api/bump-knowledge-version`, `/api/knowledge-version`.
**Nota:** El frontend **no** envía `bypass_cache` (ese parámetro solo lo usa el script de benchmark).

---

## SECCIÓN 4 — DISEÑO VISUAL ACTUAL

- **Método de estilado:** Tailwind CSS **v4** (`@import "tailwindcss"` + bloque `@theme` en `index.css`). Clases utilitarias inline en JSX. `App.css` contiene **boilerplate de Vite sin usar** (`.logo`, `.read-the-docs`, `#root max-width:1280px`). Estilos de componentes reutilizables en `@layer components`: `.glass-effect`, `.custom-scrollbar`, `.gpu-accelerated`.
- **Paleta de colores (valores reales):**
  - Fondo base: `#0d1426` (primary-900) · paneles: `#1a2333`, `#111827`
  - Primary navy: `--color-primary-500: #233969`, highlight `#3b66cc`, escala 50→900
  - Fondo body: `radial-gradient(circle at 20% 20%, #3b66cc, #233969 45%, #0d1426 100%)`
  - Acentos por estado (NexusCore): azul `#3b82f6`, verde `#10b981`, púrpura `#8b5cf6`, naranja `#f59e0b`, rojo `#ef4444`
  - Acento UI dominante: `blue-400/500/600`; badges "DEMO" en amarillo
- **Tipografía:** `font-sans` (stack del sistema vía Tailwind). **No se carga ninguna fuente web** (index.html no enlaza Google Fonts). Pesos: `font-light` (títulos grandes), `font-bold`/`font-black` (énfasis). Tracking amplio (`tracking-[0.2em]`–`[0.4em]`) y `uppercase` frecuente.
- **Layout:** Kiosco a **pantalla completa** (`h-screen w-full`), de **un solo panel/vista** gobernado por máquina de estados — **NO es un chat de dos paneles ni con historial**. Una sola Q&A a la vez.
- **Librerías UI/iconos:** Ninguna librería de componentes. Iconos = **emojis** (🎙️ 🧠 🗣️ 💡 ℹ️ 🔐). Animación = **framer-motion** (motion, AnimatePresence, useMotionValue, useTransform).
- **Animaciones:** Transiciones de estado, orbe NexusCore (anillos orbitales, partículas, rayos), typewriter, barras de progreso, modales con scale/fade. `index.css` define muchos `@keyframes` (`meow`, `wiggle-*`, `paw-to-ear`, etc.) **asociados a los componentes huérfanos** EmojiMascot/TalkingCat.
- **Responsive:** Breakpoint `md:` (768px). Detección de móvil/tablet/kiosco por `userAgent` + `maxTouchPoints` + ancho. `glass-effect` desactiva `backdrop-filter` en <768px (optimización GPU).

### Wireframe ASCII (vista principal IDLE)

```
┌──────────────────────────────────────────────────────────────┐
│ ┌─[logo] Asistente RRHH IA [DEMO]      [💡 ¿Cómo preguntar?][ℹ️]│  Header
│ └──────────────────────────────────────────────────────────── │
│                                                                │
│                         ✨ (icono estado)                      │
│                       Bienvenido            ◄── NexusCore orbe │
│              Toca el micrófono para comenzar     (fondo anim.) │
│                                                                │
│              [barra límite grabación si LISTENING]             │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │  ( 🎙️ )   Escribe tu consulta aquí...              ( ➤ )  │ │  Footer
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

Vista RESPONDING:  card central #1a2333 con barra de progreso superior,
"Respuesta del Asistente" (typewriter), transcript citado, botón
"Entendido {25s}", badge disclaimer ⚠ IA.

Splash INIT:  logo grande + "TOCAR PARA INICIAR 👆" sobre NexusCore.
```
> No se incluye captura: tarea de solo lectura; el dev server (Vite :5180) no se levantó para no alterar el entorno.

---

## SECCIÓN 5 — DEPENDENCIAS Y RESTRICCIONES TÉCNICAS

### Dependencias relevantes al frontend (de `package.json`)
| Paquete | Versión | Uso |
|---|---|---|
| `react` / `react-dom` | ^19.2.0 | Framework UI |
| `vite` | ^7.3.1 | Build/dev server (puerto 5180) |
| `@vitejs/plugin-react` | ^5.1.1 | JSX/Fast Refresh |
| `@vitejs/plugin-basic-ssl` | ^2.1.4 | HTTPS local (mic requiere contexto seguro) |
| `tailwindcss` + `@tailwindcss/vite` + `@tailwindcss/postcss` | ^4.1.18 | Estilado (v4, config en CSS) |
| `framer-motion` | ^12.34.0 | **Toda** la animación |
| `@emotion/is-prop-valid` | ^1.4.0 | Peer de framer-motion |
| `autoprefixer` / `postcss` | ^10.4.24 / ^8.5.6 | Pipeline CSS |
| ESLint 9 + plugins react-hooks/react-refresh | ^9.39.1 | Linting |

> Nota: muchas deps de `package.json` (express, sqlite3, pdf-parse, tesseract, etc.) son **del backend**, no del frontend.

### Convenciones que el rediseño DEBE respetar
1. **Estilos vía Tailwind v4** con tema en `@theme` de `index.css` (no hay `tailwind.config.js` tradicional con tema; la paleta `primary-*` vive en CSS). Mantener clases `.glass-effect`, `.custom-scrollbar` o migrarlas explícitamente.
2. **Animaciones con framer-motion** (no CSS transitions sueltas para lo complejo).
3. **Rutas de API relativas** (`API_BASE_URL = ''`) — no hardcodear `localhost:3000`.
4. **Estado local con hooks** (useState/useRef); no hay store global. Si se introduce uno, es decisión nueva.
5. **Ruteo por query param** (`?dashboard=true`) — no hay React Router.
6. **Estructura de carpetas:** `src/components/*.jsx`, `src/utils/*.js`. Imports relativos.
7. **Base de Vite relativa en prod** (`base: './'`) para despliegue Tomcat en subpaths.
8. **Contexto seguro para mic:** `getUserMedia`/Web Speech requieren HTTPS o localhost; el código ya degrada a "modo teclado" si no.

---

## SECCIÓN 6 — CHECKLIST DE NO-REGRESIÓN

Tras el rediseño, estas funcionalidades deben seguir operando **idénticamente**:

**Núcleo de consulta**
- [ ] 1. Enviar consulta por **texto** (Enter y botón ➤) → respuesta renderizada.
- [ ] 2. Enviar consulta por **voz** (mic → transcripción es-MX → auto-envío).
- [ ] 3. Respuesta se **lee en voz alta** (TTS es-MX) con limpieza de emojis/markdown.
- [ ] 4. Efecto **typewriter** en la respuesta.
- [ ] 5. Indicador de procesamiento con sub-estados (Recibiendo/Analizando/Generando).
- [ ] 6. **POST `/api/query`** con `{ query, conversationId }`; consume `response`/`conversationId`/`cached`.

**Capas híbridas (rendimiento)**
- [ ] 7. **IntentEngine** local resuelve saludos/meta-preguntas sin red.
- [ ] 8. **QuickCache** (RAM) sirve respuestas repetidas en la sesión.
- [ ] 9. `conversationId` se persiste entre consultas (en `aiClient`).

**Robustez / errores**
- [ ] 10. Manejo de errores de red diferenciado (503 / HTML / JSON malformado / timeout) con toast.
- [ ] 11. Timeouts adaptativos (120s primer query, 65s siguientes).
- [ ] 12. Reporte de errores a **`/api/report-error`** con metadata de dispositivo.
- [ ] 13. Mutex `isLocked` previene consultas concurrentes/duplicadas.
- [ ] 14. Degradación a "modo teclado" si el mic no está disponible (HTTP/sin permiso).

**UI / navegación**
- [ ] 15. Modal **Temas de Consulta** (10 temas) → cada uno dispara consulta.
- [ ] 16. Modal **Guía "¿Cómo preguntar?"** (HelpGuide).
- [ ] 17. **Auto-cierre** de respuesta a los 25s con reseteo por interacción.
- [ ] 18. Badge disclaimer "⚠ Esta respuesta puede tener errores".
- [ ] 19. Detección y **auto-voz** en tablet/kiosco.

**Admin (acceso secreto)**
- [ ] 20. **5 clicks** en el logo → modal PIN → **`/api/verify-pin`** → abre `?dashboard=true`.
- [ ] 21. **AnalyticsDashboard**: KPIs + log de eventos en vivo (**GET `/api/analytics`**, refresh 10s).
- [ ] 22. **SystemStatus**: monitor de servicios (**GET `/api/system-status`**, refresh 30s).
- [ ] 23. **Tab de errores**: listar (**GET `/api/system-errors`**) y resolver (**POST `/api/system-errors/resolve`**).

**Infra**
- [ ] 24. `API_BASE_URL=''` (rutas relativas; proxy Vite en dev, mismo origen en prod).
- [ ] 25. PWA: service worker (`sw.js`) y `manifest.json` siguen registrándose.
- [ ] 26. Health check al iniciar (**GET `/api/health`**).

**Decisiones a tomar en el rediseño (UI actualmente muerta — no es regresión preservarla o eliminarla):**
- Panel de latencia `showAnalytics` (sin trigger) y métricas `micMs/recMs/transMs` (siempre 0).
- Componentes huérfanos `EmojiMascot.jsx` y `TalkingCat.jsx` (+ sus `@keyframes` en `index.css`).
- `App.css` (boilerplate de Vite sin uso real).
