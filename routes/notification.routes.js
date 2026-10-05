const express = require('express');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} = require('../controllers/notification.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateObjectIdParams } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router.route('/').get(getNotifications).delete(deleteAllNotifications);
router.route('/unread-count').get(getUnreadCount);
router.route('/read-all').put(markAllAsRead);
router.route('/:id/read').all(validateObjectIdParams('id')).put(markAsRead);
router.route('/:id').all(validateObjectIdParams('id')).delete(deleteNotification);

module.exports = router;
