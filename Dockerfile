
FROM node:20-alpine AS base

# Install and use pnpm
RUN npm install -g pnpm

# Install Prisma globally
# RUN pnpm install prisma --save-dev

###############################
# BUILD FOR LOCAL DEVELOPMENT #
###############################

FROM base AS development
WORKDIR /app
RUN chown -R node:node /app

COPY --chown=node:node package.json pnpm-lock.yaml ./

# Install all dependencies
RUN pnpm install

# Bundle app source
COPY --chown=node:node . .

RUN npx prisma generate

# Use the node user from the image (non-root)
USER node

#######################
# BUILD BUILDER IMAGE #
#######################

FROM base AS builder
WORKDIR /app

RUN npx prisma migrate dev --name init

COPY --chown=node:node package*.json pnpm-lock.yaml ./
COPY --chown=node:node --from=development /app/node_modules ./node_modules
COPY --chown=node:node --from=development /app/src ./src
COPY --chown=node:node --from=development /app/tsconfig.json ./tsconfig.json
COPY --chown=node:node --from=development /app/tsconfig.build.json ./tsconfig.build.json
COPY --chown=node:node --from=development /app/nest-cli.json ./nest-cli.json

RUN pnpm build

# Removes unnecessary packages and re-install only production dependencies
ENV NODE_ENV production
RUN pnpm prune --prod
RUN pnpm install --prod

USER node

########################
# BUILD FOR PRODUCTION #
########################

FROM node:20-alpine AS production
WORKDIR /app

RUN mkdir -p src/generated && chown -R node:node src

# Copy the bundled code from the build stage to the production image
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/package.json ./

USER node

# Start the server using the production build
CMD [ "node", "dist/main.js" ]