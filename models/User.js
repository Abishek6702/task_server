const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'Please add a first name'],
    },
    lastName: {
      type: String,
      required: [true, 'Please add a last name'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
      lowercase: true,
      trim: true,
    },
    phone: String,
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false, // Don't return password by default
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: function() { return this.role !== 'super_admin'; }, // super_admin doesn't need an org
    },
    role: {
      type: String,
      enum: [
        'super_admin',
        'organization_admin',
        'project_manager',
        'team_lead',
        'employee',
        'viewer'
      ],
      default: 'employee',
    },
    profileImage: String,
    department: String,
    designation: String,
    divisionCapabilities: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationDivision',
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure email is unique per organization
userSchema.index({ email: 1, organizationId: 1 }, { unique: true });
userSchema.index({ organizationId: 1, isActive: 1 });
userSchema.index({ organizationId: 1, createdAt: -1 });
userSchema.index({ organizationId: 1, divisionCapabilities: 1 });

// Encrypt password using bcrypt
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  // Skip if already bcrypt-hashed (e.g. from seed script)
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
