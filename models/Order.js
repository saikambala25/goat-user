const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customer: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // Keeping string for simplicity matching frontend
    items: [{
        id: String,
        name: String,
        price: Number,
        breed: String
    }],
    total: { type: Number, required: true },
    // Added 'Confirmed' for paid orders
    status: { type: String, default: 'Processing', enum: ['Processing', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'] }, 
    paymentMethod: { type: String, default: 'COD' }, // Added payment method field
    address: {
        name: String,
        phone: String,
        line: String, // Matches the 'line' field passed from frontend's order creation
        city: String,
        state: String,
        pincode: String
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
