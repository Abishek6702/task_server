const User = require('../models/User');
const OrganizationDivision = require('../models/OrganizationDivision');
const { parsePagination } = require('../utils/validation');
const { normalizeEmail, cleanString, isValidEmail } = require('../utils/validation');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Get users for an organization
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
    const query = { organizationId: req.user.organizationId };

    // Support searching and filtering
    if (req.query.role) query.role = req.query.role;
    if (req.query.department) query.department = req.query.department;
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).slice(0, 80));
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query).select('-password').sort('-createdAt').skip(skip).limit(limit),
    ]);
    res.status(200).json({ success: true, count: users.length, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), pages: Math.ceil(total / limit) }, data: users });
  } catch (error) {
    if (/Page|Limit/.test(error.message)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
};

const searchMentionUsers = async (req, res) => {
  try {
    const task = await require('../models/Task').findOne({ _id: req.query.taskId, organizationId: req.user.organizationId }).select('projectId');
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    const project = await require('../models/Project').findOne({ _id: task.projectId, organizationId: req.user.organizationId }).select('managerId members');
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    if (req.user.role !== 'organization_admin' && String(project.managerId) !== req.user.id && !project.members.some(id => String(id) === req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view task users' });
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    const memberIds = [...new Set([String(project.managerId), ...project.members.map(String)])];
    const query = { _id: { $in: memberIds }, organizationId: req.user.organizationId, isActive: true };
    if (search) query.$or = [{ firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const users = await User.find(query).select('_id firstName lastName email').sort('firstName lastName').limit(10);
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to search mention users' });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
const getUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    }).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create user (Org Admin)
// @route   POST /api/users
// @access  Private/OrgAdmin
const createUser = async (req, res) => {
  try {
    // Enforce tenant isolation
    req.body.organizationId = req.user.organizationId;

    // Super admin should never be created through tenant administration.
    if (req.body.role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot create super_admin role' });
    }

    const allowed = ['firstName', 'lastName', 'email', 'password', 'role', 'department', 'designation', 'phone', 'divisionCapabilities'];
    const data = {};
    allowed.forEach(field => { if (req.body[field] !== undefined) data[field] = req.body[field]; });
    data.organizationId = req.user.organizationId;
    if (data.divisionCapabilities !== undefined) {
      if (!Array.isArray(data.divisionCapabilities)) return res.status(400).json({ success: false, message: 'Division capabilities must be an array' });
      const capabilities = [...new Set(data.divisionCapabilities.map(String))];
      const count = await OrganizationDivision.countDocuments({ _id: { $in: capabilities }, organizationId: req.user.organizationId, isActive: true });
      if (count !== capabilities.length) return res.status(400).json({ success: false, message: 'Division capabilities must belong to this organization' });
      data.divisionCapabilities = capabilities;
    }
    data.firstName = cleanString(data.firstName, 'First name', { required: true, max: 80 });
    data.lastName = cleanString(data.lastName, 'Last name', { required: true, max: 80 });
    data.email = normalizeEmail(data.email || '');
    if (!isValidEmail(data.email)) return res.status(400).json({ success: false, message: 'A valid email is required' });
    if (typeof data.password !== 'string' || data.password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    const user = await User.create(data);
    user.password = undefined;

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already exists in this organization' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/OrgAdmin
const updateUser = async (req, res) => {
  try {
    // Prevent changing organization ID
    delete req.body.organizationId;
    delete req.body.password; // use separate route for password change
    delete req.body._id;
    delete req.body.organizationId;
    if (req.body.role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot assign super_admin role from an organization' });
    }
    const allowed = ['firstName', 'lastName', 'email', 'phone', 'department', 'designation', 'role', 'isActive', 'divisionCapabilities'];
    const updates = {};
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });
    if (updates.firstName !== undefined) updates.firstName = cleanString(updates.firstName, 'First name', { required: true, max: 80 });
    if (updates.lastName !== undefined) updates.lastName = cleanString(updates.lastName, 'Last name', { required: true, max: 80 });
    if (updates.email !== undefined) {
      updates.email = normalizeEmail(updates.email);
      if (!isValidEmail(updates.email)) return res.status(400).json({ success: false, message: 'Email is invalid' });
    }
    if (updates.divisionCapabilities !== undefined) {
      if (!Array.isArray(updates.divisionCapabilities)) return res.status(400).json({ success: false, message: 'Division capabilities must be an array' });
      const capabilities = [...new Set(updates.divisionCapabilities.map(String))];
      const count = await OrganizationDivision.countDocuments({ _id: { $in: capabilities }, organizationId: req.user.organizationId, isActive: true });
      if (count !== capabilities.length) return res.status(400).json({ success: false, message: 'Division capabilities must belong to this organization' });
      updates.divisionCapabilities = capabilities;
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update own profile (self)
// @route   PUT /api/users/me
// @access  Private
const updateMe = async (req, res) => {
  try {
    // Fields a user is allowed to update on their own profile
    const allowed = ['firstName', 'lastName', 'phone', 'department', 'designation'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    updates.firstName = cleanString(updates.firstName, 'First name', { required: true, max: 80 });
    updates.lastName = cleanString(updates.lastName, 'Last name', { required: true, max: 80 });
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, organizationId: req.user.organizationId },
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUsers,
  searchMentionUsers,
  getUser,
  createUser,
  updateUser,
  updateMe,
};
