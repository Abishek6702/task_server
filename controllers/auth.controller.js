const User = require('../models/User');
const Organization = require('../models/Organization');
const { generateToken } = require('../utils/jwt');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { cleanString, isValidEmail, normalizeEmail } = require('../utils/validation');
const { sendPasswordResetEmail } = require('../utils/emailService');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide an email and password' });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
    const user = await User.findOne({ email: normalizedEmail }).select('+password').populate('organizationId', 'name');
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
    const { companyName, organizationCode, organizationEmail, firstName, lastName, email, password } = req.body;

    if (!companyName || !organizationCode || !organizationEmail || !firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    const name = cleanString(companyName, 'Organization name', { required: true, max: 120 });
    const code = cleanString(organizationCode, 'Organization code', { required: true, max: 20 }).toUpperCase();
    const adminFirstName = cleanString(firstName, 'First name', { required: true, max: 80 });
    const adminLastName = cleanString(lastName, 'Last name', { required: true, max: 80 });
    const adminEmail = normalizeEmail(email);
    const contactEmail = normalizeEmail(organizationEmail);
    if (!isValidEmail(adminEmail) || !isValidEmail(contactEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide valid email addresses' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Organization code must be 2-20 letters, numbers, underscores, or hyphens' });
    }

    // Check if user already exists
    let userExists = await User.findOne({ email: adminEmail });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }

    if (await Organization.exists({ code })) {
      return res.status(409).json({ success: false, message: 'Organization code already exists' });
    }

    const session = await mongoose.startSession();
    let organization;
    let user;
    try {
      await session.withTransaction(async () => {
        [organization] = await Organization.create([{ name, code, email: contactEmail, status: 'active' }], { session });
        [user] = await User.create([{
          firstName: adminFirstName,
          lastName: adminLastName,
          email: adminEmail,
          password,
          organizationId: organization._id,
          role: 'organization_admin',
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    // Generate token
    const token = generateToken(user._id, user.role, user.organizationId);

    // Don't send password back
    user = user.toObject();
    delete user.password;
    delete user.resetPasswordToken;
    delete user.resetPasswordExpire;

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
    if (typeof req.body.currentPassword !== 'string' || typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Current password and a new password of at least 8 characters are required' });
    }
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
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
    const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';
    if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    const user = await User.findOne({ email, isActive: true }).select('+resetPasswordToken');
    const genericMessage = 'If the account exists, a password reset email has been sent.';
    if (!user) return res.status(200).json({ success: true, message: genericMessage });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 20 * 60 * 1000;
    await user.save({ validateBeforeSave: false });
    try {
      await sendPasswordResetEmail({ to: user.email, name: user.firstName, token: resetToken });
    } catch (mailError) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      console.error('Password reset email delivery failed', mailError.message);
      return res.status(503).json({ success: false, message: 'Password reset email is temporarily unavailable. Please try again later.' });
    }
    res.status(200).json({ success: true, message: genericMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = typeof req.params.resettoken === 'string' ? req.params.resettoken : '';
    const password = req.body.password || req.body.newPassword;
    if (!token || typeof password !== 'string' || password.length < 8) return res.status(400).json({ success: false, message: 'A valid token and password of at least 8 characters are required' });
    const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const authToken = generateToken(user._id, user.role, user.organizationId);
    res.status(200).json({ success: true, token: authToken });
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
