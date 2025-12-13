const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
require('dotenv').config();

// Models
const Livestock = require('./models/Livestock');
const Order = require('./models/Order');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Ensure this path exists in your project structure: public/images
        cb(null, 'public/images');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Save file with a unique name
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware
// FIX: Update CORS policy to explicitly allow the frontend domain(s)
const allowedOrigins = [
    'https://goat-user.vercel.app', 
    'https://goat-index.vercel.app', // YOUR FRONTEND DOMAIN ADDED HERE
    'http://localhost:3000' 
];

app.use(
  cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/livestockmart';

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

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
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// --- AUTH ROUTES (USER LOGIN REMAINS PROTECTED) ---

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    const newUser = new User({ name, email, password });
    await newUser.save();

    const token = createToken(newUser);
    setAuthCookie(res, token);
    res.status(201).json({ user: { id: newUser._id, name: newUser.name, email: newUser.email } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);
    res.json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user (basic info)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ message: 'Logged out successfully' });
});


// ----------------------------------------------------------------------
// --- ADMIN-SPECIFIC API ROUTES (Authentication REMOVED to solve 401 issue) ---
// ----------------------------------------------------------------------

// Get All Livestock (Admin)
app.get('/api/admin/livestock', async (req, res) => {
    try {
        const livestock = await Livestock.find({}).sort({ createdAt: -1 });
        res.json({ livestock });
    } catch (err) {
        console.error('Admin Livestock error:', err);
        res.status(500).json({ message: 'Server error loading livestock' });
    }
});

// Add New Livestock (Admin CUD) - UPDATED TO HANDLE FILE UPLOAD
app.post('/api/admin/livestock', upload.single('image'), async (req, res) => {
    try {
        const { name, type, breed, age, price } = req.body;
        // The image path will be /images/<filename> if a file was uploaded
        const imagePath = req.file ? `/images/${req.file.filename}` : '🐑'; // Default to emoji if no file

        const newItem = new Livestock({
            name,
            type,
            breed,
            age,
            price: parseFloat(price),
            image: imagePath, // Save the path or emoji
            tags: ["New Arrival"],
            status: "Available"
        });

        await newItem.save();
        res.status(201).json(newItem);
    } catch (err) {
        console.error('Admin Add Livestock error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Remove Livestock (Admin CUD - New)
app.delete('/api/admin/livestock/:id', async (req, res) => {
    try {
        const result = await Livestock.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ message: "Livestock not found" });
        res.status(204).send();
    } catch (err) {
        console.error('Admin Delete Livestock error:', err);
        res.status(500).json({ message: 'Server error deleting livestock' });
    }
});

// Get All Orders (Admin)
app.get('/api/admin/orders', async (req, res) => {
    try {
        const orders = await Order.find({}).sort({ createdAt: -1 });
        res.json({ orders });
    } catch (err) {
        console.error('Admin Orders error:', err);
        res.status(500).json({ message: 'Server error loading orders' });
    }
});

// Update Order Status (Admin CUD)
app.put('/api/admin/orders/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!order) return res.status(404).json({ message: "Order not found" });
        res.json(order);
    } catch (err) {
        console.error('Admin Update Order error:', err);
        res.status(500).json({ message: 'Server error updating order' });
    }
});

// Get All Users (Admin/Customers List)
app.get('/api/admin/users', async (req, res) => {
    try {
        // Only fetch non-sensitive data
        const users = await User.find({}, 'name email createdAt').sort({ createdAt: -1 });
        res.json({ users });
    } catch (err) {
        console.error('Admin Users error:', err);
        res.status(500).json({ message: 'Server error loading users' });
    }
});

// ----------------------------------------------------------------------
// --- USER/PUBLIC API ROUTES (Filtered Data & User State) ---
// ----------------------------------------------------------------------

// Get Available Livestock (User/Public)
app.get('/api/livestock', async (req, res) => {
  try {
    // User app only sees 'Available' livestock
    const livestock = await Livestock.find({ status: 'Available' });
    res.json(livestock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get User Orders (User-Specific)
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    // User app only sees their own orders
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Order (User)
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const newOrder = new Order({
      ...req.body,
      userId: req.user.id,
      customer: req.user.name,
    });
    await newOrder.save();
    // After successful order creation, clear cart state from user's document
    await User.findByIdAndUpdate(req.user.id, { $set: { cart: [] } });
    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

// Cancel order (User)
app.put('/api/orders/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.userId) !== req.user.id) return res.status(403).json({ message: "Unauthorized" });
    if (order.status !== "Processing") return res.status(400).json({ message: "Only processing orders can be cancelled" });

    order.status = "Cancelled";
    await order.save();
    res.json(order);
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ message: 'Cancel failed' });
  }
});

// User State (Cart, Wishlist, Addresses)
app.get('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, 'cart wishlist addresses');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const { cart, wishlist, addresses } = req.body;
    await User.findByIdAndUpdate(req.user.id, { $set: { cart, wishlist, addresses } });
    res.json({ message: 'State updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payment simulation routes (unchanged)
app.post('/api/payment/create', authMiddleware, async (req, res) => {
  // Simple simulation of creating a payment session
  try {
    const { amount } = req.body;
    const paymentId = 'PAY_' + Date.now();
    const upiString = `upi://pay?pa=dummyupi@bank&pn=LivestockMart&mc=0000&tid=${paymentId}&tr=${paymentId}&am=${amount}`;
    res.json({ upiString, paymentId });
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ message: 'Failed to create payment' });
  }
});

app.post('/api/payment/confirm', authMiddleware, async (req, res) => {
  // Simple simulation of confirming payment
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ message: "Payment ID missing" });
    // In a real app, you would verify the payment with a provider like Razorpay/Stripe here.
    return res.json({ success: true });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ message: 'Payment confirm failed' });
  }
});


// Serve Static Files and Start Server
const PUBLIC_DIR = path.join(__dirname, 'public');

app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
