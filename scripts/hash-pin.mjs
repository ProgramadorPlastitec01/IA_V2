// Genera salt + hash para un PIN (formato de utils/security.js: sha256(pin + salt)).
// Uso: node scripts/hash-pin.mjs <PIN> [HR|ADMIN]
// Imprime las dos líneas para pegar en .env; el PIN no se guarda en ningún lado.
import crypto from 'crypto';

const [pin, role = 'HR'] = process.argv.slice(2);
if (!pin || !/^\d{4}$/.test(pin)) {
    console.error('Uso: node scripts/hash-pin.mjs <PIN de 4 dígitos> [HR|ADMIN]');
    process.exit(1);
}
const prefix = role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'HR';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(pin + salt).digest('hex');
console.log(`${prefix}_PIN_HASH=${hash}`);
console.log(`${prefix}_PIN_SALT=${salt}`);
