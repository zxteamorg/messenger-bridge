ARG BASE_IMAGE=node:16-alpine

# BUILD_CONFIGURATION is local, snapshot or release
ARG BUILD_CONFIGURATION=local



#                                                                                   #
#  ____    _   _   ___   _       ____      ____    _   _      _      ____    _____  #
# | __ )  | | | | |_ _| | |     |  _ \    |  _ \  | | | |    / \    / ___|  | ____| #
# |  _ \  | | | |  | |  | |     | | | |   | |_) | | |_| |   / _ \   \___ \  |  _|   #
# | |_) | | |_| |  | |  | |___  | |_| |   |  __/  |  _  |  / ___ \   ___) | | |___  #
# |____/   \___/  |___| |_____| |____/    |_|     |_| |_| /_/   \_\ |____/  |_____| #
#                                                                                   #
FROM ${BASE_IMAGE} AS builder1_base
ARG BUILD_CONFIGURATION
ARG BUILD_COMMIT_REF
ARG BUILD_COMMIT_TIMESTAMP
ARG BUILD_PIPELINE_URL
ARG BUILD_PROJECT_URL
ARG BUILD_RC_VERSION
ARG BUILD_TAG_VERSION
ARG BUILD_VERSION_APPENDER
WORKDIR /build
RUN apk add --no-cache jq
COPY package*.json ./
RUN \
  set -e; \
  PROJ_VERSION="$(jq -r '.version' package.json)"; \
  set +e; \
  if [ -n "${BUILD_TAG_VERSION}" ]; then \
    if [ "${BUILD_TAG_VERSION}" != "${PROJ_VERSION}" ]; then \
      echo "Project version '${PROJ_VERSION}' is not same to tag version '${BUILD_TAG_VERSION}'. Cannot continue. Try to set correct project before tag creation." >&2; \
      exit 1; \
    fi; \
  fi; \
  if [ -n "${BUILD_VERSION_APPENDER}" ]; then \
    PROJ_SPEC=$(jq ".version = \"${PROJ_VERSION}${BUILD_VERSION_APPENDER}\"" package.json); \
    echo -E "${PROJ_SPEC}" > package.json; \
  fi;
RUN npm install --no-progress
COPY bin ./bin
COPY res ./res
COPY lib ./lib
COPY .npmrc README.md tsconfig.json tsconfig-dist.json tslint.json ./
RUN ls -l && npm run build:dist
RUN cd .dist && npm install --omit=dev --no-progress
RUN chown root:root -R .dist
COPY docker/docker-entrypoint.sh /stage/usr/local/bin/
RUN mkdir -p /stage/usr/local/zxteamorg/
RUN mv .dist /stage/usr/local/zxteamorg/messenger-bridge
COPY messenger-bridge.toml /stage/etc/zxteamorg/messenger-bridge/messenger-bridge.toml

FROM builder1_base AS builder1_local
ONBUILD COPY messenger-bridge-devel.toml /stage/etc/zxteamorg/messenger-bridge/messenger-bridge-devel.toml

FROM builder1_base AS builder1_snapshot
ONBUILD COPY messenger-bridge-devel.toml /stage/etc/zxteamorg/messenger-bridge/messenger-bridge-devel.toml

FROM builder1_base AS builder1_release
# Nothing special for 'release' at build phase yet

FROM builder1_${BUILD_CONFIGURATION} AS builder1



#                                                                                                                    #
#   ____    ___    __  __   ____     ___    ____    ___   _____   _____     ____    _   _      _      ____    _____  #
#  / ___|  / _ \  |  \/  | |  _ \   / _ \  / ___|  |_ _| |_   _| | ____|   |  _ \  | | | |    / \    / ___|  | ____| #
# | |     | | | | | |\/| | | |_) | | | | | \___ \   | |    | |   |  _|     | |_) | | |_| |   / _ \   \___ \  |  _|   #
# | |___  | |_| | | |  | | |  __/  | |_| |  ___) |  | |    | |   | |___    |  __/  |  _  |  / ___ \   ___) | | |___  #
#  \____|  \___/  |_|  |_| |_|      \___/  |____/  |___|   |_|   |_____|   |_|     |_| |_| /_/   \_\ |____/  |_____| #
#                                                                                                                    #

# Compositor merges all artifacts between builds
FROM ${BASE_IMAGE} AS compositor_base

FROM compositor_base AS compositor_local
# Nothing special for 'local' at composite phase yet

FROM compositor_base AS compositor_snapshot
# Nothing special for 'snapshot' at composite phase yet

FROM compositor_base AS compositor_release
# Nothing special for 'release' at composite phase yet

FROM compositor_${BUILD_CONFIGURATION} AS compositor
COPY --from=builder1 /stage /stage
#COPY --from=builder2 /stage /stage
#COPY --from=builder3 /stage /stage



#                                                                                       #
#   ___   __  __      _       ____   _____     ____    _   _      _      ____    _____  #
#  |_ _| |  \/  |    / \     / ___| | ____|   |  _ \  | | | |    / \    / ___|  | ____| #
#   | |  | |\/| |   / _ \   | |  _  |  _|     | |_) | | |_| |   / _ \   \___ \  |  _|   #
#   | |  | |  | |  / ___ \  | |_| | | |___    |  __/  |  _  |  / ___ \   ___) | | |___  #
#  |___| |_|  |_| /_/   \_\  \____| |_____|   |_|     |_| |_| /_/   \_\ |____/  |_____| #
#                                                                                       #

# Base imager
FROM ${BASE_IMAGE} AS imager_base

FROM imager_base AS imager_local
ONBUILD ENV DEBUG_PORT=9229
ONBUILD ENV DEBUG_WAIT=no

FROM imager_base AS imager_snapshot
ONBUILD ENV DEBUG_PORT=9229
ONBUILD ENV DEBUG_WAIT=no

FROM imager_base AS imager_release
# Nothing special for 'release' at image phase yet

# Final image
FROM imager_${BUILD_CONFIGURATION}
ENV DO_INIT_SLEEP=0
COPY --from=compositor /stage/ /
EXPOSE 8080 8443
ENTRYPOINT [ "/usr/local/bin/docker-entrypoint.sh" ]
CMD ["--config-toml-file=/etc/zxteamorg/messenger-bridge/messenger-bridge.toml","--config-env"]
