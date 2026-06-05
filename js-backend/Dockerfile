# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy dependency manifests first so Docker can cache installs
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

EXPOSE 5000

CMD ["node", "./bin/www"]
