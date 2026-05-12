import express from 'express';
import * as chatController from '../controllers/chatController.js';

const router = express.Router();

router.post('/query', chatController.postQuery);
router.post('/reset', chatController.postReset);

export default router;
