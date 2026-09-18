const Organization = require('../models/Organization');

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
    const org = await Organization.create(req.body);
    res.status(201).json({ success: true, data: org });
  } catch (error) {
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

    // OrgAdmin cannot change status
    if (req.user.role !== 'super_admin' && req.body.status) {
      delete req.body.status;
    }

    const org = await Organization.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    res.status(200).json({ success: true, data: org });
  } catch (error) {
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

    if (req.body.status) delete req.body.status; // Cannot change own status

    const org = await Organization.findByIdAndUpdate(req.user.organizationId, req.body, {
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
