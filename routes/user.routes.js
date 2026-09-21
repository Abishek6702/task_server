const express = require('express');
const {
  getUsers,
  searchMentionUsers,
  getUser,
  createUser,
  updateUser,
  updateMe,
} = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

// Self-profile update (any authenticated user)
router.route('/me').put(updateMe);
router.get('/mention-search', searchMentionUsers);

router
  .route('/')
  .get(getUsers)
  .post(authorize('organization_admin'), createUser);

router
  .route('/:id')
  .all(validateObjectIdParams('id'))
  .get(getUser)
  .put(authorize('organization_admin'), updateUser);

module.exports = router;
