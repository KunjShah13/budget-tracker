require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const csvHandler = require('./csv-handler');
const splitHandler = require('./split-handler');
const configHandler = require('./config-handler');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback_secret_for_local_dev';

app.use(express.json());
app.use(cookieParser(SESSION_SECRET));

const router = express.Router();

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (req.signedCookies.auth_token === 'authenticated') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ----------------------------------------------------
// HTML PAGE ROUTES (Must be before static middleware)
// ----------------------------------------------------
router.get('/', (req, res) => {
  if (req.signedCookies.auth_token === 'authenticated') {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.redirect('/budget/login');
  }
});

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

router.get('/settings', (req, res) => {
  if (req.signedCookies.auth_token === 'authenticated') {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
  } else {
    res.redirect('/budget/login');
  }
});

router.get('/splits', (req, res) => {
  if (req.signedCookies.auth_token === 'authenticated') {
    res.sendFile(path.join(__dirname, 'public', 'splits.html'));
  } else {
    res.redirect('/budget/login');
  }
});

// Serve static assets without auth (CSS, JS, etc.)
router.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------
router.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === AUTH_PASSWORD) {
    res.cookie('auth_token', 'authenticated', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      signed: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/budget'
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

router.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token', { path: '/budget' });
  res.json({ success: true });
});

router.post('/api/expense', requireAuth, (req, res) => {
  try {
    const { date, description, amount, paymentMode, subCategory, category, splitwise, splitDetails } = req.body;
    
    if (!date || !description || amount === undefined || !paymentMode || !subCategory || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const expense = csvHandler.addExpense({
      date, description, amount, paymentMode, subCategory, category, splitwise
    });

    if (splitwise === 'Yes' && splitDetails) {
      const parsedDate = new Date(date);
      const month = parsedDate.getMonth() + 1;
      const year = parsedDate.getFullYear();
      splitHandler.saveSplit(expense.id, splitDetails, month, year);
    }

    res.json({ success: true, expense });
  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/expenses', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();

    const expenses = csvHandler.readExpenses(month, year);
    const availableMonths = csvHandler.getAvailableMonths();

    res.json({ expenses, availableMonths });
  } catch (error) {
    console.error('Error reading expenses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/expense/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;
    const expenseData = req.body; // should contain updated fields and splitDetails

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year query parameters are required' });
    }

    const m = parseInt(month);
    const y = parseInt(year);

    const expense = csvHandler.updateExpense(id, expenseData, m, y);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (expenseData.splitwise === 'Yes' && expenseData.splitDetails) {
      splitHandler.saveSplit(id, expenseData.splitDetails, m, y);
    } else if (expenseData.splitwise === 'No') {
      splitHandler.deleteSplit(id, m, y);
    }

    res.json({ success: true, expense });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/expense/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year query parameters are required' });
    }

    const m = parseInt(month);
    const y = parseInt(year);

    const success = csvHandler.deleteExpense(id, m, y);
    if (success) {
      splitHandler.deleteSplit(id, m, y);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Expense not found' });
    }
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/download', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();

    const csvContent = csvHandler.getCSVContent(month, year);
    if (!csvContent) {
      return res.status(404).send('File not found');
    }

    const paddedMonth = month.toString().padStart(2, '0');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=expenses_${year}_${paddedMonth}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error downloading CSV:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/api/splits', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();

    const splits = splitHandler.getSplits(month, year);
    const settlement = splitHandler.getSettlement(month, year);
    const allExpenses = csvHandler.readExpenses(month, year);
    
    // Only return expenses that have a split
    const expenses = allExpenses.filter(e => splits[e.id]);

    res.json({ splits, settlement, expenses });
  } catch (error) {
    console.error('Error fetching splits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/months', requireAuth, (req, res) => {
  try {
    const months = csvHandler.getAvailableMonths();
    res.json({ months });
  } catch (error) {
    console.error('Error fetching months:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Config routes
router.get('/api/config', requireAuth, (req, res) => {
  try {
    res.json(configHandler.readConfig());
  } catch (e) {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

router.post('/api/config', requireAuth, (req, res) => {
  try {
    const saved = configHandler.writeConfig(req.body);
    res.json({ success: true, config: saved });
  } catch (e) {
    console.error('Config save error:', e);
    res.status(400).json({ error: e.message });
  }
});

// Mount router under /budget
app.use('/budget', router);

// Root redirect
app.get('/', (req, res) => res.redirect('/budget/'));

app.listen(PORT, () => {
  console.log(`Budget Tracker server running on port ${PORT}`);
});
