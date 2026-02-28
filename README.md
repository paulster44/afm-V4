# AFM Smart Contract Generator ✨

**Version: 8.0 (Full-Stack Firebase Edition)**

A scalable, secure, and configuration-driven web application designed to dynamically generate American Federation of Musicians (AFM) and Canadian Federation of Musicians (CFM) contracts. It simplifies the complex process of creating union-compliant agreements by providing an intuitive wizard, real-time wage calculations, cross-device contract saving, and PDF export capabilities.

---

## Table of Contents

- [Core Concept & Architecture](#core-concept--architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- ["From Zero to Launch" (Quick Start)](#from-zero-to-launch-quick-start)
- [Project Structure](#project-structure)
- [Data Models (Database Schema)](#data-models)
- [Authentication Workflow](#authentication-workflow)
- [Adding New Content (Locals & Contracts)](#adding-new-content)
- [Deployment Guide](#deployment-guide)

---

## Core Concept & Architecture

The primary goal of this project is to create a single platform capable of serving any AFM/CFM local across North America. Because every local has a unique set of contracts, wage scales, and work rules, the frontend is built entirely on a **configuration-driven architecture**.

Instead of hardcoding GUI forms and math, the interface and calculation engine are generated dynamically from JSON configuration files (e.g., `local_47.json`, `local_802.json`) read by the React components.

This frontend is backed by a **Google Cloud / Firebase backend**. User sessions are managed by Firebase Authentication, while the actual application data (Users, Workspaces, Contracts) resides in a relational **PostgreSQL** database managed via **Prisma ORM**, ensuring robust data integrity and cross-device syncing.

---

## Key Features

1.  **Dynamic Contract Forms**: User interfaces assemble themselves on-the-fly based on the selected local's JSON configuration.
2.  **Real-time Calculation Engine**: The financial summary updates instantly as users input engagement details, factoring in base wages, pension, health, overtime, and multipliers.
3.  **Cross-Device Persistence**: Contracts are securely saved to a PostgreSQL database tied to the user's account, allowing a contract started on mobile to be finished on a desktop.
4.  **PDF Generation**: Export completed contract data into professionally formatted, printable PDF documents ready for signatures.
5.  **Multi-Language / Multi-Local Support**: Seamlessly switch between different locals, each with completely unique sets of contracts and rules.
6.  **Secure Authentication**: Integrated with Firebase Authentication, providing frictionless Google OAuth logins and strict Email Verification.
7.  **Administrative Tools & God Mode**: Role-based access control grants Admins access to an internal AI Contract Scanner and platform Usage Statistics. God Mode (Superuser) grants the exclusive ability to assign Admin privileges to other users, ensuring strict separation of power and preserving data privacy (Admins cannot view other users' private contracts).

---

## Tech Stack

### Frontend
*   **React 18** (Vite build system)
*   **Tailwind CSS** (Styling and responsive design)
*   **Firebase JS SDK** (Authentication)
*   **jsPDF & html2canvas** (Client-side PDF generation)

### Backend
*   **Node.js / Express** (API Server)
*   **Firebase Admin SDK** (Token verification)
*   **Prisma ORM** (Database interaction)
*   **PostgreSQL** (Managed via Google Cloud SQL / Firebase Data Connect)

### Infrastructure
*   **Firebase Hosting** (Frontend delivery)
*   **Firebase Cloud Functions (2nd Gen)** (Backend API hosting, scales to zero)
*   **Google Cloud SQL** (Database)

---

## "From Zero to Launch" (Quick Start)

Follow these steps to run the full-stack application on your local development machine.

### Prerequisites
*   Node.js (v20.x recommended to match Cloud Functions)
*   PostgreSQL database running locally (or a connection string to a cloud DB)
*   Firebase CLI (`npm install -g firebase-tools`)

### 1. Database Setup
Create a PostgreSQL database and add its connection string to your backend `.env` file:
```bash
# functions/.env
DATABASE_URL="postgresql://user:password@localhost:5432/afm_contracts"
```

Apply the database schema using Prisma:
```bash
cd functions
npm run migrate:dev
```

### 2. Run the Backend API
Start the Express server on port 3001:
```bash
cd functions
npm run dev
```

### 3. Run the Frontend
In a new terminal, start the React Vite server:
```bash
# frontend/.env
VITE_API_URL="http://localhost:3001/api"
```

```bash
cd frontend
npm run dev
```
The application will be running at `http://localhost:5173`.

---

## Project Structure

```text
afm-v4/
├── frontend/                     # React Application
│   ├── public/configs/           # Core JSON definitions for wage scales and rules
│   ├── src/
│   │   ├── components/           # UI elements (Wizard, Forms, Modals)
│   │   ├── contexts/             # React Contexts (AuthContext handles Firebase sync)
│   │   ├── hooks/                # Custom hooks (useContractStorage for DB API calls)
│   │   └── utils/                # Firebase initialization and PDF generators
│   └── vite.config.ts            # Build system config
│
├── functions/                    # Node.js / Express Backend
│   ├── prisma/                   # Database schema definition (schema.prisma) and migrations
│   ├── src/
│   │   ├── middleware/           # auth.ts (Validates Firebase ID tokens)
│   │   ├── routes/               # REST API endpoints (contracts.ts, auth.ts)
│   │   └── index.ts              # Express app entry point & Firebase Function wrapper
│   └── package.json
│
└── firebase.json                 # Maps /api requests to Cloud Functions and handles Hosting
```

---

## Data Models

The core PostgreSQL database schema (defined in `functions/prisma/schema.prisma`) revolves around:

*   **User**: The central identity, synced automatically from Firebase Authentication via the `/api/auth/me` endpoint.
*   **Workspace**: Groups of data (currently 1:1 with Users, extensible for teams).
*   **Membership**: Defines the user's role within a Workspace (e.g., OWNER).
*   **Contract**: A saved contract shell containing metadata (local index, contract type).
*   **ContractVersion**: Distinct snapshots of a contract's form parameters over time, allowing rollback and historical tracking. 

*If a user deletes their account, all associated Workspaces, Contracts, and Versions are deleted via Prisma cascade operations.*

---

## Authentication Workflow

1.  **Frontend**: User clicks "Sign in with Google" or logs in via email on `LoginPage.tsx`.
2.  **Firebase**: Firebase verifies credentials and returns a secure ID Token.
3.  **Bridge**: The frontend `AuthContext` detects the token and makes an immediate call to `GET /api/auth/me`.
4.  **Backend Verification**: The backend `requireAuth` middleware uses the `firebase-admin` SDK to cryptographically verify the token.
5.  **Provisioning**: The backend checks if the user exists in PostgreSQL. If not, it creates a new `User` and `Workspace` tying the Firebase UID to the relational structure.
6.  **Session**: The frontend includes the `Authorization: Bearer <token>` in all subsequent API requests (like saving contracts).

---

## Adding New Content

### Adding a New Local
1.  Add a new `local_XXX.json` file to `frontend/public/configs/`.
2.  Add the local to the master index in `frontend/public/configs/locals.json`.

### Modifying Wage Scales or Rules
Open the corresponding `local_XXX.json` file. The frontend automatically parses changes to `wageScales` (rates/durations) and `rules` (overtime/health/pension minimums) without requiring code recompilation.

---

## Deployment Guide

Deploying the entire stack to Google Cloud / Firebase requires a single command. 

```bash
firebase deploy --only functions,hosting
```

**What this does under the hood:**
1.  **Functions**: Compiles the Express backend, automatically runs `prisma generate` via `npm run postinstall` inside the Cloud Run container, and deploys to a 2nd Gen HTTPS function. A non-blocking asynchronous script runs on startup to securely apply `prisma migrate deploy` to the live Cloud SQL database.
2.  **Hosting**: Compiles the Vite React frontend into static files and uploads them to Firebase global edge nodes. Configures a URL rewrite so that any requests to `/api/*` are securely routed to the Cloud Function, preventing CORS issues.
