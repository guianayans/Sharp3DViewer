FROM node:18 AS build

WORKDIR /app

ARG VITE_APP_PASSWORD
ENV VITE_APP_PASSWORD=${VITE_APP_PASSWORD}

COPY package*.json /app/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . /app
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3040

CMD ["nginx", "-g", "daemon off;"]
