const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ organizationId: 1, name: 1 }, { unique: true });
schema.index({ organizationId: 1, isActive: 1 });

module.exports = mongoose.model('OrganizationDivision', schema);
