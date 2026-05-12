import crypto from 'crypto';

/**
 * Verifica si el PIN ingresado es correcto comparándolo con el hash de .env
 */
export const verifyAdminPin = (input) => {
    try {
        const hash = process.env.ADMIN_PIN_HASH;
        const salt = process.env.ADMIN_PIN_SALT || '';
        
        if (!hash) {
            console.warn('⚠️ ADMIN_PIN_HASH no configurado en .env. Acceso denegado.');
            return false;
        }

        const inputHash = crypto.createHash('sha256')
            .update(String(input) + salt)
            .digest('hex');
            
        return inputHash === hash;
    } catch (e) { 
        console.error('Error en verificación de PIN:', e);
        return false; 
    }
};
