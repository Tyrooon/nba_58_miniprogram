FROM node:20

WORKDIR /app

# Copy and install server dependencies (node:20 includes python3/make/g++ for sqlite3 native build)
COPY server/package*.json ./server/
RUN cd server && npm install --include=dev

# Build TypeScript
COPY server/ ./server/
RUN cd server && npm run build

# Copy webapp static files into server dist
COPY webapp/ ./server/dist/public/

# Remove dev dependencies to reduce image size
RUN cd server && npm prune --omit=dev

WORKDIR /app/server

EXPOSE 4000

CMD ["node", "dist/index.js"]
