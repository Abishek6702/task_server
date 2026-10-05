const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: Date, required: true },
  endTime: Date,
  durationMinutes: { type: Number, min: 0, max: 1440 },
  notes: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true });

timeEntrySchema.index({ organizationId: 1, taskId: 1, startTime: -1 });
timeEntrySchema.index({ organizationId: 1, userId: 1, startTime: -1 });
timeEntrySchema.index({ organizationId: 1, projectId: 1, startTime: -1 });
timeEntrySchema.index({ organizationId: 1, userId: 1, endTime: 1 });
timeEntrySchema.index({ organizationId: 1, userId: 1 }, { unique: true, partialFilterExpression: { endTime: null } });

module.exports = mongoose.model('TimeEntry', timeEntrySchema);
