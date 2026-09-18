const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
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
    entityType: {
      type: String,
      enum: ['task', 'project', 'user', 'organization'],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      required: true, // e.g., 'created', 'updated', 'status_changed', 'comment_added'
    },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed, // Any additional context
  },
  {
    timestamps: true,
  }
);

activityLogSchema.index({ organizationId: 1, entityId: 1 });
activityLogSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
