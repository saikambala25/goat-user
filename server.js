const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'livestockmart-secret-key-2024';

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Simple in-memory user storage for testing (remove this later)
let users = [];

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/livestockmart';

console.log('🔧 Connecting to MongoDB...');
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log('✅ MongoDB Connected Successfully');
    
    // Create test user if none exists
    createTestUser();
})
.catch(err => {
    console.error('❌ MongoDB Connection Failed:', err.message);
    console.log('⚠️  Using in-memory user storage for testing');
});

// Simple User Schema (temporary)
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    cart: Array,
    wishlist: Array,
    addresses: Array,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function createTestUser() {
    try {
        // Check if test user exists
        const existingUser = await User.findOne({ email: 'test@test.com' });
        if (!existingUser) {
            const testUser = new User({
                name: 'Test User',
                email: 'test@test.com',
                password: 'password123', // Plain password for testing
                cart: [],
                wishlist: [],
                addresses: []
            });
            await testUser.save();
            console.log('✅ Test user created: test@test.com / password123');
        } else {
            console.log('✅ Test user already exists');
        }
    } catch (error) {
        console.error('Error creating test user:', error);
    }
}

// --- AUTH HELPERS ---
function createToken(user) {
    return jwt.sign(
        { id: user._id || user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function setAuthCookie(res, token) {
    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // Set to true in production with HTTPS
        maxAge: 7 * 24 * 60 * 60 * 1000,
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

// --- AUTH ROUTES ---

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

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
            password, // Store plain password for now
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

        // Simple password comparison (no bcrypt for now)
        if (user.password !== password) {
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
        sameSite: 'lax',
        secure: false
    });
    res.json({ message: 'Logged out successfully' });
});

// --- USER STATE ROUTES ---
app.get('/api/user/state', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            cart: user.cart || [],
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

        user.cart = cart;
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
// Simple livestock data for testing
const livestockData = [
    {
        _id: '1',
        name: 'Alpine Goat',
        type: 'Goat',
        breed: 'Alpine',
        age: '2 years',
        price: 15000,
        image: '🐐',
        tags: ['Healthy', 'Vaccinated'],
        status: 'Available'
    },
    {
        _id: '2',
        name: 'Merino Sheep',
        type: 'Sheep',
        breed: 'Merino',
        age: '3 years',
        price: 20000,
        image: '🐑',
        tags: ['Wool Producer', 'Healthy'],
        status: 'Available'
    },
    {
        _id: '3',
        name: 'Saanen Goat',
        type: 'Goat',
        breed: 'Saanen',
        age: '1.5 years',
        price: 18000,
        image: '🐐',
        tags: ['Milk Producer', 'Vaccinated'],
        status: 'Available'
    }
];

// Get all livestock
app.get('/api/livestock', (req, res) => {
    res.json(livestockData);
});

// Create livestock (admin only - for testing)
app.post('/api/livestock', (req, res) => {
    const newItem = {
        _id: Date.now().toString(),
        ...req.body,
        createdAt: new Date()
    };
    livestockData.push(newItem);
    res.status(201).json(newItem);
});

// --- ORDERS ROUTES ---
let orders = [];

// Get user orders
app.get('/api/orders', authMiddleware, (req, res) => {
    const userOrders = orders.filter(order => order.userId === req.user.id);
    res.json(userOrders);
});

// Create order
app.post('/api/orders', authMiddleware, (req, res) => {
    const newOrder = {
        _id: Date.now().toString(),
        ...req.body,
        userId: req.user.id,
        customer: req.user.name,
        createdAt: new Date(),
        status: 'Processing'
    };
    orders.push(newOrder);
    res.status(201).json(newOrder);
});

// Update order status
app.put('/api/orders/:id', authMiddleware, (req, res) => {
    const orderIndex = orders.findIndex(o => o._id === req.params.id);
    if (orderIndex === -1) {
        return res.status(404).json({ error: 'Order not found' });
    }
    
    if (orders[orderIndex].userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
    }
    
    orders[orderIndex].status = req.body.status;
    res.json(orders[orderIndex]);
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
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔐 Test login: test@test.com / password123`);
    console.log(`📁 Public files served from: ${path.join(__dirname, 'public')}`);
});
