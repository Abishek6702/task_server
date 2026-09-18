# Backend Folder Structure & Architecture Guide

This document breaks down the backend directory structure, explaining the purpose of every folder and significant file to help you navigate the API codebase.

## Root Directory (`backend/`)

```text
backend/
├── config/                 # Configuration files (Database connection).
├── controllers/            # Business logic and request handling.
├── middleware/             # Express middlewares (Authentication, Error handling).
├── models/                 # Mongoose schema definitions mapping to MongoDB.
├── routes/                 # Express route definitions (URL mapping).
├── utils/                  # Helper functions and utilities.
├── uploads/                # Local directory where Multer saves attached files.
├── .env                    # Environment variables (DB URI, Secrets, Ports).
├── package.json            # Node.js dependencies and start scripts.
├── seed.js                 # Script to wipe and repopulate the database with dummy data.
├── server.js               # The main entry point. Bootstraps the Express application.
├── STUDY_GUIDE.md          # In-depth module and role-based architecture guide.
└── FOLDER_STRUCTURE.md     # This file.
```

---

## 1. Config (`config/`)
Contains connection logic for external services.

```text
config/
└── db.js                   # Mongoose connection logic (`mongoose.connect`). Invoked by `server.js`.
```

---

## 2. Models (`models/`)
Defines the shape of the data stored in MongoDB using Mongoose. These models are imported by the Controllers.

```text
models/
├── Organization.js         # The tenant model. Everything else relies on this ID.
├── User.js                 # Platform users. Includes `bcrypt` pre-save hooks to hash passwords.
├── Project.js              # Groups tasks. Contains an array of member ObjectIds.
├── Task.js                 # The core work unit. 
├── Comment.js              # Discussions attached to tasks.
├── Notification.js         # Alert records for users.
└── ActivityLog.js          # Audit trail records (e.g., status changes).
```

---

## 3. Routes (`routes/`)
Maps incoming HTTP verbs (GET, POST, PUT, DELETE) and endpoints to the corresponding Controller functions. Also applies Middlewares (like `protect`).

```text
routes/
├── auth.routes.js          # Public endpoints (`/login`, `/register`).
├── organization.routes.js  # Endpoints for managing tenants.
├── user.routes.js          # Endpoints for managing employees.
├── project.routes.js       # Endpoints for project CRUD.
├── task.routes.js          # Endpoints for task CRUD and Kanban updates.
├── comment.routes.js       # Endpoints for adding/editing comments.
├── activity.routes.js      # Endpoint to fetch activity logs for an entity.
├── notification.routes.js  # Endpoints to fetch and dismiss alerts.
├── reports.routes.js       # Dashboard and workload metric endpoints.
├── search.routes.js        # Global search endpoint.
├── calendar.routes.js      # Unified deadline fetching endpoint.
└── upload.routes.js        # File upload endpoint (uses `multer` middleware here).
```

---

## 4. Controllers (`controllers/`)
The "brain" of the application. Routes hand off the request (`req`) and response (`res`) objects to these files. Controllers extract data, enforce tenant boundaries (`req.user.organizationId`), talk to Models, and send JSON responses.

```text
controllers/
├── auth.controller.js      # Logic for password comparison, JWT generation, and Registration.
├── organization.controller.js # Logic for Super Admins to toggle tenant status.
├── user.controller.js      # Logic for inviting and listing employees.
├── project.controller.js   # Logic for creating projects and assigning members.
├── task.controller.js      # Complex logic for task creation, assigning, and triggering logs.
├── comment.controller.js   # Logic for saving text and triggering notification alerts.
├── activity.controller.js  # Simple read-only fetch logic for the audit trail.
├── notification.controller.js # Logic to list and mark alerts as read.
├── reports.controller.js   # Contains MongoDB Aggregation Pipelines to calculate KPIs.
├── search.controller.js    # Performs global Regex queries across multiple models.
├── calendar.controller.js  # Maps Projects and Tasks into unified Event objects.
└── upload.controller.js    # Pushes file paths into Task `attachments` arrays.
```

---

## 5. Middleware (`middleware/`)
Functions that run *before* the controller is reached. Used to intercept and validate requests.

```text
middleware/
├── authMiddleware.js       # Contains `protect` (verifies JWT token) and `authorize` (verifies RBAC roles).
└── errorMiddleware.js      # Global error handler to catch crashes and return JSON instead of HTML stack traces.
```

---

## 6. Utils (`utils/`)
Reusable helper functions.

```text
utils/
├── jwt.js                  # Contains the `generateToken` function using `jsonwebtoken`.
└── upload.js               # Configures the `multer` storage engine (destinations and filenames).
```
