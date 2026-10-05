const Organization = require('../models/Organization');
const { cleanString, normalizeEmail, isValidEmail } = require('../utils/validation');

const organizationUpdates = (body) => {
  const allowed = ['name', 'logo', 'email', 'phone', 'address'];
  const updates = {};
  for (const field of allowed) if (body[field] !== undefined) updates[field] = body[field];
  if (updates.name !== undefined) updates.name = cleanString(updates.name, 'Organization name', { required: true, max: 120 });
  if (updates.email !== undefined) {
    updates.email = normalizeEmail(updates.email);
    if (!isValidEmail(updates.email)) throw new Error('Organization email is invalid');
  }
  return updates;
};

// @desc    Get all organizations (Super Admin only)
// @route   GET /api/organizations
// @access  Private/SuperAdmin
const getOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find();
    res.status(200).json({ success: true, data: orgs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single organization
// @route   GET /api/organizations/:id
// @access  Private
const getOrganization = async (req, res) => {
  try {
    // If not super admin, can only get their own organization
    if (req.user.role !== 'super_admin' && req.user.organizationId.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const org = await Organization.findById(req.params.id);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    res.status(200).json({ success: true, data: org });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create organization
// @route   POST /api/organizations
// @access  Private/SuperAdmin
const createOrganization = async (req, res) => {
  try {
    const data = organizationUpdates(req.body);
    data.code = cleanString(req.body.code, 'Organization code', { required: true, max: 20 }).toUpperCase();
    if (!/^[A-Z0-9_-]{2,20}$/.test(data.code)) return res.status(400).json({ success: false, message: 'Organization code is invalid' });
    if (req.body.status !== undefined) data.status = req.body.status;
    const org = await Organization.create(data);
    res.status(201).json({ success: true, data: org });
  } catch (error) {
    if (error.message.includes('Organization') || error.code === 11000) return res.status(400).json({ success: false, message: error.code === 11000 ? 'Organization code already exists' : error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update organization
// @route   PUT /api/organizations/:id
// @access  Private/SuperAdmin or OrgAdmin(own org)
const updateOrganization = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.organizationId.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updates = organizationUpdates(req.body);
    if (req.user.role === 'super_admin' && req.body.status !== undefined) {
      if (!['active', 'inactive', 'suspended'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Invalid organization status' });
      updates.status = req.body.status;
    }

    const org = await Organization.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    res.status(200).json({ success: true, data: org });
  } catch (error) {
    if (error.message.includes('Organization')) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current organization
// @route   GET /api/organizations/me
// @access  Private
const getMyOrganization = async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    res.status(200).json({ success: true, data: org });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update current organization
// @route   PUT /api/organizations/me
// @access  Private/OrgAdmin
const updateMyOrganization = async (req, res) => {
  try {
    if (req.user.role !== 'organization_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updates = organizationUpdates(req.body);

    const org = await Organization.findByIdAndUpdate(req.user.organizationId, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, data: org });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  getMyOrganization,
  updateMyOrganization,
};
