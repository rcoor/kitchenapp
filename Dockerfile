# --- build stage: compile the Vite SPA ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Public client config (safe to bake — the publishable key ships in the bundle
# regardless). Override at build time with --build-arg if you point at another
# Supabase project.
ARG VITE_SUPABASE_URL=https://xhscpwtvvjalfpzfarqw.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mlTvWERgM5QSY922srcrBA_kWd6z5z_
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# --- runtime stage: serve static files with nginx ---
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
