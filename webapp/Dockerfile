FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY jsconfig.json ./
RUN npm install
COPY . .
EXPOSE 3000
ENV NODE_ENV=development
CMD if [ "$NODE_ENV" = "production" ]; then npm run build && npm start; else npm run dev; fi
