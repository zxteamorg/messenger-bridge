## Application

### Build
```shell
docker build --tag zxteamorg/messenger-bridge/local --file docker/Dockerfile .
```

### Run

```shell
docker run --rm --interactive \
  --env DEBUG_WAIT=yes \
  --publish 9229:9229 \
  zxteamorg/messenger-bridge/local
```

### Debug

```shell
docker run --rm --interactive --tty \
  --entrypoint /bin/sh \
  zxteamorg/messenger-bridge/local
```

## Auto Tests

### Build Tests
```shell
docker build --tag zxteamorg/messenger-bridge/local --file docker/Dockerfile .
docker build --tag zxteamorg/messenger-bridge/local-tests --file docker-tests/Dockerfile.tests .
```

### Run Tests
```shell
docker run --interactive --rm zxteamorg/messenger-bridge/local-tests
```
