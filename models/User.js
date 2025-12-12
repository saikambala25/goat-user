const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const cartItemSchema = new mongoose.Schema(
  {
    livestockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Livestock',
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
    },
    selected: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    name: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  cart: [cartItemSchema],
  wishlist: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Livestock',
    },
  ],
  addresses: [addressSchema],
  createdAt: { type: Date, default: Date.now },
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
