-- Restaurant CRM schema

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  available INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  datetime TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'confirmed',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS takeout_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  pickup_time TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_wallet TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  tx_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketing_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  platform TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed sample menu
INSERT INTO menu_items (name, description, price, category) VALUES
  ('Margherita Pizza', 'Fresh basil, mozzarella, San Marzano sauce', 14.00, 'Pizza'),
  ('Pepperoni Pizza', 'Classic pepperoni, mozzarella, tomato sauce', 16.00, 'Pizza'),
  ('Caesar Salad', 'Romaine, croutons, parmesan, Caesar dressing', 11.00, 'Salads'),
  ('Spaghetti Carbonara', 'Pancetta, egg, pecorino romano, black pepper', 18.00, 'Pasta');
