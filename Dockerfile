FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
# 표를 만든 뒤(여러 번 실행해도 안전) 개발 서버를 켠다. 로컬에서 http로 열어 보는 용도다.
CMD ["sh", "-c", "npm run db:init && npx next dev -H 0.0.0.0 -p 3000"]
