import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ingestionService from '../services/ingestionService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const text = await fs.readFile(path.join(__dirname, '..', 'docs', 'RIT_PLASTITEC_01_DE_JULIO_2026_VF.md'), 'utf-8');

const chunks = ingestionService._semanticChunkingByArticle(text);
console.log(`Total chunks: ${chunks.length}`);

for (const [i, c] of chunks.entries()) {
    if (/ART[IÍ]CULO\s+89\b/i.test(c.text) || /ART[IÍ]CULO\s+110\b/i.test(c.text)) {
        console.log(`\n--- chunk ${i} (len=${c.text.length}, type=${c.blockTypes.join(',')}, section="${c.sectionTitle}") ---`);
        console.log(c.text);
    }
}
