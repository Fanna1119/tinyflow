FROM oven/bun:latest
WORKDIR /app
COPY . /app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "server.js"]
