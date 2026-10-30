import fs from 'fs';
import path from 'path';
import { verifyAdminPin, verifyHrPin, isHrPinConfigured, issueToken } from '../utils/security.js';
import { logAnalyticsEvent } from '../utils/logger.js';
import DatabaseService from '../services/database.js';

const KV_FILE = path.join(process.cwd(), 'knowledge_version.json');

if (!isHrPinConfigured()) {
    console.warn('⚠️ HR_PIN_HASH no configurado en .env: el portal de RRHH (respuestas aprobadas) queda deshabilitado.');
}

// Un solo modal de PIN en el kiosco: el PIN de TI abre el Admin Dashboard
// (role 'admin', igual que antes) y el PIN de RRHH abre el portal de
// respuestas aprobadas con un token que el servidor exige en cada acción.
export const postVerifyPin = (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ success: false, error: 'PIN requerido' });

    if (verifyAdminPin(pin)) {
        console.log('🔓 [Security] PIN verificado con éxito');
        res.json({ success: true, role: 'admin' });
    } else if (verifyHrPin(pin)) {
        console.log('🔓 [Security] PIN de RRHH verificado con éxito');
        logAnalyticsEvent('HrPortalLogin', {});
        res.json({ success: true, role: 'rrhh', token: issueToken('rrhh') });
    } else {
        console.warn('🔒 [Security] Intento de acceso fallido (PIN incorrecto)');
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
