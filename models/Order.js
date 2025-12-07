const mongoose = require('mongoose');

const trackingStepSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema({
  customer: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  items: [
    {
      id: String,
      name: String,
      price: Number,
      breed: String,
      image: String,
    },
  ],
  total: { type: Number, required: true },
  status: { type: String, default: 'Processing' },
  paymentMethod: { type: String, enum: ['cod', 'upi', 'card'], default: 'cod' },
  address: {
    name: String,
    phone: String,
    line: String,
    city: String,
    state: String,
    pincode: String,
  },
  tracking: [trackingStepSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Order', orderSchema);
