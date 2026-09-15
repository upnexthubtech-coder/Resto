const router = require('express').Router();
const {
  createCategory, listCategories, deleteCategory,
  upsertItem, toggleAvailability, deleteItem, listItemsForAdmin,
} = require('../controllers/menuController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.post('/categories', createCategory);
router.get('/categories', listCategories);
router.delete('/categories/:id', deleteCategory);

router.post('/items', upsertItem);
router.get('/items', listItemsForAdmin);
router.patch('/items/:id/availability', toggleAvailability);
router.delete('/items/:id', deleteItem);

module.exports = router;
