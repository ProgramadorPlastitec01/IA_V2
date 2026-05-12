import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'analytics.jsonl');
const ERRORS_FILE = path.join(process.cwd(), 'errors.jsonl');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Helper to rotate logs if they exceed size limit
 */
const rotateLogIfNeeded = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return;
        
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_LOG_SIZE) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archivePath = `${filePath}.${timestamp}.bak`;
            fs.renameSync(filePath, archivePath);
            console.log(`📦 Log rotado: ${path.basename(filePath)} -> ${path.basename(archivePath)}`);
            
            // Limpieza: Mantener solo los últimos 5 archivos de backup
            const dir = path.dirname(filePath);
            const baseName = path.basename(filePath);
            const files = fs.readdirSync(dir)
                .filter(f => f.startsWith(baseName) && f.endsWith('.bak'))
                .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
                .sort((a, b) => b.time - a.time);
            
            if (files.length > 5) {
                files.slice(5).forEach(f => fs.unlinkSync(path.join(dir, f.name)));
            }
        }
    } catch (err) {
        console.error('Error en rotación de logs:', err);
    }
};

/**
 * Helper to log analytics events to JSONL file with rotation
 */
export const logAnalyticsEvent = (type, data) => {
    rotateLogIfNeeded(LOG_FILE);
    const event = {
        timestamp: new Date().toISOString(),
        type,
        ...data
    };
    fs.appendFile(LOG_FILE, JSON.stringify(event) + '\n', (err) => {
        if (err) console.error('Error writing to analytics log:', err);
    });
};

/**
 * Helper to log system errors to JSONL file with rotation
 */
export const logErrorEvent = (type, module, message, stack = null, details = {}) => {
    rotateLogIfNeeded(ERRORS_FILE);
    const errorEvent = {
        timestamp: new Date().toISOString(),
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type,
        module,
        message,
        stack: stack ? stack.split('\n').slice(0, 5).join('\n') : null,
        status: 'pending',
        details
    };
    fs.appendFile(ERRORS_FILE, JSON.stringify(errorEvent) + '\n', (err) => {
        if (err) console.error('Error writing to errors log:', err);
    });
};
