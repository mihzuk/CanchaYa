# Imagen de desarrollo del frontend (docker-compose monta ./frontend/src).
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev"]
