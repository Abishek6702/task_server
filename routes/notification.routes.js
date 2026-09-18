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

const router = express.Router();

router.use(protect);

router.route('/').get(getNotifications).delete(deleteAllNotifications);
router.route('/unread-count').get(getUnreadCount);
router.route('/read-all').put(markAllAsRead);
router.route('/:id/read').put(markAsRead);
router.route('/:id').delete(deleteNotification);

module.exports = router;
