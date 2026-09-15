const router = require('express').Router();
const { listPublicMenu } = require('../controllers/menuController');
const { createOrder, getOrderByToken } = require('../controllers/orderController');
const { createReview } = require('../controllers/reportController');

router.get('/menu/:slug', listPublicMenu);
router.post('/orders', createOrder);
router.get('/orders/:token', getOrderByToken);
router.post('/reviews', createReview);

module.exports = router;
