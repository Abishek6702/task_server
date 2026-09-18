const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: [true, 'Please add a message'],
    },
    attachments: [
      {
        fileName: String,
        originalName: String,
        mimeType: String,
        size: Number,
        path: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    editedAt: Date,
  },
  {
    timestamps: true,
  }
);

commentSchema.index({ organizationId: 1, taskId: 1 });

module.exports = mongoose.model('Comment', commentSchema);
