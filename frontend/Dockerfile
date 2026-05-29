# Use a Node image that already includes Yarn classic
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and yarn.lock before copying the entire app
# This allows Docker to cache installed dependencies
COPY package.json yarn.lock ./

# Install dependencies using yarn
RUN yarn install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the React app
RUN yarn build

# Expose the port the app runs on
EXPOSE 3000

# Serve the built React app using a lightweight HTTP server
RUN yarn global add serve
CMD ["serve", "-s", "dist", "-l", "3000"]
