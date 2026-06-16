import { pipeline } from '@xenova/transformers';

async function main() {
    console.log("Cargando modelo ms-marco-MiniLM-L-6-v2...");
    const reranker = await pipeline('text-classification', 'Xenova/ms-marco-MiniLM-L-6-v2', {
        dtype: 'fp32',
        device: 'cpu'
    });
    
    const query = '¿Qué es el PTEE?';
    const text_positive = 'El Programa de Transparencia y Ética Empresarial (PTEE) es un mecanismo para prevenir el soborno.';
    const text_negative = 'Los pingüinos viven en la Antártida y comen peces.';

    try {
        const scoreSinglePos = await reranker(query, { text_pair: text_positive });
        console.log("Score PTEE (positive):", scoreSinglePos);

        const scoreSingleNeg = await reranker(query, { text_pair: text_negative });
        console.log("Score PTEE (negative):", scoreSingleNeg);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
