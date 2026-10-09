/**
 * AI Client — Asistente RRHH IA Plastitec
 * Cliente híbrido del frontend: prioriza resolución local antes de llamar al backend RAG.
 *
 * Prioridad de resolución:
 * 1. IntentEngine (local, <5ms)
 * 2. QuickCache (RAM de sesión, <10ms)
 * 3. Backend RAG /api/query (~2-10s)
 */

import IntentEngine from './NexusIntentEngine.js';
import QuickCache from './QuickCache.js';
import { API_BASE_URL } from './apiConfig.js';

class AIClient {
    constructor() {
        this.conversationId = null;
        this.apiBaseUrl = API_BASE_URL;
        this._isFirstQuery = true; // true until first successful backend call
        console.log('AI Client configurado. Motor: RAG Local (Qdrant + Gemma + Ollama). API:', this.apiBaseUrl);
    }


    // Helper para enviar métricas al backend sin bloquear UI
    logAnalytics(type, data) {
        fetch(`${this.apiBaseUrl}/api/analytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, data })
        }).catch(err => console.warn('Analytics logging error:', err));
    }

    async initialize() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                console.warn(`Backend health check failed (HTTP ${response.status}):`, text.substring(0, 120));
                return false;
            }
            const data = await response.json();
            console.log('Backend Status:', data.status, '|', data.engine || '');
            return data.status === 'ready';
        } catch (error) {
            console.error('No se pudo conectar con el servidor backend:', error.message);
            return false;
        }
    }

    /**
     * Consulta INTELIGENTE al sistema híbrido.
     * Prioridad:
     * 1. IntentEngine (Local, <5ms)
     * 2. QuickCache (Memoria, <10ms)
     * 3. Backend RAG (Remoto, ~2-10s)
     */
    async query(queryText, options = {}) {
        const startTime = performance.now();
        console.log(`[HybridEngine] Procesando: "${queryText}"`);

        // 1. ANÁLISIS DE INTENCIÓN (Local)
        const intent = IntentEngine.analyze(queryText);

        if (intent.type && intent.type !== 'unknown' && intent.type !== 'void') {
            const latency = (performance.now() - startTime).toFixed(2);
            console.log(`[HybridEngine] ✅ Intención detectada: ${intent.type} (${latency}ms)`);

            this.logAnalytics('LocalIntentResolved', {
                intentType: intent.type,
                query: queryText,
                latencyMs: latency
            });

            return intent.response;
        }

        // 2. CACHÉ EN RAM (QuickCache — solo para la sesión actual)
        const cachedResponse = QuickCache.get(queryText);
        if (cachedResponse) {
            const latency = (performance.now() - startTime).toFixed(2);
            console.log(`[RamCache HIT] ⚡ Respuesta en memoria de sesión (${latency}ms)`);

            this.logAnalytics('RamCacheHit', { query: queryText, latencyMs: latency });

            return cachedResponse;
        }

        // 3. CONSULTA BACKEND RAG
        try {
            console.log(`[HybridEngine] ☁️ Enviando al backend RAG...`);

            let signal;
            let timeoutId;

            // Timeout adaptativo: primer request (posible cold‑start) permite 120 s,
            // los siguientes usan el límite estándar de 65 s.
            const timeoutMs = this._isFirstQuery ? 120000 : 65000;

            if (options?.signal) {
                signal = options.signal;
                timeoutId = setTimeout(() => {
                    console.warn(`[HybridEngine] Timeout interno de ${timeoutMs / 1000}s alcanzado`);
                }, timeoutMs);
                signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
            } else {
                const controller = new AbortController();
                signal = controller.signal;
                timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            }

            const sanitizedQuery = queryText.trim().substring(0, 500);

            const response = await fetch(`${this.apiBaseUrl}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: sanitizedQuery,
                    conversationId: this.conversationId
                }),
                signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');

                if (!errorText) {
                    throw new Error(
                        response.status === 503
                            ? 'El servidor backend no está disponible. Por favor abre otra terminal y ejecuta: node server.js'
                            : `Error del servidor (${response.status}). Verifica que node server.js esté corriendo.`
                    );
                }

                try {
                    const errorData = JSON.parse(errorText);
                    throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
                } catch (e) {
                    if (e.message.startsWith('Error')) throw e;
                    const snippet = errorText.substring(0, 100).replace(/<[^>]*>/g, '').trim();
                    throw new Error(`Error del servidor (${response.status}): ${snippet || 'Respuesta no válida'}. Verifica el backend.`);
                }
            }

            const responseText = await response.text();
            let data;

            try {
                data = JSON.parse(responseText);
            } catch (e) {
                console.error('❌ Error parsing JSON response:', e);
                if (responseText.trim().startsWith('<')) {
                    const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
                    const title = titleMatch ? titleMatch[1] : 'HTML Response';
                    throw new Error(`El servidor devolvió HTML (${response.status}): "${title}". Verifica que el backend esté corriendo.`);
                }
                throw new Error('Respuesta inválida del servidor (JSON malformado).');
            }

            if (data.conversationId) {
                this.conversationId = data.conversationId;
            }

            // Guardar en RAM cache solo si no vino ya de SQLite
            if (!data.cached && data.response && data.response.length > 10) {
                QuickCache.set(queryText, data.response);
                console.log(`[RamCache SET] Respuesta guardada en memoria de sesión.`);
            }

            const totalLatency = (performance.now() - startTime).toFixed(0);
            if (data.cached) {
                console.log(`[SQLite Cache HIT] 📂 Respuesta persistente del servidor (${totalLatency}ms)`);
            } else {
                console.log(`[HybridEngine] 🏁 Respuesta RAG completada en ${totalLatency}ms`);
            }

            return data.response;

        } catch (error) {
            console.error('Error al consultar el backend RAG:', error);
            throw new Error(error.message || 'Lo siento, no pude procesar tu consulta. Por favor, contacta con RRHH.');
        }
    }

    resetConversation() {
        this.conversationId = null;
        QuickCache.clear();
    }
}

export default new AIClient();
