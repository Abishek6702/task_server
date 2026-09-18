# Backend Study Guide & Project Setup

This document provides a highly granular, module-by-module explanation of the backend architecture, mapping exactly where each piece of logic goes, and how Role-Based Access Control (RBAC) affects every module.

## 1. Project Setup & Getting Started

### Prerequisites
- Node.js installed
- MongoDB installed locally or MongoDB Atlas URI

### Installation & Execution
```bash
# Install dependencies
npm install

# Run development server (uses nodemon)
npm run dev

# Run production server
npm start
```

### Environment Variables (.env)
You must create a `.env` file in the root of the `backend` folder:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/qpt_task_db
JWT_SECRET=your_super_secret_key
JWT_EXPIRE=30d
```

### Database Seeding
To populate the database with initial organizations, projects, tasks, and the Super Admin account:
```bash
node seed.js
```

---

## 2. Top-to-Bottom Architecture Flow

When an HTTP request arrives, it travels through several layers before reaching the database:

1. **Express Server (`server.js`)**: The entry point. It receives the HTTP request and routes it to the appropriate route file (e.g., `app.use('/api/tasks', taskRoutes)`).
2. **Middleware (`middleware/authMiddleware.js`)**: 
   - `protect`: Extracts the JWT from the headers, decodes it, and attaches `req.user` (containing `role` and `organizationId`).
   - `authorize`: Checks if `req.user.role` is allowed to access the route.
3. **Routes (`routes/*.routes.js`)**: Maps the HTTP verb (GET/POST) and URL path to a specific controller function.
4. **Controllers (`controllers/*.controller.js`)**: The "Brain". Validates input, applies business logic, enforces tenant isolation using `req.user.organizationId`, and commands the Model.
5. **Models (`models/*.js`)**: The Mongoose schema definitions mapping directly to MongoDB collections.

---

## 3. Role-Based Access Control (RBAC) Explained

The platform uses a strict hierarchy defined in `User.js`. Every role determines what APIs a user can hit and what data they can see.

| Role | Core Permissions & Scope |
|------|--------------------------|
| **super_admin** | Global Administrator. Bypasses tenant isolation. Can access `/api/organizations` to view all tenants on the platform and activate/deactivate them. Does not have an `organizationId` and cannot participate in tasks. |
| **organization_admin** | Tenant Owner. Has full CRUD access to everything *within their specific organization*. Can create projects, invite users, and view all tasks in their company. |
| **project_manager** | Manager level. Can create projects, tasks, assign work to employees, and manage project details. |
| **team_lead** | Similar to project manager, assists in managing tasks and users, but cannot create top-level projects. |
| **employee** | Standard user. Restricted to viewing projects they are explicitly added to as a `member`. Can only update the status of tasks specifically assigned to them. |
| **viewer** | Read-only access. Can see project progress and task details but cannot create, edit, or delete anything. |

---

## 4. Granular Module Breakdown

Below is a detailed breakdown of every single module in the system, where its code lives, and how it works.

### A. Authentication Module
- **Where it goes:** `routes/auth.routes.js` ➔ `controllers/auth.controller.js` ➔ `models/User.js` & `models/Organization.js`
- **How it works:** 
  - `POST /register`: Creates a new `Organization` and a new `User` (role: `organization_admin`) atomically. Generates a JWT.
  - `POST /login`: Compares the supplied password with the `bcrypt` hashed password in the DB. Generates a JWT containing the user's `id`, `role`, and `organizationId`.
  - `POST /forgotpassword`: Generates a random reset token, hashes it, stores it in the DB, and logs it to the console (pending email integration).
- **Role Interactions:** Publicly accessible. Does not require the `protect` middleware.

### B. Organizations Module (Multi-Tenancy)
- **Where it goes:** `routes/organization.routes.js` ➔ `controllers/organization.controller.js` ➔ `models/Organization.js`
- **How it works:** Represents a tenant company. It acts as the boundary for all data. Every other model (except Super Admin) has an `organizationId` field.
- **Role Interactions:** 
  - `GET /organizations` is locked to `super_admin`.
  - `organization_admin` can hit `GET /organizations/me` to view/update their own company's basic details (like name/logo).

### C. Users / Team Module
- **Where it goes:** `routes/user.routes.js` ➔ `controllers/user.controller.js` ➔ `models/User.js`
- **How it works:** Manages the employees within an organization. Queries are forced to `OrganizationId: req.user.organizationId` so tenants cannot see each other's employees.
- **Role Interactions:**
  - `GET /users`: Accessible by anyone in the org (employees need to see coworkers to assign tasks).
  - `POST /users`: Locked to `organization_admin` and `project_manager` (only they can invite new staff).

### D. Projects Module
- **Where it goes:** `routes/project.routes.js` ➔ `controllers/project.controller.js` ➔ `models/Project.js`
- **How it works:** Groups tasks together. Contains a `managerId` and an array of `members` (ObjectIds).
- **Role Interactions:**
  - `POST /projects`: Locked to `organization_admin` and `project_manager`.
  - `GET /projects`: 
    - Admins see *all* projects in the org.
    - Employees only see projects where their ID is inside the `members` array.

### E. Tasks Module
- **Where it goes:** `routes/task.routes.js` ➔ `controllers/task.controller.js` ➔ `models/Task.js`
- **How it works:** The core unit of work. Supports multiple assignees (`assignedTo` is an array). When a task is created or updated, the controller manually fires `ActivityLog.create()` and `Notification.create()`.
- **Role Interactions:**
  - `POST /tasks`: Anyone except `viewer`.
  - `PUT /tasks/:id/status` (Kanban Move): Employees can only move a task if their ID is in the `assignedTo` array.

### F. Comments Module
- **Where it goes:** `routes/comment.routes.js` ➔ `controllers/comment.controller.js` ➔ `models/Comment.js`
- **How it works:** Simple text records attached to a `taskId`. When added, the controller checks if the commenter is different from the task assignee/creator, and if so, fires `Notification.create()`.
- **Role Interactions:** Any user who has access to the parent task can comment on it.

### G. Activity Logs Module
- **Where it goes:** `routes/activity.routes.js` ➔ `controllers/activity.controller.js` ➔ `models/ActivityLog.js`
- **How it works:** Read-only for the frontend. The backend controllers (Task, Project) automatically generate these records to build an audit trail (e.g., "Status changed from To Do to Done").
- **Role Interactions:** Fetched automatically when viewing a task. Visible to anyone who can view the task.

### H. Notifications Module
- **Where it goes:** `routes/notification.routes.js` ➔ `controllers/notification.controller.js` ➔ `models/Notification.js`
- **How it works:** Created by backend triggers (like new task assignments or comments). The frontend polls `GET /notifications` to populate the bell icon.
- **Role Interactions:** A user can only fetch notifications where `userId: req.user.id`.

### I. Uploads / Attachments Module
- **Where it goes:** `routes/upload.routes.js` ➔ `controllers/upload.controller.js`
- **How it works:** Uses `multer` middleware in the route definition to intercept `multipart/form-data`. Saves the physical file to the local disk (`/uploads`). The controller then pushes the file path string into the Task's `attachments` array.
- **Role Interactions:** Any user who can view a task can upload attachments to it.

### J. Reports & Analytics Module
- **Where it goes:** `routes/reports.routes.js` ➔ `controllers/reports.controller.js`
- **How it works:** Does not have a dedicated model. It uses Mongoose Aggregation pipelines (`$match`, `$group`, `$lookup`) on the `Task` and `Project` collections to calculate KPIs like total active projects, overdue tasks, and employee workload without overwhelming memory.
- **Role Interactions:** Dashboards are customized. Admins see metrics for the entire org. Employees only see metrics calculated against tasks/projects assigned to them.

### K. Global Search Module
- **Where it goes:** `routes/search.routes.js` ➔ `controllers/search.controller.js`
- **How it works:** A single endpoint `GET /search?q=query` that performs `$regex` queries across the `Project`, `Task`, and `User` models simultaneously, returning a unified array of results.
- **Role Interactions:** Respects the same visibility rules as standard GET requests (employees only find tasks/projects they are assigned to).

### L. Calendar Module
- **Where it goes:** `routes/calendar.routes.js` ➔ `controllers/calendar.controller.js`
- **How it works:** Fetches both `Tasks` and `Projects` where `dueDate` exists and is not null. Maps both Mongoose collections into a unified generic `events` array shape: `{ id, title, date, type }`.
- **Role Interactions:** Respects the same visibility rules as standard GET requests.
