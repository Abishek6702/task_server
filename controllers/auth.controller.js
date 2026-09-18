const User = require('../models/User');
const Organization = require('../models/Organization');
const { generateToken } = require('../utils/jwt');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide an email and password' });
    }

    const user = await User.findOne({ email }).select('+password').populate('organizationId', 'name');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'User account is deactivated' });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    const token = generateToken(user._id, user.role, user.organizationId);

    // Don't send password in response
    user.password = undefined;

    res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Register new organization and admin user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { companyName, firstName, lastName, email, password } = req.body;

    if (!companyName || !firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    // Check if user already exists
    let userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }

    // Create Organization
    const organization = await Organization.create({
      name: companyName,
      status: 'active',
    });

    // Create User as Organization Admin
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      organizationId: organization._id,
      role: 'organization_admin',
    });

    // Generate token
    const token = generateToken(user._id, user.role, user.organizationId);

    // Don't send password back
    user.password = undefined;

    res.status(201).json({
      success: true,
      token,
      user,
      organization,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!await user.matchPassword(req.body.currentPassword)) {
      return res.status(401).json({ success: false, message: 'Incorrect current password' });
    }
    user.password = req.body.newPassword;
    await user.save();
    const token = generateToken(user._id, user.role, user.organizationId);
    res.status(200).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json({ success: false, message: 'No user with that email' });

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // In a real app, send an email here. For now, log the token.
    console.log(`\n=================================================`);
    console.log(`PASSWORD RESET TOKEN GENERATED`);
    console.log(`User: ${user.email}`);
    console.log(`Token: ${resetToken}`);
    console.log(`Use this token in the /api/auth/resetpassword/:token route.`);
    console.log(`=================================================\n`);

    // Mock sending email
    res.status(200).json({ success: true, message: 'Reset token generated (check server console)', resetToken });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.resettoken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const token = generateToken(user._id, user.role, user.organizationId);
    res.status(200).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  register,
  getMe,
  updatePassword,
  forgotPassword,
  resetPassword
};
