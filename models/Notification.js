const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'task_assigned', 'task_updated', 'task_completed', 'task_due_soon', 'task_overdue',
        'comment_added', 'mention',
        'project_updated', 'member_added', 'member_removed',
        'general',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ organizationId: 1, userId: 1, isRead: 1 });
notificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
