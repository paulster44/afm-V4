FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (ignoring postinstall for now to avoid Prisma errors before schema is available)
RUN npm install --ignore-scripts

# Copy Prisma schema specifically
COPY prisma ./prisma/

# Generate Prisma client now that we have the runtime and schema
RUN npx prisma generate

# Copy the rest of the source code
COPY . .
RUN npm run build

EXPOSE 8080

CMD [ "npm", "start" ]
