import express from 'express';
import * as analyticsController from '../controllers/analyticsController.js';

const router = express.Router();

router.post('/analytics', analyticsController.postAnalytics);
router.get('/analytics', analyticsController.getAnalytics);
router.get('/analytics/quality', analyticsController.getQualityReport);
router.get('/system-errors', analyticsController.getSystemErrors);
router.get('/system-errors/grouped', analyticsController.getGroupedSystemErrors);
router.post('/system-errors/resolve', analyticsController.postResolveError);
router.post('/system-errors/resolve-bulk', analyticsController.postResolveBulk);
router.post('/report-error', analyticsController.postReportError);

export default router;
