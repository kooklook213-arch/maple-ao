FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# bake env at build time (Vite reads VITE_*; REACT_APP_* also read defensively)
ARG REACT_APP_GOOGLE_SCRIPT_URL
ENV REACT_APP_GOOGLE_SCRIPT_URL=$REACT_APP_GOOGLE_SCRIPT_URL
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
