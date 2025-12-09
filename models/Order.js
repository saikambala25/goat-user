const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    breed: { type: String, required: true },
    quantity: { type: Number, default: 1 }
}, { _id: false });

const addressSchema = new mongoose.Schema({
    name: String,
    phone: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String
}, { _id: false });

const orderSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    customer: { 
        type: String, 
        required: true 
    },
    date: { 
        type: String, 
        required: true 
    },
    items: [orderItemSchema],
    total: { 
        type: Number, 
        required: true 
    },
    status: { 
        type: String, 
        default: 'Processing',
        enum: ['Processing', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled']
    },
    address: addressSchema,
    paymentMethod: { 
        type: String, 
        default: 'cod',
        enum: ['cod', 'upi', 'card', 'netbanking', 'wallet']
    },
    paymentStatus: {
        type: String,
        default: 'Pending',
        enum: ['Pending', 'Completed', 'Failed']
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Order', orderSchema);
