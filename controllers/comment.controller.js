const Comment = require('../models/Comment');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');

// @desc    Get comments for task
// @route   GET /api/comments/task/:taskId
// @access  Private
const getComments = async (req, res) => {
  try {
    // Verify task belongs to this organization first
    const task = await Task.findOne({ _id: req.params.taskId, organizationId: req.user.organizationId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const comments = await Comment.find({
      taskId: req.params.taskId,
      organizationId: req.user.organizationId,
    })
      .populate('userId', 'firstName lastName profileImage role')
      .sort('createdAt');

    res.status(200).json({ success: true, count: comments.length, data: comments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add comment to task
// @route   POST /api/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { taskId, message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Comment message is required' });
    }

    // Verify task access
    const task = await Task.findOne({ _id: taskId, organizationId: req.user.organizationId });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const comment = await Comment.create({
      organizationId: req.user.organizationId,
      taskId,
      userId: req.user.id,
      message: message.trim(),
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

    for (const uid of assigneeIds) {
      if (uid !== req.user.id) {
        await Notification.create({
          organizationId: req.user.organizationId,
          userId: uid,
          type: 'comment_added',
          title: 'New Comment on Your Task',
          message: `New comment on task ${task.taskCode}: "${message.trim().slice(0, 60)}${message.trim().length > 60 ? '…' : ''}"`,
          taskId: task._id,
          projectId: task.projectId,
        });
      }
    }

    // Also notify task creator if different from commenter and not an assignee
    if (
      task.createdBy &&
      task.createdBy.toString() !== req.user.id &&
      !assigneeIds.includes(task.createdBy.toString())
    ) {
      await Notification.create({
        organizationId: req.user.organizationId,
        userId: task.createdBy,
        type: 'comment_added',
        title: 'New Comment on Task',
        message: `New comment on task ${task.taskCode} you created`,
        taskId: task._id,
        projectId: task.projectId,
      });
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
    const comment = await Comment.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Only owner, project manager, or org admin can delete
    const canDelete =
      comment.userId.toString() === req.user.id ||
      req.user.role === 'organization_admin' ||
      req.user.role === 'project_manager';

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
