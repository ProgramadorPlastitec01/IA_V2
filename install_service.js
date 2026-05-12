import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Crear objeto Service
const svc = new Service({
  name: 'Asistente RRHH IA - Backend',
  description: 'Servidor API de IA para el Asistente de RRHH (Local RAG)',
  script: path.join(__dirname, 'server.js'),
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    },
    {
      name: 'PORT',
      value: '3000'
    }
  ]
});

// Listener para instalación
svc.on('install', () => {
  console.log('✅ Servicio "Asistente RRHH IA - Backend" instalado con éxito.');
  console.log('Iniciando servicio...');
  svc.start();
});

// Listener si ya existe
svc.on('alreadyinstalled', () => {
  console.log('⚠️ El servicio ya está instalado.');
  console.log('Reiniciando...');
  svc.stop();
  svc.start();
});

// Instalar
svc.install();
