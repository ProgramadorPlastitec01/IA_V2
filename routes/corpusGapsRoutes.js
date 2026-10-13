import express from 'express';
import * as corpusGapsController from '../controllers/corpusGapsController.js';

const router = express.Router();

router.get('/analytics/corpus-gaps', corpusGapsController.getCorpusGaps);
router.get('/glosario/terms', corpusGapsController.listGlossaryTerms);
router.post('/glosario/add-term', corpusGapsController.addGlossaryTerm);
router.post('/corpus-gaps/mark-rechunk', corpusGapsController.markForRechunking);

export default router;
