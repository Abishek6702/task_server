const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a project name'],
      trim: true,
    },
    projectCode: {
      type: String,
      required: [true, 'Please add a project code'],
      uppercase: true,
      trim: true,
    },
    description: String,
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    startDate: Date,
    dueDate: Date,
    status: {
      type: String,
      enum: ['Planning', 'Active', 'On Hold', 'Completed', 'Archived'],
      default: 'Planning',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for tenant isolation and fast lookups
projectSchema.index({ organizationId: 1 });
projectSchema.index({ organizationId: 1, projectCode: 1 }, { unique: true });

module.exports = mongoose.model('Project', projectSchema);
