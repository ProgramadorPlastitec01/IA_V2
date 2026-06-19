import express from 'express';
import { rateLimit } from 'express-rate-limit';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

const pinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Demasiados intentos. Intenta más tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

router.post('/verify-pin', pinLimiter, adminController.postVerifyPin);
router.post('/bump-knowledge-version', adminController.postBumpKnowledgeVersion);

export default router;
