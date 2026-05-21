const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'hotel.db');
const db = new sqlite3.Database(dbPath);

const initSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'guest'
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available',
  description TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  guests INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  assigned_by_admin TEXT,
  total_cost REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS food_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  room_id INTEGER,
  total_price REAL NOT NULL,
  order_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'Placed',
  delivery TEXT NOT NULL DEFAULT 'Room delivery',
  guest_message TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total_price REAL NOT NULL,
  order_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'Placed',
  guest_message TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  shop_item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES shop_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(shop_item_id) REFERENCES shop_items(id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  guest_name TEXT,
  suggestion TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

db.serialize(() => {
  db.exec(initSql, (err) => {
    if (err) {
      console.error('Error initializing database:', err);
    } else {
      // Add guest_message column to orders table if it doesn't exist
      db.run(`ALTER TABLE orders ADD COLUMN guest_message TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding guest_message column:', err);
        }
      });

      // Add guest_name column to suggestions if it doesn't exist
      db.run(`ALTER TABLE suggestions ADD COLUMN guest_name TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding guest_name column:', err);
        }
      });

      // Insert sample shop items if not exists, and add any missing shop products on startup
      db.get(`SELECT COUNT(*) as count FROM shop_items`, (err, row) => {
        const shopItems = [
          ['Toothpaste', 'Personal Care', 2.50, 'Fresh mint toothpaste', 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=250&q=80'],
          ['Shampoo', 'Personal Care', 5.00, 'Herbal shampoo', 'https://images.unsplash.com/photo-1631730486572-226d1f6133f8?auto=format&fit=crop&w=250&q=80'],
          ['Soap', 'Personal Care', 1.50, 'Lavender scented soap', 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=250&q=80'],
          ['Towel', 'Linens', 10.00, 'Soft cotton towel', 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=250&q=80'],
          ['Soda', 'Beverages', 1.00, 'Refreshing cola', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=250&q=80'],
          ['Chips', 'Snacks', 2.00, 'Crunchy potato chips', 'https://images.unsplash.com/photo-1566479179810-d6c9c9c8e4b7?auto=format&fit=crop&w=250&q=80'],
          ['Notebook', 'Stationery', 3.00, 'Spiral notebook', 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=250&q=80'],
          ['Pen', 'Stationery', 1.00, 'Blue ballpoint pen', 'https://images.unsplash.com/photo-1583485088034-697b5bc74d7b?auto=format&fit=crop&w=250&q=80'],
          ['Sunglasses', 'Accessories', 15.00, 'UV protection sunglasses', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=250&q=80'],
          ['Hat', 'Accessories', 8.00, 'Sun hat', 'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=250&q=80'],
          ['Mineral Water', 'Beverages', 1.50, 'Pure bottled water to stay refreshed.', 'https://images.unsplash.com/photo-1598514982235-9c43779d7af4?auto=format&fit=crop&w=250&q=80'],
          ['Bread Loaf', 'Groceries', 3.50, 'Freshly baked bread perfect for breakfast.', 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?auto=format&fit=crop&w=250&q=80'],
          ['Milk Bottle', 'Groceries', 2.20, 'Cold dairy milk for coffee and cereals.', 'https://images.unsplash.com/photo-1517678759231-f1a612e766b0?auto=format&fit=crop&w=250&q=80'],
          ['Coffee Pack', 'Beverages', 7.00, 'Ground coffee for a rich hotel brew.', 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=250&q=80'],
          ['Travel Adapter', 'Electronics', 12.00, 'Universal travel adapter for all sockets.', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=250&q=80'],
          ['Phone Charger', 'Electronics', 9.00, 'Fast-charging USB cable for smartphones.', 'https://images.unsplash.com/photo-1509395176047-4a66953fd231?auto=format&fit=crop&w=250&q=80'],
          ['Laundry Detergent', 'Cleaning', 6.00, 'Handy detergent sachet for quick laundry.', 'https://images.unsplash.com/photo-1522770179533-24471fcdba45?auto=format&fit=crop&w=250&q=80'],
          ['Face Mask', 'Personal Care', 1.00, 'Single-use protective face mask.', 'https://images.unsplash.com/photo-1584036561584-b03c19da874c?auto=format&fit=crop&w=250&q=80'],
          ['Instant Noodles', 'Snacks', 2.50, 'Quick hot noodles with spicy seasoning.', 'https://images.unsplash.com/photo-1532634726-8b9fb9987e62?auto=format&fit=crop&w=250&q=80'],
          ['Face Wash', 'Beauty', 4.50, 'Daily face wash for glowing skin.', 'https://images.unsplash.com/photo-1512465764827-84f657ca12c2?auto=format&fit=crop&w=250&q=80'],
          ['Sunscreen', 'Beauty', 12.00, 'Broad spectrum SPF protection.', 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=250&q=80'],
          ['Body Lotion', 'Personal Care', 9.50, 'Nourishing lotion with vitamin E.', 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=250&q=80'],
          ['Orange Juice', 'Beverages', 3.00, 'Fresh cold-pressed orange juice.', 'https://images.unsplash.com/photo-1572448862525-6d4bc4b93831?auto=format&fit=crop&w=250&q=80'],
          ['Energy Bar', 'Snacks', 2.50, 'Healthy energy bar for on-the-go.', 'https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=250&q=80'],
          ['Chocolate Cookies', 'Snacks', 4.00, 'Fresh baked chocolate cookies.', 'https://images.unsplash.com/photo-1547592166-8c2a77d9bd54?auto=format&fit=crop&w=250&q=80'],
          ['Instant Coffee', 'Beverages', 6.00, 'Single-serve rich coffee sachets.', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=250&q=80'],
          ['Yoga Mat', 'Fitness', 18.00, 'Portable yoga mat for travel workouts.', 'https://images.unsplash.com/photo-1554284126-aa88f22d8d89?auto=format&fit=crop&w=250&q=80'],
          ['Umbrella', 'Travel', 8.00, 'Compact travel umbrella.', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=250&q=80'],
          ['Hand Sanitizer', 'Health', 2.50, 'Travel-sized hand sanitizer gel.', 'https://images.unsplash.com/photo-1583940935757-2d96d29d18d5?auto=format&fit=crop&w=250&q=80'],
          ['Power Bank', 'Electronics', 25.00, 'Portable charger for smartphones.', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=250&q=80'],
          ['Wireless Earbuds', 'Electronics', 35.00, 'True wireless earbuds with case.', 'https://images.unsplash.com/photo-1517927033932-b4d6d6d7c0af?auto=format&fit=crop&w=250&q=80'],
          ['Travel Pillow', 'Travel', 15.00, 'Comfortable neck pillow for flights.', 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=250&q=80'],
          ['Fresh Fruit Pack', 'Groceries', 8.00, 'Seasonal fresh fruit box.', 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=250&q=80'],
          ['Microwaveable Meal', 'Groceries', 7.00, 'Quick ready-to-heat dinner.', 'https://images.unsplash.com/photo-1548946526-f69e2424cf45?auto=format&fit=crop&w=250&q=80'],
          ['Water Bottle', 'Beverages', 4.00, 'Insulated reusable water bottle.', 'https://images.unsplash.com/photo-1526401281623-3f7cc6d3fbb7?auto=format&fit=crop&w=250&q=80'],
          ['Phone Stand', 'Electronics', 10.00, 'Desk phone holder for easy viewing.', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=250&q=80'],
          ['Toothbrush', 'Personal Care', 1.80, 'Soft bristle travel toothbrush.', 'https://images.unsplash.com/photo-1580281657522-df446122e1f7?auto=format&fit=crop&w=250&q=80'],
          ['Shaving Cream', 'Personal Care', 3.50, 'Creamy foam for easy shaving.', 'https://images.unsplash.com/photo-1582814281400-4980c00cf9f5?auto=format&fit=crop&w=250&q=80'],
          ['Travel Size Toothpaste', 'Personal Care', 1.50, 'Compact toothpaste for travel.', 'https://images.unsplash.com/photo-1583058064560-8d96424d5700?auto=format&fit=crop&w=250&q=80'],
          ['Beach Towel', 'Linens', 12.00, 'Colorful beach towel for sun days.', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=250&q=80'],
          ['Makeup Kit', 'Beauty', 18.00, 'Compact travel makeup kit.', 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=250&q=80'],
          ['Hair Brush', 'Personal Care', 3.00, 'Detangling hair brush.', 'https://images.unsplash.com/photo-1581281655762-3e6f1adf2a57?auto=format&fit=crop&w=250&q=80'],
          ['Waterproof Phone Case', 'Travel', 9.00, 'Waterproof case for phones.', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=250&q=80'],
          ['Notebook Pack', 'Stationery', 5.50, 'Set of three lined notebooks.', 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=250&q=80'],
          ['Battery Pack', 'Electronics', 8.00, 'AA batteries set for devices.', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=250&q=80'],
          ['Sunglass Case', 'Accessories', 5.00, 'Protective hard sunglasses case.', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37b?auto=format&fit=crop&w=250&q=80'],
          ['Travel Mug', 'Beverages', 11.00, 'Leakproof travel coffee mug.', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37b?auto=format&fit=crop&w=250&q=80'],
          ['Reusable Straw', 'Accessories', 2.00, 'Pack of reusable metal straws.', 'https://images.unsplash.com/photo-1496950866446-325a030c26a6?auto=format&fit=crop&w=250&q=80']
        ];

        if (!err && row.count === 0) {
          shopItems.forEach(item => {
            db.run(`INSERT INTO shop_items (name, category, price, description, image_url) VALUES (?, ?, ?, ?, ?)`, item);
          });
        } else {
          shopItems.forEach(item => {
            db.get(`SELECT 1 FROM shop_items WHERE name = ?`, [item[0]], (err2, row2) => {
              if (!err2 && !row2) {
                db.run(`INSERT INTO shop_items (name, category, price, description, image_url) VALUES (?, ?, ?, ?, ?)`, item);
              }
            });
          });
          shopItems.forEach(item => {
            db.run(`UPDATE shop_items SET image_url = ?, category = ?, price = ?, description = ? WHERE name = ?`, [item[4], item[1], item[2], item[3], item[0]]);
          });
        }
      });
    }
  });
});

module.exports = db;
