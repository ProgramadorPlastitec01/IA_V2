// Serializa las llamadas a Ollama (generación de texto + embeddings).
//
// Motivo: el sistema está diseñado para operar como un kiosko de UN solo
// dispositivo, pero en las pruebas de RRHH se usaron 2 tablets contra el
// mismo backend. Ollama corre el modelo local sobre una sola GPU/CPU; dos
// requests concurrentes no se paralelizan de verdad, compiten por el mismo
// recurso y ambas terminan agotando su timeout ("proceso interrumpido") en
// vez de que una espere ordenadamente a la otra. Encolar aquí, delante del
// fetch a Ollama, convierte esa competencia en una espera predecible.
//
// OLLAMA_MAX_CONCURRENCY permite subir el límite si el hardware lo soporta;
// por defecto 1 (un solo dispositivo, comportamiento diseñado).
const MAX_CONCURRENT = parseInt(process.env.OLLAMA_MAX_CONCURRENCY, 10) || 1;

let active = 0;
const queue = [];

const runNext = () => {
    if (active >= MAX_CONCURRENT || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
        active--;
        runNext();
    });
};

/**
 * Ejecuta `fn` (una función que retorna una Promise) respetando el límite
 * de concurrencia hacia Ollama. Las llamadas en exceso quedan en cola FIFO.
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
export const runOnOllama = (fn) => {
    return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        runNext();
    });
};

export const getOllamaQueueDepth = () => queue.length + active;
