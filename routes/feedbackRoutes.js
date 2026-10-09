import express from 'express';
import * as feedbackController from '../controllers/feedbackController.js';

const router = express.Router();

// Buzón de sugerencias (kiosco)
router.post('/suggestions', feedbackController.postSuggestion);
router.get('/suggestions', feedbackController.getSuggestions);

// Calificación de respuestas (👍/😐/👎 tras cada consulta)
router.post('/rate-answer', feedbackController.postRateAnswer);
router.get('/rate-answer/stats', feedbackController.getRatingStats);

export default router;
