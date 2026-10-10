FROM node:20-alpine

WORKDIR /app

# Install dependencies needed for compiling if any
RUN apk add --no-cache ffmpeg

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Compile TypeScript
RUN npx tsc

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
