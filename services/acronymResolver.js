import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AcronymResolver {
    constructor() {
        this.acronyms = {};
        this._loadVocabulary();
    }

    _loadVocabulary() {
        try {
            const vocabPath = path.join(__dirname, '..', 'config', 'corporateVocabulary.json');
            if (fs.existsSync(vocabPath)) {
                const data = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
                this.acronyms = data.acronyms || {};
            }
        } catch (error) {
            console.error('[AcronymResolver] Error loading vocabulary:', error.message);
        }
    }

    /**
     * Resolves acronyms from a given text.
     * @param {string} text The text to parse.
     * @returns {string[]} An array of acronyms found in the text.
     */
    resolveAcronyms(text) {
        if (!text) return [];
        const foundAcronyms = [];
        for (const acronym of Object.keys(this.acronyms)) {
            const pattern = new RegExp(`\\b${acronym.replace(/[-]/g, '[\\-]')}\\b`, 'i');
            if (pattern.test(text)) {
                foundAcronyms.push(acronym);
            }
        }
        return foundAcronyms;
    }
}

export default new AcronymResolver();
