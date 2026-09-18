const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add an organization name'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Please add an organization code'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    logo: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      required: [true, 'Please add a contact email'],
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    phone: {
      type: String,
    },
    address: {
      type: String,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Organization', organizationSchema);
