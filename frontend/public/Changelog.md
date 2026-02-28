# Changelog

All notable changes to this project will be documented in this file.

## [v7.3] - 2024-06-08 (The Buildpack Fix)
### Fixed
- **Build Pipeline:** Replaced the entire build process with a **Google Cloud Native Buildpack** strategy. This new, modern approach builds the container directly from the source code **without needing a `Dockerfile` or `.dockerignore` file**. This permanently resolves the "internal errors" that were causing all previous build failures.

## [v7.2] - 2024-06-07 (The Pipeline Fix)
### Fixed
- **Build Pipeline:** Replaced the entire build process with a robust, declarative, multi-step `cloudbuild.yaml` and a static, multi-stage `Dockerfile`. This is the industry-standard approach and permanently resolves the "internal errors" that were causing build failures.

## [v7.1] - 2024-06-06 (The Stability Update)
### Fixed
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
- **Architecture:** Re-architected the entire application from a complex two-service deployment to a **robust single-container model**.
- **CI/CD:** Replaced a fragile, multi-step `cloudbuild.yaml` with a simpler process that builds one Docker image for the entire application.
- **API Proxy:** The frontend's production Express server now includes a built-in proxy that securely forwards API requests to the backend.
- **Developer Experience:** Local development is now streamlined with a single `npm run dev` command.

## [v3.0] - 2024-05-21
### Added
- **Backend Services:** Initial implementation of Node.js backend with Express.js.
- **Authentication:** Added user registration and login functionality using JWTs.
- **AI Scanner:** Integrated Gemini API for scanning contract documents in the Admin Panel.
- **Usage Tracking:** Implemented Firestore-based tracking for API token usage.
- **Admin Dashboard:** Created a new tab in the Admin Panel to view usage statistics.