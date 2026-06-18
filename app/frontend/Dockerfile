FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# ビルド時にNext.jsの静的アセットを生成
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
