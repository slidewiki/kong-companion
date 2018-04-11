#!/bin/bash

docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"
docker build --build-arg BUILD_ENV=travis -t slidewiki/kong-companion:latest-dev ./
docker push slidewiki/kong-companion:latest-dev
