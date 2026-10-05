const ActivityLog = require('../models/ActivityLog');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { parsePagination } = require('../utils/validation');

// @desc    Get activities for an entity
// @route   GET /api/activity/:entityType/:entityId
// @access  Private
const getActivities = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
    const { entityType, entityId } = req.params;
    if (entityType === 'task') {
      const task = await Task.findOne({ _id: entityId, organizationId: req.user.organizationId }).select('projectId assignedTo');
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
      const project = await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId }).select('managerId members');
      const allowed = req.user.role === 'organization_admin' || String(project?.managerId) === req.user.id || project?.members.some(id => String(id) === req.user.id);
      if (req.user.role === 'employee' && !(task.assignedTo || []).some(id => String(id) === req.user.id)) return res.status(403).json({ success: false, message: 'Not authorized to view task activity' });
      if (!allowed && req.user.role !== 'employee') return res.status(403).json({ success: false, message: 'Not authorized to view task activity' });
    }

    const activityQuery = {
      organizationId: req.user.organizationId,
      entityType,
      entityId,
    };
    const [total, activities] = await Promise.all([
      ActivityLog.countDocuments(activityQuery),
      ActivityLog.find(activityQuery).populate('userId', 'firstName lastName profileImage').sort('-createdAt').skip(skip).limit(limit),
    ]);

    res.status(200).json({ success: true, count: activities.length, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), pages: Math.ceil(total / limit) }, data: activities });
  } catch (error) {
    if (/Page|Limit/.test(error.message)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getActivities,
};
