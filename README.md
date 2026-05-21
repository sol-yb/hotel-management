# Hotel Management System MVP

A web application for hotel room bookings, food/services orders, guest history tracking, and hotel admin management.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open the app in your browser:

```text
http://localhost:3000
```

## Features

- Guest registration and login
- Room browsing and booking
- Food menu browsing and cart ordering
- Guest dashboard with booking and order history
- Admin dashboard for managing rooms, bookings, food items, and guest activity
- Role-based access control

## Notes

- The app uses SQLite as the local database in `data/hotel.db`.
- Default admin login is created on first start if no admin exists:
  - Email: admin@hotel.com
  - Password: Admin@123
