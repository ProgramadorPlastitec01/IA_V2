/**
 * Servicio de Validación de Dependencias Operativas
 */
class HealthService {
    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        this.gemmaModel = process.env.OLLAMA_MODEL || 'gemma';
        this.embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
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
    }
}

export default new HealthService();
