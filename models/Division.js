const mongoose = require('mongoose');

const divisionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  organizationDivisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrganizationDivision', default: null },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

divisionSchema.index({ organizationId: 1, projectId: 1 });
divisionSchema.index({ organizationId: 1, projectId: 1, name: 1 }, { unique: true });
divisionSchema.index({ organizationId: 1, members: 1 });

module.exports = mongoose.model('Division', divisionSchema);
