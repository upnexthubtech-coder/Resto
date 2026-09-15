const router = require('express').Router();
const { listReviews, reviewSummary, salesReport } = require('../controllers/reportController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/reviews', listReviews);
router.get('/reviews/summary', reviewSummary);
router.get('/sales', salesReport);

module.exports = router;
