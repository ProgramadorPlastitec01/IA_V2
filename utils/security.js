import crypto from 'crypto';

/**
 * Compara sha256(input + salt) con el hash guardado en .env (variables hashEnv/saltEnv).
 * Comparación en tiempo constante para no filtrar el hash por timing.
 */
const verifyPin = (input, hashEnv, saltEnv) => {
    try {
        const hash = process.env[hashEnv];
        const salt = process.env[saltEnv] || '';

        if (!hash) return false;

        const inputHash = crypto.createHash('sha256')
            .update(String(input) + salt)
            .digest('hex');

        const a = Buffer.from(inputHash, 'utf8');
        const b = Buffer.from(String(hash).trim().toLowerCase(), 'utf8');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (e) {
        console.error('Error en verificación de PIN:', e);
        return false;
    }
};

/**
 * Verifica si el PIN ingresado es correcto comparándolo con el hash de .env
 */
export const verifyAdminPin = (input) => {
    if (!process.env.ADMIN_PIN_HASH) {
        console.warn('⚠️ ADMIN_PIN_HASH no configurado en .env. Acceso denegado.');
        return false;
    }
    return verifyPin(input, 'ADMIN_PIN_HASH', 'ADMIN_PIN_SALT');
};

/** PIN propio de RRHH (portal de respuestas aprobadas). Sin HR_PIN_HASH el rol queda deshabilitado. */
export const isHrPinConfigured = () => !!process.env.HR_PIN_HASH;
export const verifyHrPin = (input) => isHrPinConfigured() && verifyPin(input, 'HR_PIN_HASH', 'HR_PIN_SALT');

// ── Token de sesión sin estado (portal RRHH, 2026-10-29) ─────────────────────
// `<rol>.<exp>.<hmac>`. El secreto se genera al arrancar el proceso: un reinicio
// del backend invalida las sesiones abiertas (hay que volver a ingresar el PIN).
const TOKEN_SECRET = crypto.randomBytes(32);
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

const sign = (payload) => crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');

export const issueToken = (role) => {
    const payload = `${role}.${Date.now() + TOKEN_TTL_MS}`;
    return `${payload}.${sign(payload)}`;
};

/** Rol del token si es válido y no expiró; null en otro caso. */
export const verifyToken = (token) => {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [role, exp, mac] = parts;
    const expected = Buffer.from(sign(`${role}.${exp}`), 'utf8');
    const given = Buffer.from(mac, 'utf8');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    if (!(Number(exp) > Date.now())) return null;
    return role;
};

/** Middleware: exige `Authorization: Bearer <token>` con rol rrhh. */
export const requireHr = (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (verifyToken(token) !== 'rrhh') {
        return res.status(401).json({ error: 'Sesión de RRHH inválida o expirada. Vuelve a ingresar el PIN desde el kiosco.' });
    }
    next();
};
