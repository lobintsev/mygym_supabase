FROM node:14

WORKDIR /usr/src/app

COPY package*.json ./

COPY . .

RUN npm install && npm run docs

EXPOSE 8080

CMD ["npm", "start"]