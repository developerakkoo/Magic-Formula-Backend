FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY ./src ./src
COPY .env .env
COPY magic-formula-d55e8-firebase-adminsdk-fbsvc-f0f70a2c7c.json ./firebase.json

EXPOSE 5000

CMD ["node", "src/index.js"]
