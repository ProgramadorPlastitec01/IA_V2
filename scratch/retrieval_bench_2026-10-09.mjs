// Compara modelos de embeddings en búsqueda SEMÁNTICA PURA (sin BM25, sin
// reranking, sin LLM): ¿en qué posición aparece el fragmento que responde?
// Gold: scratch/retrieval_gold_2026-10-09.json [{i, question, doc, needles[]}]
// Uso: node scratch/retrieval_bench_2026-10-09.mjs
import fs from 'fs';

const CONFIGS = [
    { name: 'mxbai-embed-large', model: 'mxbai-embed-large', collection: 'plastitec_docs_p0' },
    { name: 'bge-m3',            model: 'bge-m3',            collection: 'plastitec_docs_bge' },
];
const TOPK = 10;
const gold = JSON.parse(fs.readFileSync('scratch/retrieval_gold_2026-10-09.json', 'utf8'));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

async function embed(model, text) {
    const r = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST', body: JSON.stringify({ model, prompt: text }),
    }).then(x => x.json());
    if (!r.embedding) throw new Error(`embedding vacío (${model})`);
    return r.embedding;
}
async function search(collection, vector) {
    const r = await fetch(`http://localhost:6333/collections/${collection}/points/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector, limit: TOPK, with_payload: true }),
    }).then(x => x.json());
    return r.result || [];
}
const isHit = (p, g) => {
    if (g.doc && !String(p.payload.fuente || '').toLowerCase().includes(g.doc.toLowerCase().replace(/\.md$/, ''))) return false;
    const t = norm(p.payload.texto_original);
    return g.needles.some(n => t.includes(norm(n)));
};

const rows = [];
for (const cfg of CONFIGS) {
    for (const g of gold) {
        const hits = await search(cfg.collection, await embed(cfg.model, g.question));
        const rank = hits.findIndex(p => isHit(p, g)) + 1; // 0 = no está en top-K
        rows.push({ cfg: cfg.name, i: g.i, rank, question: g.question });
    }
}

const summary = {};
for (const cfg of CONFIGS) {
    const r = rows.filter(x => x.cfg === cfg.name);
    const at = (k) => r.filter(x => x.rank >= 1 && x.rank <= k).length;
    summary[cfg.name] = {
        n: r.length,
        'hit@1': at(1), 'hit@3': at(3), 'hit@5': at(5), [`hit@${TOPK}`]: at(TOPK),
        MRR: (r.reduce((s, x) => s + (x.rank ? 1 / x.rank : 0), 0) / r.length).toFixed(3),
    };
}
console.table(summary);

// Preguntas donde los modelos difieren más
const by = new Map();
for (const x of rows) { if (!by.has(x.i)) by.set(x.i, { q: x.question }); by.get(x.i)[x.cfg] = x.rank; }
const diffs = [...by.values()].map(v => ({ ...v, d: (v['bge-m3'] || 99) - (v['mxbai-embed-large'] || 99) }))
    .filter(v => v.d !== 0).sort((a, b) => a.d - b.d);
console.log('\nMejora bge-m3 (rango mxbai → bge-m3; 0 = fuera del top-10):');
diffs.filter(v => v.d < 0).slice(0, 12).forEach(v => console.log(`  ${v['mxbai-embed-large']} → ${v['bge-m3']} | ${v.q.slice(0, 80)}`));
console.log('\nEmpeora bge-m3:');
diffs.filter(v => v.d > 0).slice(-12).forEach(v => console.log(`  ${v['mxbai-embed-large']} → ${v['bge-m3']} | ${v.q.slice(0, 80)}`));
fs.writeFileSync('scratch/retrieval_bench_2026-10-09.json', JSON.stringify({ summary, rows }, null, 1));
