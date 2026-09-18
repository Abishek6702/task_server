const ActivityLog = require('../models/ActivityLog');

// @desc    Get activities for an entity
// @route   GET /api/activity/:entityType/:entityId
// @access  Private
const getActivities = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const activities = await ActivityLog.find({
      organizationId: req.user.organizationId,
      entityType,
      entityId,
    })
      .populate('userId', 'firstName lastName profileImage')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: activities.length, data: activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getActivities,
};
