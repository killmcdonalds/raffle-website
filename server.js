require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult } = require('express-validator');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Use Render disk path if available, else local path
const dataFile = process.env.RENDER ? path.join('/opt/render/project/src/data', 'raffles.json') : path.join(__dirname, 'raffles.json');

async function readData() {
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading raffles.json:', error);
    return {
      raffles: {
        '10-ticket': { entries: [], maxEntries: 10, ticketPrice: 10, prizes: [75, 10, 2] },
        '100-ticket': { entries: [], maxEntries: 100, ticketPrice: 10, prizes: [750, 100, 20] },
        '100-ticket-high': { entries: [], maxEntries: 100, ticketPrice: 100, prizes: [7500, 1000, 200] },
      },
      winners: [],
    };
  }
}

async function writeData(data) {
  try {
    await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing to raffles.json:', error);
  }
}

app.get('/raffle-status', async (req, res) => {
  const data = await readData();
  res.json(data.raffles);
});

app.post(
  '/enter-raffle',
  [
    body('raffleType').isIn(['10-ticket', '100-ticket', '100-ticket-high']).withMessage('Invalid raffle type'),
    body('ticketQuantity').isInt({ min: 1, max: 10 }).withMessage('Ticket quantity must be between 1 and 10'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Invalid email'),
    body('paymentMethodId').notEmpty().withMessage('Payment method required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { raffleType, ticketQuantity, name, email, paymentMethodId } = req.body;
    const data = await readData();
    const raffle = data.raffles[raffleType];

    if (!raffle) {
      return res.status(400).json({ error: 'Raffle not found' });
    }

    const remainingEntries = raffle.maxEntries - raffle.entries.length;
    if (ticketQuantity > remainingEntries) {
      return res.status(400).json({ error: `Only ${remainingEntries} entries remaining` });
    }

    const existingEntries = raffle.entries.filter(entry => entry.email === email).length;
    if (existingEntries + ticketQuantity > raffle.maxEntries) {
      return res.status(400).json({ error: `This email cannot add ${ticketQuantity} more entries; only ${raffle.maxEntries - existingEntries} allowed` });
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: raffle.ticketPrice * ticketQuantity * 100, // Convert to cents
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        return_url: process.env.RENDER ? 'https://easymoneyraffles.onrender.com' : 'http://localhost:3000',
      });

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment failed' });
      }
    } catch (error) {
      console.error('Stripe error:', error.message);
      return res.status(400).json({ error: 'Payment processing error: ' + error.message });
    }

    for (let i = 0; i < ticketQuantity; i++) {
      raffle.entries.push({ name, email });
    }
    let winners = null;

    if (raffle.entries.length >= raffle.maxEntries) {
      const shuffled = raffle.entries.sort(() => 0.5 - Math.random());
      winners = shuffled.slice(0, 3);
      data.winners.push({
        raffleType,
        winners,
        prizes: raffle.prizes,
        date: new Date().toISOString(),
      });
      raffle.entries = [];
    }

    await writeData(data);
    res.json({ success: true, winners });
  }
);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});