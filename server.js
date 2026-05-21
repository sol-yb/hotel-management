const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'public/images/';
    if (req.originalUrl.includes('/admin/rooms')) {
      uploadPath += 'rooms/';
    } else if (req.originalUrl.includes('/admin/food')) {
      uploadPath += 'food/';
    } else if (req.originalUrl.includes('/admin/shop')) {
      uploadPath += 'shop/';
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: 'hotel-management-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const ensureAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

const ensureAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Admin only');
  }
  next();
};

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function queryGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

async function ensureDefaultAdmin() {
  const admin = await queryGet('SELECT * FROM users WHERE role = ?', ['admin']);
  if (!admin) {
    const passwordHash = await bcrypt.hash('Admin@123', 10);
    await run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Hotel Admin', 'admin@hotel.com', passwordHash, 'admin']);
    console.log('Default admin created: admin@hotel.com / Admin@123');
  }
}

app.use(async (req, res, next) => {
  if (!req.session.user) {
    req.user = null;
  } else {
    req.user = req.session.user;
  }
  res.locals.user = req.user;
  next();
});

app.get('/', async (req, res) => {
  const rooms = await query('SELECT * FROM rooms LIMIT 6');
  const food = await query('SELECT * FROM food_items LIMIT 6');
  res.render('index', { rooms, food, message: null });
});

app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.render('register', { error: 'All fields are required.' });
  const existing = await queryGet('SELECT * FROM users WHERE email = ?', [email]);
  if (existing) return res.render('register', { error: 'Email already registered.' });
  const passwordHash = await bcrypt.hash(password, 10);
  await run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, passwordHash]);
  res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await queryGet('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.render('login', { error: 'Invalid credentials.' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render('login', { error: 'Invalid credentials.' });
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  if (user.role === 'admin') {
    return res.redirect('/admin');
  }
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/rooms', async (req, res) => {
  const { type, min_price, max_price, status } = req.query;
  let sql = 'SELECT * FROM rooms WHERE 1=1';
  const params = [];
  if (type) {
    sql += ' AND type LIKE ?';
    params.push(`%${type}%`);
  }
  if (min_price) {
    sql += ' AND price >= ?';
    params.push(min_price);
  }
  if (max_price) {
    sql += ' AND price <= ?';
    params.push(max_price);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  const rooms = await query(sql, params);
  res.render('rooms', { rooms });
});

app.get('/book-room/:id', ensureAuth, async (req, res) => {
  const room = await queryGet('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) return res.redirect('/rooms');
  res.render('book-room', { room, error: null });
});

app.post('/book-room/:id', ensureAuth, async (req, res) => {
  const room = await queryGet('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) return res.redirect('/rooms');
  const { check_in, check_out, guests } = req.body;
  if (!check_in || !check_out || !guests) {
    return res.render('book-room', { room, error: 'All fields are required.' });
  }

  const checkInDate = new Date(check_in);
  const checkOutDate = new Date(check_out);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

  // Validate check-in date is not in the past
  if (checkInDate < today) {
    return res.render('book-room', { room, error: 'Check-in date cannot be in the past.' });
  }

  // Validate check-out date is after check-in date
  if (checkOutDate <= checkInDate) {
    return res.render('book-room', { room, error: 'Check-out date must be after check-in date.' });
  }

  // Validate check-out date is not more than 1 month after check-in
  const oneMonthFromCheckIn = new Date(checkInDate);
  oneMonthFromCheckIn.setMonth(checkInDate.getMonth() + 1);
  if (checkOutDate > oneMonthFromCheckIn) {
    return res.render('book-room', { room, error: 'Maximum stay duration is 1 month.' });
  }

  const nights = Math.max(1, (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
  const total_cost = nights * room.price;
  await run(
    'INSERT INTO bookings (user_id, room_id, check_in, check_out, guests, status, total_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.session.user.id, room.id, check_in, check_out, guests, 'Pending', total_cost]
  );
  await run('UPDATE rooms SET status = ? WHERE id = ?', ['Occupied', room.id]);
  res.redirect('/dashboard');
});

app.get('/food-menu', async (req, res) => {
  const { category, search } = req.query;
  let sql = 'SELECT * FROM food_items WHERE 1=1';
  const params = [];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  const foods = await query(sql, params);
  const categories = await query('SELECT DISTINCT category FROM food_items');
  res.render('food-menu', { categories, foods, cart: [] });
});

app.get('/shop', async (req, res) => {
  const { category, search } = req.query;
  let sql = 'SELECT * FROM shop_items WHERE 1=1';
  const params = [];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  const items = await query(sql, params);
  const categories = await query('SELECT DISTINCT category FROM shop_items');
  res.render('shop', { categories, items, cart: [] });
});

app.get('/order-shop', ensureAuth, async (req, res) => {
  const categories = await query('SELECT DISTINCT category FROM shop_items');
  const items = await query('SELECT * FROM shop_items');
  res.render('order-shop', { categories, items, error: null });
});

app.get('/dashboard', ensureAuth, async (req, res) => {
  const bookings = await query('SELECT b.*, r.room_number, r.type FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.user_id = ? ORDER BY b.created_at DESC', [req.session.user.id]);
  const orders = await query('SELECT o.*, r.room_number FROM orders o LEFT JOIN rooms r ON o.room_id = r.id WHERE o.user_id = ? ORDER BY o.order_time DESC', [req.session.user.id]);
  const shopOrders = await query('SELECT * FROM shop_orders WHERE user_id = ? ORDER BY order_time DESC', [req.session.user.id]);
  res.render('dashboard', { bookings, orders, shopOrders: shopOrders || [] });
});

app.get('/order-food', ensureAuth, async (req, res) => {
  const categories = await query('SELECT DISTINCT category FROM food_items');
  const foods = await query('SELECT * FROM food_items');
  res.render('order-food', { categories, foods, error: null });
});

app.post('/order-food', ensureAuth, async (req, res) => {
  const { items = '', delivery, room_id, guest_message } = req.body;
  const selectedItems = items ? items.split(',').filter(item => item.trim()) : [];
  if (!selectedItems.length) {
    const categories = await query('SELECT DISTINCT category FROM food_items');
    const foods = await query('SELECT * FROM food_items');
    return res.render('order-food', { categories, foods, error: 'Add items to your cart before placing an order.' });
  }
  let total_price = 0;
  const orderResult = await run('INSERT INTO orders (user_id, room_id, total_price, delivery, guest_message) VALUES (?, ?, ?, ?, ?)', [req.session.user.id, room_id || null, 0, delivery || 'Room delivery', guest_message || null]);
  const orderId = orderResult.lastID;
  for (const value of selectedItems) {
    const [foodId, qty] = value.split(':');
    const quantity = Number(qty || 1);
    const food = await queryGet('SELECT * FROM food_items WHERE id = ?', [foodId]);
    if (!food) continue;
    const linePrice = food.price * quantity;
    total_price += linePrice;
    await run('INSERT INTO order_items (order_id, food_item_id, quantity, price) VALUES (?, ?, ?, ?)', [orderId, food.id, quantity, food.price]);
  }
  await run('UPDATE orders SET total_price = ? WHERE id = ?', [total_price, orderId]);
  res.redirect('/dashboard');
});

app.post('/order-shop', ensureAuth, async (req, res) => {
  const { items = '', guest_message } = req.body;
  const selectedItems = items ? items.split(',').filter(item => item.trim()) : [];
  if (!selectedItems.length) {
    const categories = await query('SELECT DISTINCT category FROM shop_items');
    const items = await query('SELECT * FROM shop_items');
    return res.render('shop', { categories, items, error: 'Add items to your cart before placing an order.' });
  }
  let total_price = 0;
  const orderResult = await run('INSERT INTO shop_orders (user_id, total_price, guest_message) VALUES (?, ?, ?)', [req.session.user.id, 0, guest_message || null]);
  const orderId = orderResult.lastID;
  for (const value of selectedItems) {
    const [itemId, qty] = value.split(':');
    const quantity = Number(qty || 1);
    const item = await queryGet('SELECT * FROM shop_items WHERE id = ?', [itemId]);
    if (!item) continue;
    const linePrice = item.price * quantity;
    total_price += linePrice;
    await run('INSERT INTO shop_order_items (order_id, shop_item_id, quantity, price) VALUES (?, ?, ?, ?)', [orderId, item.id, quantity, item.price]);
  }
  await run('UPDATE shop_orders SET total_price = ? WHERE id = ?', [total_price, orderId]);
  res.redirect('/dashboard');
});

app.get('/admin', ensureAdmin, async (req, res) => {
  const rooms = await query('SELECT * FROM rooms ORDER BY room_number');
  const bookings = await query('SELECT b.*, u.name AS guest_name, r.room_number FROM bookings b JOIN users u ON b.user_id = u.id JOIN rooms r ON b.room_id = r.id ORDER BY b.created_at DESC');
  const foods = await query('SELECT * FROM food_items ORDER BY category');
  const shopItems = await query('SELECT * FROM shop_items ORDER BY category');
  res.render('admin', { rooms, bookings, foods, shopItems, message: null });
});

app.post('/admin/rooms', ensureAdmin, upload.single('image'), async (req, res) => {
  const { room_number, type, price, status, description } = req.body;
  const image_url = req.file ? `/images/rooms/${req.file.filename}` : '';
  await run('INSERT INTO rooms (room_number, type, price, status, description, image_url) VALUES (?, ?, ?, ?, ?, ?)', [room_number, type, price, status || 'Available', description, image_url]);
  res.redirect('/admin');
});

app.post('/admin/rooms/:id/update', ensureAdmin, upload.single('image'), async (req, res) => {
  const { room_number, type, price, status, description } = req.body;
  let image_url = req.body.current_image || '';
  if (req.file) {
    image_url = `/images/rooms/${req.file.filename}`;
  }
  await run('UPDATE rooms SET room_number = ?, type = ?, price = ?, status = ?, description = ?, image_url = ? WHERE id = ?', [room_number, type, price, status, description, image_url, req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/rooms/:id/delete', ensureAdmin, async (req, res) => {
  await run('DELETE FROM rooms WHERE id = ?', [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/food', ensureAdmin, upload.single('image'), async (req, res) => {
  const { name, category, price, description } = req.body;
  const image_url = req.file ? `/images/food/${req.file.filename}` : '';
  await run('INSERT INTO food_items (name, category, price, description, image_url) VALUES (?, ?, ?, ?, ?)', [name, category, price, description, image_url]);
  res.redirect('/admin');
});

app.post('/admin/food/:id/delete', ensureAdmin, async (req, res) => {
  await run('DELETE FROM food_items WHERE id = ?', [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/food/:id/update', ensureAdmin, upload.single('image'), async (req, res) => {
  const { name, category, price, description } = req.body;
  let image_url = req.body.current_image || '';
  if (req.file) {
    image_url = `/images/food/${req.file.filename}`;
  }
  await run('UPDATE food_items SET name = ?, category = ?, price = ?, description = ?, image_url = ? WHERE id = ?', [name, category, price, description, image_url, req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/shop', ensureAdmin, upload.single('image'), async (req, res) => {
  const { name, category, price, description } = req.body;
  const image_url = req.file ? `/images/shop/${req.file.filename}` : '';
  await run('INSERT INTO shop_items (name, category, price, description, image_url) VALUES (?, ?, ?, ?, ?)', [name, category, price, description, image_url]);
  res.redirect('/admin');
});

app.post('/admin/shop/:id/update', ensureAdmin, upload.single('image'), async (req, res) => {
  const { name, category, price, description } = req.body;
  let image_url = req.body.current_image || '';
  if (req.file) {
    image_url = `/images/shop/${req.file.filename}`;
  }
  await run('UPDATE shop_items SET name = ?, category = ?, price = ?, description = ?, image_url = ? WHERE id = ?', [name, category, price, description, image_url, req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/shop/:id/delete', ensureAdmin, async (req, res) => {
  await run('DELETE FROM shop_items WHERE id = ?', [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/bookings/:id/status', ensureAdmin, async (req, res) => {
  const { status } = req.body;
  await run('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
  res.redirect('/admin');
});

app.get('/admin/guest/:id', ensureAdmin, async (req, res) => {
  const guest = await queryGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!guest) return res.redirect('/admin');
  const bookings = await query('SELECT b.*, r.room_number FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.user_id = ? ORDER BY b.created_at DESC', [guest.id]);
  const orders = await query('SELECT o.*, r.room_number FROM orders o LEFT JOIN rooms r ON o.room_id = r.id WHERE o.user_id = ? ORDER BY o.order_time DESC', [guest.id]);
  res.render('guest-history', { guest, bookings, orders });
});

app.get('/setup-sample', async (req, res) => {
  const existingRooms = await queryGet('SELECT id FROM rooms LIMIT 1');
  if (!existingRooms) {
    const rooms = [
      ['101', 'Deluxe Suite', 150, 'Available', 'Spacious suite with ocean view, king bed, and balcony.', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=250&q=80'],
      ['102', 'Standard Room', 85, 'Available', 'Comfortable standard room with twin beds and city view.', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=250&q=80'],
      ['103', 'Executive Suite', 220, 'Available', 'Luxury suite with separate living area, mini-bar, and premium amenities.', 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=250&q=80'],
      ['104', 'Family Room', 120, 'Available', 'Large room perfect for families, with bunk beds and play area.', 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=250&q=80'],
      ['105', 'Penthouse', 350, 'Available', 'Exclusive penthouse with panoramic views, private terrace, and jacuzzi.', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=250&q=80'],
      ['201', 'Business Room', 95, 'Available', 'Modern room designed for business travelers, with desk and high-speed internet.', 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=250&q=80'],
      ['202', 'Romantic Suite', 180, 'Available', 'Intimate suite with heart-shaped bed, champagne setup, and rose petals.', 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=250&q=80'],
      ['203', 'Budget Room', 65, 'Available', 'Affordable room with essential amenities for short stays.', 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=250&q=80']
    ];
    for (const room of rooms) {
      await run('INSERT INTO rooms (room_number, type, price, status, description, image_url) VALUES (?, ?, ?, ?, ?, ?)', room);
    }
  }

  const existingFood = await queryGet('SELECT id FROM food_items LIMIT 1');
  if (!existingFood) {
    const foods = [
      ['Continental Breakfast', 'Breakfast', 12.5, 'Fresh croissants, fruits, coffee, and juices.', 'https://images.unsplash.com/photo-1551782450-17144efb5723?auto=format&fit=crop&w=250&q=80'],
      ['Pancake Stack', 'Breakfast', 14, 'Fluffy pancakes with maple syrup and berries.', 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=250&q=80'],
      ['Avocado Toast', 'Breakfast', 11, 'Whole grain toast with avocado, eggs, and herbs.', 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=250&q=80'],
      ['Grilled Salmon', 'Lunch', 22, 'Fresh salmon with vegetables and rice.', 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=250&q=80'],
      ['Caesar Salad', 'Lunch', 16, 'Crisp romaine lettuce with parmesan and croutons.', 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&w=250&q=80'],
      ['Chicken Parmesan', 'Lunch', 20, 'Breaded chicken with marinara and cheese.', 'https://images.unsplash.com/photo-1632778149955-e80c8d0dcf35?auto=format&fit=crop&w=250&q=80'],
      ['Beef Steak', 'Dinner', 35, 'Prime ribeye steak with mashed potatoes.', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=250&q=80'],
      ['Lobster Tail', 'Dinner', 45, 'Grilled lobster with butter sauce.', 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=250&q=80'],
      ['Vegetarian Pasta', 'Dinner', 18, 'Pasta with seasonal vegetables and pesto.', 'https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?auto=format&fit=crop&w=250&q=80'],
      ['Chocolate Cake', 'Dessert', 8, 'Rich chocolate cake with vanilla ice cream.', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=250&q=80'],
      ['Tiramisu', 'Dessert', 9, 'Classic Italian dessert with coffee and mascarpone.', 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=250&q=80'],
      ['Fruit Salad', 'Dessert', 7, 'Fresh mixed fruits with yogurt.', 'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=250&q=80'],
      ['Espresso', 'Drinks', 4, 'Strong Italian coffee.', 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=250&q=80'],
      ['Smoothie Bowl', 'Drinks', 10, 'Healthy smoothie with fruits and granola.', 'https://images.unsplash.com/photo-1553909489-cd5096e95c18?auto=format&fit=crop&w=250&q=80'],
      ['Wine Selection', 'Drinks', 12, 'Red or white wine from our cellar.', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=250&q=80']
    ];
    for (const food of foods) {
      await run('INSERT INTO food_items (name, category, price, description, image_url) VALUES (?, ?, ?, ?, ?)', food);
    }
  }
  res.redirect('/');
});

app.get(['/suggestion', '/feedback'], (req, res) => res.redirect('/suggestions'));

app.get(['/suggestions', '/suggestion', '/feedback'], async (req, res) => {
  const suggestions = await query(`SELECT s.*, COALESCE(u.name, s.guest_name, 'Guest') AS name
    FROM suggestions s
    LEFT JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC`);
  res.render('suggestions', { suggestions, user: req.session.user });
});

app.post(['/suggestions', '/feedback'], async (req, res) => {
  const { suggestion } = req.body;
  if (suggestion && suggestion.trim()) {
    const guestName = req.session.user ? req.session.user.name : 'Guest';
    const userId = req.session.user ? req.session.user.id : null;
    await run('INSERT INTO suggestions (user_id, guest_name, suggestion) VALUES (?, ?, ?)', [userId, guestName, suggestion.trim()]);
  }
  res.redirect('/suggestions');
});

app.use((req, res) => res.status(404).render('404'));

ensureDefaultAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`Hotel Management System running at http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('Startup error:', error);
});
