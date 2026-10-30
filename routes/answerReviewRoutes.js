import express from 'express';
import * as answerReviewController from '../controllers/answerReviewController.js';
import { requireHr } from '../utils/security.js';

const router = express.Router();

// Portal RRHH — respuestas aprobadas. Todo exige token de rol rrhh (ver /verify-pin).
router.get('/answer-reviews', requireHr, answerReviewController.getAnswerReviews);
router.get('/answer-reviews/:id/history', requireHr, answerReviewController.getAnswerReviewHistory);
router.post('/answer-reviews/:id/approve', requireHr, answerReviewController.postApprove);
router.post('/answer-reviews/:id/reject', requireHr, answerReviewController.postReject);
router.post('/answer-reviews/:id/revoke', requireHr, answerReviewController.postRevoke);

export default router;
