# Multi-Company Task Management System

A production-ready, full-stack multi-tenant task management system designed for independent companies to manage their projects and tasks within a single isolated software installation.

## Features

- **Multi-Tenant Architecture**: Complete data isolation between organizations. Users from Company A cannot see or access data from Company B.
- **Role-Based Access Control**: Strict permissions for Super Admin, Organization Admin, Project Manager, Team Lead, and Employees.
- **Project Management**: Create and track projects, assign project managers, and manage project members.
- **Task Management**: Create tasks, assign them to authorized project members, set priorities, due dates, and track status.
- **Kanban Board**: Drag-and-drop Kanban board for visualizing project workflows.
- **Dashboard**: Role-specific dashboards showing critical metrics, upcoming deadlines, and activity feeds.
- **Security**: JWT-based authentication, bcrypt password hashing, Express Helmet, and server-side tenant isolation enforcement.

## Tech Stack

**Frontend**:
- React.js (Vite)
- Tailwind CSS
- Redux Toolkit
- React Router DOM
- Axios
- Lucide React

**Backend**:
- Node.js
- Express.js
- MongoDB / Mongoose
- JSON Web Tokens (JWT)
- bcryptjs

## Folder Structure

```
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   ├── .env.example
│   ├── seed.js
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── layout/
│   │   ├── pages/
│   │   ├── store/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   └── tailwind.config.js
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v16+)
- MongoDB (Local or Atlas)

### 1. Backend Setup

```bash
cd backend
npm install
```

Copy the example environment file:
```bash
cp .env.example .env
```
Ensure your `MONGO_URI` is correctly pointing to your MongoDB instance.

### 2. Database Seeding (Crucial for testing)

The application comes with a seed script that generates two isolated companies (ABC Technologies and XYZ Solutions) along with sample users, projects, and tasks.

```bash
cd backend
npm run seed
```

This will create:
- **Admin at ABC**: `admin@abctech.com` (password: `password123`)
- **Employee at ABC**: `emp1@abctech.com` (password: `password123`)
- **Admin at XYZ**: `admin@xyzsolutions.com` (password: `password123`)

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Copy the example environment file:
```bash
cp .env.example .env
```

### 4. Running the Application

**Run Backend (from `/backend` directory):**
```bash
npm run dev
```

**Run Frontend (from `/frontend` directory):**
```bash
npm run dev
```

Visit `http://localhost:5173` to view the application.

## Multi-Tenant Security Note

The application enforces tenant isolation strictly on the server-side. The `organizationId` is always extracted from the authenticated user's JWT (`req.user.organizationId`) and never trusted from the client request body. All MongoDB queries explicitly include the `organizationId` to ensure data boundaries are respected.
