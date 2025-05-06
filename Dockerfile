FROM mcr.microsoft.com/playwright:v1.41.1-jammy

WORKDIR /app

COPY . .

RUN npm install

RUN npx tsc

RUN npx playwright install

CMD ["node", "dist/server.js"]
