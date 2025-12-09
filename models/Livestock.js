const mongoose = require('mongoose');

const livestockSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    type: { 
        type: String, 
        required: true,
        enum: ['Goat', 'Sheep'] 
    },
    breed: { 
        type: String, 
        required: true 
    },
    age: { 
        type: String, 
        required: true 
    },
    price: { 
        type: Number, 
        required: true 
    },
    image: { 
        type: String, 
        required: true 
    },
    description: {
        type: String,
        default: ''
    },
    weight: {
        type: String,
        default: ''
    },
    healthStatus: {
        type: String,
        default: 'Healthy'
    },
    tags: [String],
    status: { 
        type: String, 
        default: 'Available',
        enum: ['Available', 'Sold', 'Reserved'] 
    },
    quantity: {
        type: Number,
        default: 1
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Livestock', livestockSchema);
