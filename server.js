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
const JWT_SECRET = process.env.JWT_SECRET || 'goat-mart-secure-secret-2025';

// --- DATABASE CONNECTION ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saikambala111_db_user:deDR8YMG99pHBXBc@cluster0.mgzygo3.mongodb.net/livestockmart?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch((err) => console.error('❌ MongoDB Connection Error:', err));

// --- MIDDLEWARE ---
app.use(
  cors({
    origin: ['https://goat-index.vercel.app', 'http://localhost:3000'], // Allow local dev + prod
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

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
  const token = req.cookies?.token;
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

// --- AUTH ROUTES ---

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const user = new User({ name, email, password });
    await user.save();

    const token = createToken(user);
    setAuthCookie(res, token);

    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Register error:', err);
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

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ message: 'Logged out' });
});

// --- USER STATE (cart, wishlist, addresses) ---
app.get('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('cart wishlist addresses');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const populatedCart = await Promise.all(
      (user.cart || []).map(async (item) => {
        const livestock = await Livestock.findById(item.livestockId);
        if (!livestock) return null;
        return {
          ...livestock.toObject(),
          selected: item.selected,
          quantity: item.quantity,
        };
      })
    );

    const validCart = populatedCart.filter(item => item !== null);
    res.json({
      cart: validCart,
      wishlist: user.wishlist || [],
      addresses: user.addresses || [],
    });
  } catch (err) {
    console.error('Get user state error:', err);
    res.status(500).json({ message: 'Failed to load user state' });
  }
});

app.put('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const { cart = [], wishlist = [], addresses = [] } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const cartItems = cart.map(item => ({
      livestockId: item._id,
      quantity: item.quantity || 1,
      selected: item.selected !== false,
    }));

    user.cart = cartItems;
    user.wishlist = wishlist;
    user.addresses = addresses;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Save user state error:', err);
    res.status(500).json({ message: 'Failed to save user state' });
  }
});

// --- LIVESTOCK ROUTES ---
app.get('/api/livestock', async (req, res) => {
  try {
    const livestock = await Livestock.find().sort({ createdAt: -1 });
    res.json(livestock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/livestock', authMiddleware, async (req, res) => {
  try {
    const newItem = new Livestock(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/livestock/:id', authMiddleware, async (req, res) => {
  try {
    await Livestock.findByIdAndDelete(req.params.id);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ORDERS ROUTES ---
// Admin sees ALL orders; user sees only theirs (optional)
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    // TODO: In future, check if req.user.isAdmin to restrict
    const orders = await Order.find().sort({ createdAt: -1 }); // All orders
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      customer: req.user.name,
      userId: req.user.id,
    };
    const newOrder = new Order(orderData);
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });
    if (order.status !== 'Processing') return res.status(400).json({ message: 'Only processing orders can be cancelled' });

    order.status = 'Cancelled';
    await order.save();
    res.json(order);
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ message: 'Cancel failed' });
  }
});

// --- ADMIN-ONLY ROUTES ---
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    // In production, add: if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' });
    const users = await User.find().select('name email createdAt');
    res.json(users.map(u => ({
      id: u._id,
      name: u.name,
      email: u.email,
      joined: new Date(u.createdAt).toLocaleDateString('en-IN'),
    })));
  } catch (err) {
    console.error('Admin users fetch error:', err);
    res.status(500).json({ message: 'Failed to load users' });
  }
});

// --- UPI PAYMENT HANDLERS ---
app.post('/api/payment/create', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body || {};
    if (!amount) return res.status(400).json({ message: 'Amount required' });

    const paymentId = 'PAY_' + Date.now();
    const RECEIVER_UPI = process.env.RECEIVER_UPI || 'sai.kambala@ybl';
    const RECEIVER_NAME = encodeURIComponent(process.env.RECEIVER_NAME || 'LivestockMart');
    const upiString = `upi://pay?pa=${encodeURIComponent(RECEIVER_UPI)}&pn=${RECEIVER_NAME}&am=${amount}&tn=Livestock+Order`;

    return res.json({ paymentId, upiString });
  } catch (err) {
    console.error('Create payment error:', err);
    return res.status(500).json({ message: 'Failed to create payment' });
  }
});

app.post('/api/payment/confirm', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ message: 'Payment ID missing' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ message: 'Payment confirm failed' });
  }
});

// --- STATIC FILE SERVING ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Public URL should be: https://goat-index.vercel.app`);
});
module.exports = app;
