ARG IMAGE=node:11-alpine

FROM ${IMAGE} AS Builder
ARG DOCKER_TAG=
WORKDIR /build
COPY package*.json ./
RUN if [ "${DOCKER_TAG}" != $(awk '/version/{gsub(/("|",)/,"",$2);print $2};' package.json) ]; then echo "Wrong package version. Tag version '${DOCKER_TAG}' should be equal to package version" >&2; exit 254; fi
RUN npm install --no-progress
COPY bin/ ./bin/
COPY res/ ./res/
COPY src/ ./src/
COPY test/ ./test/
COPY README.md ./
COPY .npmrc ./
COPY tsconfig.json ./
COPY tslint.json ./
RUN CI_COMMIT_TAG="${DOCKER_TAG}" npm run build
RUN npm run test:only
RUN cd .dist && npm install --production --no-progress
RUN chown root:root -R .dist
RUN mkdir -p usr/local/zxteamorg/
RUN mv .dist usr/local/zxteamorg/messenger-bridge
COPY log4js.json ./etc/zxteamorg/messenger-bridge/log4js.json
COPY messenger-bridge.toml ./etc/zxteamorg/messenger-bridge/messenger-bridge.toml
COPY messenger-bridge-devel.toml ./etc/zxteamorg/messenger-bridge/messenger-bridge-devel.toml
COPY docker/docker-entrypoint.sh ./usr/local/bin/

FROM ${IMAGE}
COPY --from=Builder /build/ /
EXPOSE 8080
ENV LOG4JS_CONFIG=/etc/zxteamorg/messenger-bridge/log4js.json
ENTRYPOINT [ "/usr/local/bin/docker-entrypoint.sh" ]
CMD ["--config-toml-file=/etc/zxteamorg/messenger-bridge/messenger-bridge.toml","--config-env"]
