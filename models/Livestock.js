const mongoose = require('mongoose');

const livestockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // Goat / Sheep
  breed: { type: String, required: true },
  age: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, default: '🐐' }, // keep simple emoji / url
  tags: [String],
  status: { type: String, default: 'Available' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Livestock', livestockSchema);
