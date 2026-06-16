import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';

async function scan() {
    const dir = 'c:/AIV2/docs';
    const files = await fs.readdir(dir);
    
    for (const f of files) {
        if (!f.endsWith('.pdf')) continue;
        const buf = await fs.readFile(path.join(dir, f));
        try {
            const data = await pdfParse(buf);
            const text = data.text.toLowerCase();
            if (text.includes('ropa de calle') || text.includes('zapatos') || text.includes('protocolo de ingreso')) {
                console.log(`\n=== MATCH IN FILE: ${f} ===`);
                const lines = data.text.split('\n');
                for(let i=0; i<lines.length; i++) {
                    const l = lines[i].toLowerCase();
                    if (l.includes('ropa de calle') || l.includes('zapatos') || l.includes('protocolo')) {
                        console.log(`[${i-1}] ${lines[i-1]}`);
                        console.log(`[${i}] ${lines[i]}`);
                        console.log(`[${i+1}] ${lines[i+1]}`);
                        console.log('---');
                    }
                }
            }
        } catch (e) {
            console.error(`Error reading ${f}: ${e.message}`);
        }
    }
}
scan().catch(console.error);
