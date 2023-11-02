FROM node:14

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install && npm run docs

COPY . .

EXPOSE 8080

CMD ["npm", "start"]