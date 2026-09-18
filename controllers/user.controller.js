const User = require('../models/User');

// @desc    Get users for an organization
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    const query = { organizationId: req.user.organizationId };

    // Support searching and filtering
    if (req.query.role) query.role = req.query.role;
    if (req.query.department) query.department = req.query.department;
    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const users = await User.find(query).select('-password');
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    // Super admin shouldn't be created here
    if (req.body.role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot create super_admin role' });
    }

    const user = await User.create(req.body);
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

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      req.body,
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

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  updateMe,
};
