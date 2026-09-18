const express = require('express');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  updateMe,
} = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Self-profile update (any authenticated user)
router.route('/me').put(updateMe);

router
  .route('/')
  .get(getUsers)
  .post(authorize('organization_admin'), createUser);

router
  .route('/:id')
  .get(getUser)
  .put(authorize('organization_admin'), updateUser);

module.exports = router;
