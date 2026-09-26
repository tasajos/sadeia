FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=America/La_Paz
RUN apk add --no-cache tzdata
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p uploads exports
EXPOSE 4000
CMD ["node", "src/server.js"]
