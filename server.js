/**
 * Backend API Server — Asistente RRHH IA Plastitec
 * Arquitectura Modular: server.js → routes → controllers → services
 */

import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import os from 'os';
import path from 'path';
import { rateLimit } from 'express-rate-limit';

// Servicios
import DatabaseService from './services/database.js';
import qdrantService from './services/qdrantService.js';
import healthService from './services/healthService.js';

// Rutas
import chatRoutes from './routes/chatRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import systemRoutes from './routes/systemRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;
const APP_ROOT = process.cwd();

// --- RATE LIMITING ---
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Demasiadas peticiones. Por favor intenta más tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- MIDDLEWARES GLOBALES ---
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : null;
app.use(cors(allowedOrigins ? {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.some(o => origin.startsWith(o.trim()))) {
            callback(null, true);
        } else {
            callback(new Error(`CORS blocked: ${origin}`));
        }
    }
} : {}));
app.use(express.json());

// Servir frontend compilado
app.use('/AsistenteRRHH', express.static(path.join(APP_ROOT, 'dist')));

// --- REGISTRO DE RUTAS ---
app.use('/api', limiter); // Aplicar protección a toda la API
app.use('/api', chatRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', adminRoutes);
app.use('/api', systemRoutes);

// --- SPA FALLBACK ---
app.get(/\/AsistenteRRHH($|\/.*)/, (req, res, next) => {
    if (!req.path.includes('.')) {
        return res.sendFile(path.join(APP_ROOT, 'dist', 'index.html'));
    }
    next();
});

// API 404
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Express Error]', req.method, req.url, err.message || err);
    if (res.headersSent) return next(err);
    res.status(500).json({
        error: 'Error interno del servidor.',
        detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

import appState from './utils/state.js';
import llmService from './services/llmService.js';
import neuralRerankingService from './services/neuralRerankingService.js';

/**
 * Inicialización de Servicios y Arranque
 */
async function startServer() {
    try {
        console.log('📦 [System] Iniciando secuencia de arranque...');
        
        // 0. Pre-flight Check (Ollama, Qdrant, Modelos)
        await healthService.performPreFlightCheck();

        // 1. Inicializar SQLite
        try {
            await DatabaseService.init();
            console.log('✅ SQLite Cache Database inicializada.');
        } catch (dbError) {
            console.warn(`⚠️ SQLite error: ${dbError.message}`);
        }

        // 2. Inicializar Qdrant
        try {
            await qdrantService.createCollectionIfNotExists(768);
            console.log('✅ Qdrant collection lista.');
        } catch (qdrantError) {
            console.warn(`⚠️ Qdrant no disponible: ${qdrantError.message}`);
        }

        // 3. Warm-up LLM (Pre-carga en VRAM)
        console.log('🔥 [AI] Preparando motor de inferencia (Warm-up)...');
        await llmService.warmUp();

        // 4. Warm-up Cross-Encoder (solo si está habilitado)
        if (process.env.ENABLE_NEURAL_RERANKER === 'true') {
            console.log('🧠 [CE] Precargando modelo Cross-Encoder en memoria...');
            await neuralRerankingService.warmup();
            console.log('✅ Cross-Encoder listo.');
        }

        // 5. Listen
        app.listen(PORT, '0.0.0.0', () => {
            appState.SERVER_READY = true;
            console.log(`\n🚀 Asistente RRHH IA Backend corriendo en puerto ${PORT}`);
            
            const nets = os.networkInterfaces();
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    if (net.family === 'IPv4' && !net.internal) {
                        console.log(`   Acceso Red: http://${net.address}:${PORT}/AsistenteRRHH`);
                    }
                }
            }
            console.log(`\n[READY] Servidor totalmente operativo.`);
            
            // Mantener LLM en VRAM cada 4 minutos
            setInterval(() => llmService.keepAlive(), 240000);
        });

    } catch (error) {
        console.error('CRITICAL: Failed to start server:', error);
        process.exit(1);
    }
}



process.on('SIGINT', () => {
    console.log('\nCerrando servidor...');
    process.exit(0);
});

startServer();
