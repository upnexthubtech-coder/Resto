const router = require('express').Router();
const { signup, login, createStaff } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.post('/signup', signup);
router.post('/login', login);
router.post('/staff', requireAuth, requireRole('owner'), createStaff);

module.exports = router;
