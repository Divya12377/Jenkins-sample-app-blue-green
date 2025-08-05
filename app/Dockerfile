FROM node:14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN apt-get update && apt-get install -y curl
EXPOSE 3000
CMD ["node", "server.js"]
