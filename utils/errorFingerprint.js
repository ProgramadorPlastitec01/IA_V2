import crypto from 'crypto';

/**
 * Normaliza un mensaje de error para agrupar ocurrencias equivalentes:
 * colapsa números, IDs, timestamps y rutas variables que de otro modo
 * harían que el mismo error produjera un fingerprint distinto cada vez.
 */
export function normalizeErrorMessage(message) {
    return String(message || '')
        .toLowerCase()
        .replace(/[0-9a-f]{8,}/gi, '#')        // hashes/ids largos
        .replace(/\d+/g, '#')                   // números sueltos
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fingerprint estable de un error: mismo type+module+mensaje normalizado
 * siempre produce el mismo hash, independientemente de timestamp/id/stack.
 */
export function fingerprintError({ type, module, message }) {
    const key = `${type || ''}|${module || ''}|${normalizeErrorMessage(message)}`;
    return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/**
 * Extrae plataforma (SO) y navegador desde un userAgent, para agrupar/mostrar
 * sin reimplementar toda la lógica de detección del frontend.
 */
export function parsePlatform(userAgent) {
    const ua = String(userAgent || '');
    let os = 'Desconocido';
    if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/mac os/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    let browser = 'Desconocido';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/chrome\//i.test(ua)) browser = 'Chrome';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/safari\//i.test(ua)) browser = 'Safari';

    return { os, browser };
}
