const Notification = require('../models/Notification');
const { parsePagination } = require('../utils/validation');

// @desc    Get all notifications for user
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    let pagination;
    try { pagination = parsePagination(req.query, { defaultLimit: 20 }); } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const { page, limit, skip } = pagination;

    const query = {
      organizationId: req.user.organizationId,
      userId: req.user.id,
    };
    if (req.query.unread === 'true') query.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query).sort('-createdAt').skip(skip).limit(limit),
      Notification.countDocuments(query),
      Notification.countDocuments({ ...query, isRead: false }),
    ]);

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), pages: Math.ceil(total / limit) },
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      isRead: false,
    });
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark single notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organizationId,
        userId: req.user.id,
      },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark ALL notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      {
        organizationId: req.user.organizationId,
        userId: req.user.id,
        isRead: false,
      },
      { isRead: true }
    );
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete single notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.user.organizationId,
      userId: req.user.id,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete all notifications for user
// @route   DELETE /api/notifications
// @access  Private
const deleteAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({
      organizationId: req.user.organizationId,
      userId: req.user.id,
    });
    res.status(200).json({ success: true, message: 'All notifications deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};
