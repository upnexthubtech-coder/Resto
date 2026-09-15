const router = require('express').Router();
const {
  listActiveOrders, updateOrderStatus, updatePaymentStatus, completeByToken, getOrderBarcode, getTableQr,
} = require('../controllers/orderController');
const { requireAuth } = require('../middleware/auth');

router.get('/active', requireAuth, listActiveOrders);
router.patch('/:id/status', requireAuth, updateOrderStatus);
router.patch('/:id/payment', requireAuth, updatePaymentStatus);
router.post('/complete/:token', requireAuth, completeByToken);
router.get('/barcode/:token', getOrderBarcode); // public - shown on customer confirmation screen too
router.get('/qr/:slug', getTableQr);
router.get('/qr/:slug/:tableNumber', getTableQr); // public - QR image is safe to print or share

module.exports = router;
