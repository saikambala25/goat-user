const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Order = require('./Order');
const bodyParser = require("body-parser");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// -------------------
// DB CONNECT
// -------------------
mongoose
  .connect(process.env.MONGODB_URL || "mongodb+srv://saikambala111_db_user:deDR8YMG99pHBXBc@cluster0.mgzygo3.mongodb.net/LM")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("DB Error:", err));


// -------------------
// CREATE ORDER
// -------------------
app.post("/api/orders", async (req, res) => {
  try {
    const { userId, items, paymentMethod, paymentStatus } = req.body;

    const totalAmount = items.reduce((s, x) => s + x.price * x.qty, 0);

    const order = new Order({
      userId,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus, // from frontend: card→Paid, cod→Pending, upi→Pending
    });

    await order.save();
    return res.json({ success: true, order });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Order creation failed" });
  }
});

// -------------------
// GET USER ORDERS
// -------------------
app.get("/api/orders/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// -------------------
// CANCEL ORDER
// -------------------
app.put("/api/orders/cancel/:orderId", async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      { orderStatus: "Cancelled" },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Cancel request failed" });
  }
});


app.listen(3000, () => console.log("Server running on port 3000"));
