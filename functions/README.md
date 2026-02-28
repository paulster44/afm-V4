# Production-Ready Backend

This is a production-ready backend built with Node.js, Express, TypeScript, and Prisma (PostgreSQL). It features multi-tenant data isolation, Google OAuth, and secure HTTP-only cookies.

## Local Development

1.  **Install Dependencies:**
    ```bash
    cd backend
    npm install
    ```

2.  **Start Local Database:**
    ```bash
    docker-compose up -d
    ```

3.  **Environment Variables:**
    Copy `.env.example` to `.env` and update the values.
    ```bash
    cp .env.example .env
    ```

4.  **Run Migrations:**
    ```bash
    npx prisma migrate dev
    ```

5.  **Start Server:**
    ```bash
    npm run dev
    ```

## Google OAuth Setup

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project or select an existing one.
3.  Navigate to **APIs & Services > Credentials**.
4.  Click **Create Credentials > OAuth client ID**.
5.  Select **Web application** as the application type.
6.  Add Authorized JavaScript origins (e.g., `http://localhost:5173` for local dev).
7.  Add Authorized redirect URIs (e.g., `http://localhost:8080/auth/oauth/google/callback`).
8.  Copy the **Client ID** and **Client Secret** to your `.env` file.

## Google Cloud Deployment (Cloud Run + Cloud SQL)

### 1. Create Cloud SQL Instance (PostgreSQL)

1.  In the Google Cloud Console, go to **SQL**.
2.  Click **Create Instance** and choose **PostgreSQL**.
3.  Set an instance ID, password, and choose a region.
4.  Once created, create a database (e.g., `mydb`) and a user.
5.  Note the **Connection name** (e.g., `project-id:region:instance-id`).

### 2. Prepare Environment Variables

You will need to set these environment variables in Cloud Run:

*   `DATABASE_URL`: `postgresql://user:password@localhost:5432/mydb?host=/cloudsql/project-id:region:instance-id` (This uses the Cloud SQL Auth Proxy built into Cloud Run).
*   `JWT_SECRET`: A strong, random string.
*   `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
*   `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret.
*   `GOOGLE_REDIRECT_URI`: `https://your-cloud-run-url.run.app/auth/oauth/google/callback`
*   `FRONTEND_URL`: `https://your-frontend-url.com`

### 3. Deploy to Cloud Run

1.  Build and submit the container image using Cloud Build:
    ```bash
    gcloud builds submit --tag gcr.io/PROJECT_ID/backend
    ```

2.  Deploy to Cloud Run:
    ```bash
    gcloud run deploy backend \
      --image gcr.io/PROJECT_ID/backend \
      --platform managed \
      --region REGION \
      --allow-unauthenticated \
      --add-cloudsql-instances project-id:region:instance-id \
      --set-env-vars="DATABASE_URL=postgresql://user:password@localhost:5432/mydb?host=/cloudsql/project-id:region:instance-id,JWT_SECRET=your-secret,GOOGLE_CLIENT_ID=your-id,GOOGLE_CLIENT_SECRET=your-secret,GOOGLE_REDIRECT_URI=https://your-cloud-run-url.run.app/auth/oauth/google/callback,FRONTEND_URL=https://your-frontend-url.com"
    ```

### 4. Run Migrations in Production

To run migrations against your Cloud SQL instance, you can use the Cloud SQL Auth Proxy locally:

1.  Download and start the Cloud SQL Auth Proxy:
    ```bash
    ./cloud-sql-proxy project-id:region:instance-id
    ```
2.  Set your local `DATABASE_URL` to point to the proxy (e.g., `postgresql://user:password@localhost:5432/mydb`).
3.  Run the migration:
    ```bash
    npx prisma migrate deploy
    ```

## Security Checklist

*   [ ] Change `JWT_SECRET` to a strong, random value in production.
*   [ ] Ensure `NODE_ENV` is set to `production` in Cloud Run (this enables the `secure` flag on cookies).
*   [ ] Configure `FRONTEND_URL` correctly to restrict CORS.
*   [ ] Restrict Google OAuth authorized origins and redirect URIs to your production URLs.
*   [ ] Use IAM roles to restrict access to the Cloud SQL instance.
