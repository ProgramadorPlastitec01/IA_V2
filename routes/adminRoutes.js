import express from 'express';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

router.post('/verify-pin', adminController.postVerifyPin);
router.post('/bump-knowledge-version', adminController.postBumpKnowledgeVersion);

export default router;
