const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const Stripe = require('stripe');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Models
const Livestock = require('./models/Livestock');
const Order = require('./models/Order');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const OTP_FROM_EMAIL = process.env.OTP_FROM_EMAIL || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';


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

// Payment & OTP helpers
const razorpay = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

let mailer = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendOtpEmail(to, code) {
  if (!mailer || !OTP_FROM_EMAIL) {
    console.log(`OTP for ${to}: ${code}`);
    return;
  }
  try {
    await mailer.sendMail({
      from: OTP_FROM_EMAIL,
      to,
      subject: 'Your LivestockMart OTP',
      text: `Your OTP is ${code}. It is valid for 5 minutes.`,
    });
  } catch (err) {
    console.error('Error sending OTP email:', err);
  }
}


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

// Request OTP by email
app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email });
    // Respond with generic message even if user not found (privacy)
    if (!user) {
      return res.json({ message: 'If this email is registered, an OTP has been sent.' });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode = code;
    user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();
    await sendOtpEmail(email, code);
    res.json({ message: 'If this email is registered, an OTP has been sent.' });
  } catch (err) {
    console.error('Request OTP error:', err);
    res.status(500).json({ message: 'Error sending OTP' });
  }
});

// Login with OTP
app.post('/api/auth/login-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }
    const user = await User.findOne({ email });
    if (!user || !user.otpCode || !user.otpExpiresAt) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    if (user.otpCode !== otp || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    await user.save();
    const token = createToken(user);
    setAuthCookie(res, token);
    res.json({ user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('OTP login error:', err);
    res.status(500).json({ message: 'Error during OTP login' });
  }
});
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

    // Convert cart items to include livestock details
    const populatedCart = await Promise.all(
      (user.cart || []).map(async (item) => {
        const livestock = await Livestock.findById(item.livestockId);
        if (!livestock) return null;
        
        return {
          ...livestock.toObject(),
          selected: item.selected,
          quantity: item.quantity
        };
      })
    );

    // Filter out null items
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

// Save state
app.put('/api/user/state', authMiddleware, async (req, res) => {
  try {
    const { cart = [], wishlist = [], addresses = [] } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Convert cart items back to the format expected by the schema
    const cartItems = cart.map(item => ({
      livestockId: item._id,
      quantity: item.quantity || 1,
      selected: item.selected !== false
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

// --- EXISTING API ROUTES (unchanged URLs) ---

// 1. Get All Livestock
app.get('/api/livestock', async (req, res) => {
  try {
    const livestock = await Livestock.find().sort({ createdAt: -1 });
    res.json(livestock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add Livestock
app.post('/api/livestock', async (req, res) => {
  try {
    const newItem = new Livestock(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Delete Livestock
app.delete('/api/livestock/:id', async (req, res) => {
  try {
    await Livestock.findByIdAndDelete(req.params.id);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Orders (user-specific)
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    // Only return orders for the current user
    const orders = await Order.find({ customer: req.user.name }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Create Order
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    // Add the current user to the order
    const orderData = {
      ...req.body,
      customer: req.user.name,
      userId: req.user.id
    };
    
    const newOrder = new Order(orderData);
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// --- PAYMENT ROUTES ---

// Create Razorpay order
app.post('/api/payments/razorpay/order', authMiddleware, async (req, res) => {
  if (!razorpay) {
    return res.status(400).json({ message: 'Razorpay is not configured on the server' });
  }
  try {
    const { amount, currency = 'INR' } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount is required' });
    }
    const options = {
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: `order_rcpt_${Date.now()}`,
      notes: { userId: req.user.id },
    };
    const order = await razorpay.orders.create(options);
    res.json({ order, key: RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Razorpay order error:', err);
    res.status(500).json({ message: 'Failed to create Razorpay order' });
  }
});

// Create Stripe PaymentIntent (placeholder – you still need frontend card UI)
app.post('/api/payments/stripe/intent', authMiddleware, async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ message: 'Stripe is not configured on the server' });
  }
  try {
    const { amount, currency = 'inr' } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount is required' });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      metadata: { userId: req.user.id },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe intent error:', err);
    res.status(500).json({ message: 'Failed to create Stripe payment intent' });
  }
});

// 6. Update Order Status
app.put('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    // Only allow the user who created the order to update it
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this order' });
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

// Serve Admin Portal
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve User Portal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;
