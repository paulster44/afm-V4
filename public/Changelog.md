# Changelog

All notable changes to this project will be documented in this file.

## [v7.1] - 2024-06-06 (The Stability Update)
### Fixed
- **Build Pipeline:** Resolved critical "internal errors" by removing the root `Dockerfile` and implementing a new `cloudbuild.yaml` that generates the Dockerfile dynamically in a single step. This provides a fast, cached, and reliable build process.
- **Security:** Replaced insecure hardcoded admin password with a secure, backend-driven, role-based access control system for the admin panel.
- **Security:** Moved all Gemini API calls to a secure backend endpoint, removing API key exposure from the frontend.
- **PDF Generation:** Fixed a bug that caused PDF generation to fail for documents longer than one page.
### Added
- **Auto-Save Drafts:** The contract wizard now automatically saves user progress to the browser's local storage. Users are prompted to restore their work if they accidentally navigate away, preventing data loss.
- **Admin Usage Dashboard:** The admin panel now includes a dashboard to monitor API token usage by user and over time.
- **User Authentication:** Implemented a full user registration and login system with secure password hashing and JWT-based sessions.
### Changed
- **UI/UX:** The Admin Panel link is now only visible to authenticated admin users.
- **UI/UX:** Added a full-screen loading overlay during AI contract scanning to provide better user feedback.


## [v7.0] - 2024-06-05 (The Monorepo Merger)
### Changed
- **Architecture:** Re-architected the entire application from a complex two-service deployment to a **robust single-container model**. Both the frontend and backend are now built and deployed together as a single, unified service on Cloud Run.
- **CI/CD:** Replaced the fragile, multi-step `cloudbuild.yaml` with a simple and reliable process that builds one Docker image for the entire application. This completely resolves all previous build and deployment pipeline failures.
- **API Proxy:** The frontend's production Express server now includes a built-in proxy that securely forwards API requests to the backend, eliminating the need for runtime environment variable injection and simplifying client-side code.
- **Developer Experience:** Local development is now streamlined. A single `npm run dev` command at the project root now starts both frontend and backend services concurrently. The `docker-compose.yml` file has been deprecated.

## [v3.0] - 2024-05-21
### Added
- **Backend Services:** Initial implementation of Node.js backend with Express.js.
- **Authentication:** Added user registration and login functionality using JWTs.
- **AI Scanner:** Integrated Gemini API for scanning contract documents in the Admin Panel.
- **Usage Tracking:** Implemented Firestore-based tracking for API token usage.
- **Admin Dashboard:** Created a new tab in the Admin Panel to view usage statistics.
