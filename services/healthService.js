/**
 * Servicio de Validación de Dependencias Operativas
 */
class HealthService {
    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        this.gemmaModel = process.env.OLLAMA_MODEL || 'gemma';
        this.embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
        // Blindaje contra el "fantasma": colección y dimensión esperadas (de .env).
        this.collection = process.env.QDRANT_COLLECTION || 'plastitec_docs';
        this.expectedDim = parseInt(process.env.LOCAL_EMBEDDING_DIMENSION, 10) || 1024;
    }

    /**
     * Realiza un pre-flight check de todas las dependencias críticas
     * @throws {Error} Si alguna dependencia crítica no está disponible
     */
    async performPreFlightCheck() {
        console.log('\n🔍 Iniciando Pre-flight Check de dependencias...');

        // 1. Validar Ollama
        await this._checkOllama();

        // 2. Validar Qdrant
        await this._checkQdrant();

        console.log('✅ Pre-flight Check completado con éxito.\n');
    }

    async _checkOllama() {
        try {
            console.log(`   - Verificando Ollama en ${this.ollamaUrl}...`);
            const response = await fetch(`${this.ollamaUrl}/api/tags`);
            
            if (!response.ok) {
                throw new Error(`Ollama respondió con status ${response.status}`);
            }

            const data = await response.json();
            const models = data.models || [];
            
            const hasGemma = models.some(m => m.name.startsWith(this.gemmaModel));
            const hasEmbed = models.some(m => m.name.startsWith(this.embedModel));

            if (!hasGemma) {
                console.error(`❌ Modelo "${this.gemmaModel}" no encontrado en Ollama.`);
                console.info(`   Ejecuta: ollama pull ${this.gemmaModel}`);
                throw new Error(`Modelo ${this.gemmaModel} faltante`);
            }
            console.log(`     ✅ Modelo ${this.gemmaModel} encontrado.`);

            if (!hasEmbed) {
                console.error(`❌ Modelo "${this.embedModel}" no encontrado en Ollama.`);
                console.info(`   Ejecuta: ollama pull ${this.embedModel}`);
                throw new Error(`Modelo ${this.embedModel} faltante`);
            }
            console.log(`     ✅ Modelo ${this.embedModel} encontrado.`);

            console.log('   ✅ Ollama está activo y configurado.');
        } catch (error) {
            console.error('❌ Error de conexión con Ollama.');
            console.info('   Asegúrate de que Ollama esté corriendo (ollama serve).');
            throw new Error(`Ollama no disponible: ${error.message}`);
        }
    }

    async _checkQdrant() {
        try {
            console.log(`   - Verificando Qdrant en ${this.qdrantUrl}...`);
            const response = await fetch(`${this.qdrantUrl}/collections`);

            if (!response.ok) {
                throw new Error(`Qdrant respondió con status ${response.status}`);
            }

            console.log('   ✅ Qdrant está activo.');
        } catch (error) {
            console.error('❌ Error de conexión con Qdrant.');
            console.info('   Asegúrate de que el servicio Qdrant esté iniciado.');
            throw new Error(`Qdrant no disponible: ${error.message}`);
        }

        // ── Blindaje de software contra el storage "fantasma" (2026-06-17) ──
        // El fix del .bat (cwd correcto) previene cargar el storage 768d vacío,
        // pero el pre-flight no lo detectaba. Aquí validamos que la colección
        // exista y tenga la dimensión esperada (de .env); si no, ABORTA el
        // arranque en vez de servir un índice equivocado de forma silenciosa.
        try {
            console.log(`   - Verificando colección "${this.collection}" (dim esperada: ${this.expectedDim})...`);
            const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}`);

            if (res.status === 404) {
                throw new Error(`La colección "${this.collection}" NO existe. ¿Storage equivocado (fantasma)? Verifica que Qdrant arrancó con cwd C:\\AIV2 (start_qdrant.bat).`);
            }
            if (!res.ok) {
                throw new Error(`Qdrant respondió con status ${res.status} al consultar la colección.`);
            }

            const data = await res.json();
            const vectors = data?.result?.config?.params?.vectors;
            // Soporta vector único ({size}) y vectores nombrados ({nombre:{size}}).
            const actualDim = typeof vectors?.size === 'number'
                ? vectors.size
                : (vectors && typeof vectors === 'object'
                    ? Object.values(vectors).find(v => typeof v?.size === 'number')?.size
                    : undefined);
            const points = data?.result?.points_count ?? 0;

            if (typeof actualDim !== 'number') {
                throw new Error(`No se pudo leer la dimensión de la colección "${this.collection}" (forma de config inesperada).`);
            }
            if (actualDim !== this.expectedDim) {
                throw new Error(
                    `Dimensión INCORRECTA en "${this.collection}": esperada ${this.expectedDim}d, encontrada ${actualDim}d. ` +
                    `Casi seguro es el storage fantasma. Detén Qdrant y arráncalo con start_qdrant.bat (cwd C:\\AIV2).`
                );
            }

            console.log(`   ✅ Colección "${this.collection}" OK: ${actualDim}d, ${points} puntos.`);
        } catch (error) {
            console.error('❌ Validación de la colección Qdrant falló.');
            console.info('   Revisa que Qdrant cargue C:\\AIV2\\storage (real) y no un storage fantasma.');
            throw new Error(`Qdrant colección inválida: ${error.message}`);
        }
    }
}

export default new HealthService();
