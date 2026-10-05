const Comment = require('../models/Comment');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const Project = require('../models/Project');
const { parsePagination } = require('../utils/validation');
const notificationService = require('../utils/notificationService');

const getValidMentions = async (mentions, organizationId, task, project) => {
  const ids = [...new Set((Array.isArray(mentions) ? mentions : []).map(String))];
  if (ids.some(id => !/^[a-f\d]{24}$/i.test(id))) throw new Error('One or more mention IDs are invalid');
  if (!ids.length) return [];
  const allowed = new Set([String(project.managerId), ...project.members.map(String)]);
  const users = await require('../models/User').find({ _id: { $in: ids }, organizationId, isActive: true }).select('_id');
  if (users.length !== ids.length || ids.some(id => !allowed.has(id))) throw new Error('Mentioned users must be active members of this project');
  return ids;
};

// @desc    Get comments for task
// @route   GET /api/comments/task/:taskId
// @access  Private
const getComments = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
    // Verify task belongs to this organization first
    const task = await Task.findOne({ _id: req.params.taskId, organizationId: req.user.organizationId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (req.user.role === 'employee' && !(task.assignedTo || []).some(id => String(id) === req.user.id)) return res.status(403).json({ success: false, message: 'Not authorized to view comments on this task' });

    const commentQuery = {
      taskId: req.params.taskId,
      organizationId: req.user.organizationId,
    };
    const [total, comments] = await Promise.all([
      Comment.countDocuments(commentQuery),
      Comment.find(commentQuery).populate('userId', 'firstName lastName profileImage role').sort('createdAt').skip(skip).limit(limit),
    ]);

    res.status(200).json({ success: true, count: comments.length, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), pages: Math.ceil(total / limit) }, data: comments });
  } catch (error) {
    if (/Page|Limit/.test(error.message)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add comment to task
// @route   POST /api/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create comments' });
    const { taskId, message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Comment message is required' });
    }

    // Verify task access
    const task = await Task.findOne({ _id: taskId, organizationId: req.user.organizationId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const project = await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId });
    if (!project) return res.status(404).json({ success: false, message: 'Task project not found' });
    const canComment = req.user.role !== 'employee'
      ? (req.user.role === 'organization_admin' || project.managerId.toString() === req.user.id || project.members.some(id => id.toString() === req.user.id))
      : (task.assignedTo || []).some(id => String(id) === req.user.id);
    if (!canComment) return res.status(403).json({ success: false, message: 'Not authorized to comment on this task' });

    let mentions;
    try { mentions = await getValidMentions(req.body.mentions, req.user.organizationId, task, project); } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    const comment = await Comment.create({
      organizationId: req.user.organizationId,
      taskId,
      userId: req.user.id,
      message: message.trim(),
      mentions,
    });

    // Populate user for response
    const populated = await Comment.findById(comment._id).populate('userId', 'firstName lastName profileImage role');

    await ActivityLog.create({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      entityType: 'task',
      entityId: taskId,
      action: 'comment_added',
      metadata: { taskCode: task.taskCode },
    });

    // Notify task assignees if they're not the commenter
    const assignees = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
    const assigneeIds = assignees.map(id => id.toString());

    const recipientIds = new Set(assigneeIds.filter(uid => uid !== req.user.id));
    if (task.createdBy && task.createdBy.toString() !== req.user.id) recipientIds.add(task.createdBy.toString());
    const mentionIds = mentions.filter(uid => uid !== req.user.id);
    const notifications = [...recipientIds].map(uid => ({
          organizationId: req.user.organizationId,
          userId: uid,
          type: 'comment_added',
          title: 'New Comment on Your Task',
          message: `New comment on task ${task.taskCode}: "${message.trim().slice(0, 60)}${message.trim().length > 60 ? '…' : ''}"`,
          taskId: task._id,
          projectId: task.projectId,
        }));
    for (const uid of mentionIds) {
      const existingIndex = notifications.findIndex(notification => String(notification.userId) === uid);
      const mentionNotification = { organizationId: req.user.organizationId, userId: uid, type: 'mention', title: 'You were mentioned', message: `${req.user.firstName || 'A teammate'} mentioned you on task ${task.taskCode}`, taskId: task._id, projectId: task.projectId };
      if (existingIndex >= 0) notifications[existingIndex] = mentionNotification;
      else notifications.push(mentionNotification);
    }

    // Also notify task creator if different from commenter and not an assignee
    if (notifications.length) {
      await notificationService.createMany(notifications);
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update own comment
// @route   PUT /api/comments/:id
// @access  Private
const updateComment = async (req, res) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot edit comments' });
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Comment message is required' });
    }

    const comment = await Comment.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Only owner or org admin can edit
    if (comment.userId.toString() !== req.user.id && req.user.role !== 'organization_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this comment' });
    }

    comment.message = message.trim();
    comment.editedAt = new Date();
    await comment.save();

    const populated = await Comment.findById(comment._id).populate('userId', 'firstName lastName profileImage role');
    res.status(200).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete comment
// @route   DELETE /api/comments/:id
// @access  Private
const deleteComment = async (req, res) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot delete comments' });
    const comment = await Comment.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const task = await Task.findOne({ _id: comment.taskId, organizationId: req.user.organizationId }).select('projectId');
    const project = task && await Project.findOne({ _id: task.projectId, organizationId: req.user.organizationId }).select('managerId');

    // Only owner, project manager, or org admin can delete
    const canDelete =
      comment.userId.toString() === req.user.id ||
      req.user.role === 'organization_admin' ||
      (req.user.role === 'project_manager' && project?.managerId.toString() === req.user.id);

    if (!canDelete) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    await Comment.findByIdAndDelete(comment._id);
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getComments,
  addComment,
  updateComment,
  deleteComment,
};
