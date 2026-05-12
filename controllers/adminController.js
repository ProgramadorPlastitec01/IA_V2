import fs from 'fs';
import path from 'path';
import { verifyAdminPin } from '../utils/security.js';
import { logAnalyticsEvent } from '../utils/logger.js';
import DatabaseService from '../services/database.js';

const KV_FILE = path.join(process.cwd(), 'knowledge_version.json');

export const postVerifyPin = (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ success: false, error: 'PIN requerido' });

    if (verifyAdminPin(pin)) {
        console.log('🔓 [Security] PIN verificado con éxito');
        res.json({ success: true });
    } else {
        console.warn('🔒 [Security] Intento de acceso fallido con PIN:', pin);
        res.json({ success: false, error: 'PIN incorrecto' });
    }
};

export const postBumpKnowledgeVersion = async (req, res) => {
    try {
        let currentVersion = 0;
        try {
            if (fs.existsSync(KV_FILE)) {
                const data = JSON.parse(fs.readFileSync(KV_FILE, 'utf8'));
                currentVersion = data.version || 0;
            }
        } catch (e) {}

        const newVersion = currentVersion + 1;

        fs.writeFileSync(KV_FILE, JSON.stringify({
            version: newVersion,
            updatedAt: new Date().toISOString()
        }), 'utf8');

        const stale = await DatabaseService.getStaleRecords(newVersion, 1000);

        console.log(`📚 [KnowledgeVersion] Bumped a v${newVersion}. Registros a revalidar: ${stale.length}`);
        logAnalyticsEvent('KnowledgeVersionBumped', { version: newVersion, staleCount: stale.length });

        res.json({
            success: true,
            version: newVersion,
            staleRecords: stale.length,
            message: `Knowledge Base actualizado a v${newVersion}.`
        });
    } catch (error) {
        console.error('Error bumping knowledge version:', error);
        res.status(500).json({ error: error.message });
    }
};
