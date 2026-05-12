import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const svc = new Service({
  name: 'Asistente RRHH IA - Backend',
  script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', () => {
  console.log('✅ Servicio desinstalado.');
});

svc.uninstall();
