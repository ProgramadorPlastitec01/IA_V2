import express from 'express';
import * as modelBenchmarkController from '../controllers/modelBenchmarkController.js';

const router = express.Router();

router.get('/model-benchmark/dataset', modelBenchmarkController.getDataset);
router.get('/model-benchmark/available-models', modelBenchmarkController.getAvailableModels);
router.post('/model-benchmark/run', modelBenchmarkController.runBenchmark);
router.get('/model-benchmark/runs', modelBenchmarkController.listRuns);
router.post('/model-benchmark/promote', modelBenchmarkController.promoteCandidate);

export default router;
