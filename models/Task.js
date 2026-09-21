const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    taskCode: {
      type: String,
      required: [true, 'Please add a task code'],
      uppercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Please add a task title'],
      trim: true,
    },
    description: String,
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    divisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    assignedTo: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reportingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['To Do', 'In Progress', 'Review', 'Done', 'Blocked', 'On Hold', 'Cancelled'],
      default: 'To Do',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    startDate: Date,
    dueDate: Date,
    estimatedHours: Number,
    actualHours: Number,
    labels: [String],
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
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    completedAt: Date,
    dependencies: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    }]
  },
  {
    timestamps: true,
  }
);

// Indexes
taskSchema.index({ organizationId: 1 });
taskSchema.index({ organizationId: 1, taskCode: 1 }, { unique: true });
taskSchema.index({ organizationId: 1, projectId: 1 });
taskSchema.index({ organizationId: 1, assignedTo: 1 }); // works with arrays too
taskSchema.index({ organizationId: 1, status: 1 });
taskSchema.index({ organizationId: 1, dueDate: 1 });
taskSchema.index({ organizationId: 1, parentTaskId: 1 });
taskSchema.index({ organizationId: 1, projectId: 1, status: 1 });
taskSchema.index({ organizationId: 1, projectId: 1, divisionId: 1 });
taskSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Task', taskSchema);
