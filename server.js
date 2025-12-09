const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Models
const Livestock = require('./models/Livestock');
const Order = require('./models/Order');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'livestockmart-secret-key-2024';

// Middleware - Allow all origins for Vercel deployment
app.use(cors({
    origin: ['https://goat-user.vercel.app', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/livestockmart';

console.log('🔧 Connecting to MongoDB...');
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log('✅ MongoDB Connected Successfully');
})
.catch(err => {
    console.error('❌ MongoDB Connection Failed:', err.message);
});

// --- AUTH HELPERS ---
function createToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function setAuthCookie(res, token) {
    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'none',
        secure: true, // Required for Vercel
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        domain: '.vercel.app' // Allow subdomain sharing
    });
}

function authMiddleware(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = { 
            id: decoded.id, 
            email: decoded.email, 
            name: decoded.name 
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// --- AUTH ROUTES ---

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('📝 Register attempt:', req.body.email);
        
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        // Create new user
        const newUser = new User({
            name,
            email,
            password,
            cart: [],
            wishlist: [],
            addresses: []
        });

        await newUser.save();
        
        // Create token and set cookie
        const token = createToken(newUser);
        setAuthCookie(res, token);

        console.log('✅ User registered:', email);
        res.status(201).json({
            user: { 
                id: newUser._id, 
                name: newUser.name, 
                email: newUser.email 
            },
            message: 'Registration successful'
        });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ 
            message: 'Registration failed',
            error: error.message 
        });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('🔐 Login attempt:', req.body.email);
        
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            console.log('❌ Password mismatch for:', email);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Create token and set cookie
        const token = createToken(user);
        setAuthCookie(res, token);

        console.log('✅ Login successful:', email);
        res.json({
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email 
            },
            message: 'Login successful'
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            message: 'Login failed',
            error: error.message 
        });
    }
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ 
        user: req.user,
        message: 'Authenticated'
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', {
        sameSite: 'none',
        secure: true,
        path: '/'
    });
    res.json({ message: 'Logged out successfully' });
});

// --- USER STATE ROUTES ---
app.get('/api/user/state', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('cart wishlist addresses');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Populate cart items with livestock details
        const populatedCart = await Promise.all(
            (user.cart || []).map(async (cartItem) => {
                const livestock = await Livestock.findById(cartItem.livestockId);
                if (!livestock) return null;
                
                return {
                    ...livestock.toObject(),
                    selected: cartItem.selected,
                    quantity: cartItem.quantity
                };
            })
        );

        // Filter out null items
        const validCart = populatedCart.filter(item => item !== null);

        res.json({
            cart: validCart,
            wishlist: user.wishlist || [],
            addresses: user.addresses || []
        });
    } catch (error) {
        console.error('Get user state error:', error);
        res.status(500).json({ message: 'Failed to load user state' });
    }
});

app.put('/api/user/state', authMiddleware, async (req, res) => {
    try {
        const { cart = [], wishlist = [], addresses = [] } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Convert cart items to schema format
        const cartItems = cart.map(item => ({
            livestockId: item._id,
            quantity: item.quantity || 1,
            selected: item.selected !== false
        }));

        user.cart = cartItems;
        user.wishlist = wishlist;
        user.addresses = addresses;
        
        await user.save();
        
        res.json({ success: true, message: 'State saved successfully' });
    } catch (error) {
        console.error('Save user state error:', error);
        res.status(500).json({ message: 'Failed to save user state' });
    }
});

// --- LIVESTOCK ROUTES ---

// Get all livestock
app.get('/api/livestock', async (req, res) => {
    try {
        const livestock = await Livestock.find().sort({ createdAt: -1 });
        res.json(livestock);
    } catch (error) {
        console.error('Get livestock error:', error);
        res.status(500).json({ error: 'Failed to load livestock' });
    }
});

// Create livestock (admin)
app.post('/api/livestock', async (req, res) => {
    try {
        const newItem = new Livestock(req.body);
        await newItem.save();
        res.status(201).json(newItem);
    } catch (error) {
        console.error('Create livestock error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Update livestock
app.put('/api/livestock/:id', async (req, res) => {
    try {
        const updatedItem = await Livestock.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedItem);
    } catch (error) {
        console.error('Update livestock error:', error);
        res.status(500).json({ error: 'Failed to update livestock' });
    }
});

// Delete livestock
app.delete('/api/livestock/:id', async (req, res) => {
    try {
        await Livestock.findByIdAndDelete(req.params.id);
        res.json({ message: 'Livestock deleted successfully' });
    } catch (error) {
        console.error('Delete livestock error:', error);
        res.status(500).json({ error: 'Failed to delete livestock' });
    }
});

// --- ORDERS ROUTES ---

// Get user orders
app.get('/api/orders', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to load orders' });
    }
});

// Create order
app.post('/api/orders', authMiddleware, async (req, res) => {
    try {
        const orderData = {
            ...req.body,
            userId: req.user.id,
            customer: req.user.name
        };
        
        const newOrder = new Order(orderData);
        await newOrder.save();
        
        // Clear cart items that were purchased
        const user = await User.findById(req.user.id);
        if (user && user.cart) {
            user.cart = user.cart.filter(cartItem => {
                return !orderData.items.some(orderItem => 
                    orderItem.id === cartItem.livestockId.toString()
                );
            });
            await user.save();
        }
        
        res.status(201).json(newOrder);
    } catch (error) {
        console.error('Create order error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Update order status
app.put('/api/orders/:id', authMiddleware, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to update this order' });
        }
        
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { status: req.body.status },
            { new: true }
        );
        res.json(updatedOrder);
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Seed initial livestock data
app.post('/api/seed-livestock', async (req, res) => {
    try {
        const livestockData = [
            {
                name: 'Alpine Goat',
                type: 'Goat',
                breed: 'Alpine',
                age: '2 years',
                price: 15000,
                image: '🐐',
                tags: ['Healthy', 'Vaccinated', 'Milk Producer'],
                status: 'Available'
            },
            {
                name: 'Merino Sheep',
                type: 'Sheep',
                breed: 'Merino',
                age: '3 years',
                price: 20000,
                image: '🐑',
                tags: ['Wool Producer', 'Healthy', 'Premium'],
                status: 'Available'
            },
            {
                name: 'Saanen Goat',
                type: 'Goat',
                breed: 'Saanen',
                age: '1.5 years',
                price: 18000,
                image: '🐐',
                tags: ['Milk Producer', 'Vaccinated', 'High Yield'],
                status: 'Available'
            },
            {
                name: 'Boer Goat',
                type: 'Goat',
                breed: 'Boer',
                age: '2.5 years',
                price: 22000,
                image: '🐐',
                tags: ['Meat Producer', 'Healthy', 'Fast Growing'],
                status: 'Available'
            },
            {
                name: 'Dorper Sheep',
                type: 'Sheep',
                breed: 'Dorper',
                age: '2 years',
                price: 25000,
                image: '🐑',
                tags: ['Meat Producer', 'Vaccinated', 'Premium'],
                status: 'Available'
            },
            {
                name: 'Nubian Goat',
                type: 'Goat',
                breed: 'Nubian',
                age: '1 year',
                price: 12000,
                image: '🐐',
                tags: ['Milk Producer', 'Healthy', 'Adaptable'],
                status: 'Available'
            }
        ];

        // Clear existing livestock
        await Livestock.deleteMany({});
        
        // Insert new livestock
        const insertedLivestock = await Livestock.insertMany(livestockData);
        
        res.json({
            message: 'Livestock seeded successfully',
            count: insertedLivestock.length,
            livestock: insertedLivestock
        });
    } catch (error) {
        console.error('Seed livestock error:', error);
        res.status(500).json({ error: 'Failed to seed livestock' });
    }
});

// --- SERVE STATIC FILES ---
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 API URL: https://goat-user.vercel.app/api`);
    console.log(`📊 Health check: https://goat-user.vercel.app/api/health`);
});

module.exports = app;
