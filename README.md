# kong-companion
This container contains docker-gen, certbot and node which will interact with Kong and all running contains to add a lets encrypt with automatically creation and renewal of certificates


Start test container:
docker build -t kong-companion .  && docker run -it --name kong-companion --rm --link kong_kong_1 -e KONG_ADMIN_URL=http://kong_kong_1:8001/ -v /var/run/docker.sock:/tmp/docker.sock:ro kong-companion
