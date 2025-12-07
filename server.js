
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Models
const Livestock = require('./Livestock');
const Order = require('./Order');
const User = require('./User');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Database Connection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/livestockmart';

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

// --- AUTH ROUTES ---
// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: 'Name, email and password are required' });
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
      return res
        .status(400)
        .json({ message: 'Email and password are required' });
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
  res.clearCookie('token', {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ message: 'Logged out' });
});

// --- USER STATE (cart, wishlist, addresses) ---

// Get saved state
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
    const validCart = populatedCart.filter((i) => i !== null);

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

// Save state
app.put('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const { cart = [], wishlist = [], addresses = [] } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const cartItems = cart.map((item) => ({
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

app.post('/api/livestock', async (req, res) => {
  try {
    const newItem = new Livestock(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/livestock/:id', async (req, res) => {
  try {
    await Livestock.findByIdAndDelete(req.params.id);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ORDER ROUTES ---
// Get orders only for current user
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create order
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { items, total, address, paymentMethod } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items in order' });
    }

    const order = new Order({
      customer: req.user.name,
      userId: req.user.id,
      date: new Date().toLocaleDateString('en-IN'),
      items,
      total,
      status: 'Processing',
      address,
      paymentMethod: paymentMethod || 'cod',
      tracking: [
        { label: 'Order Placed', completed: true },
        { label: 'Packed', completed: false },
        { label: 'Shipped', completed: false },
        { label: 'Delivered', completed: false },
      ],
    });

    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update order status (cancel / progress)
app.put('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this order' });
    }

    if (status === 'Cancelled' && order.status === 'Delivered') {
      return res.status(400).json({ error: 'Delivered orders cannot be cancelled' });
    }

    if (status) {
      order.status = status;

      const statusIndexMap = {
        Processing: 0,
        Packed: 1,
        Shipped: 2,
        Delivered: 3,
        Cancelled: -1,
      };

      if (status === 'Cancelled') {
        order.tracking.forEach((step, i) => {
          step.completed = i === 0;
        });
      } else if (statusIndexMap[status] !== undefined) {
        const idx = statusIndexMap[status];
        order.tracking.forEach((step, i) => {
          step.completed = i <= idx;
        });
      }
    }

    await order.save();
    res.json(order);
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;
