import express from 'express';
import * as systemController from '../controllers/systemController.js';

const router = express.Router();

router.get('/health', systemController.getHealth);
router.get('/system-status', systemController.getSystemStatus);
router.get('/knowledge-version', systemController.getKnowledgeVersion);

export default router;
