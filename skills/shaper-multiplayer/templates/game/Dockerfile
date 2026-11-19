FROM node:22.13.1-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["npm", "start"]
