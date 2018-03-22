# kong-companion
This contains docker-gen, certbot and node.
docker-gen will observe the containers and will trigger node on changes.
Node will detect the changes and filter out which certificates have to be added and removed.
Node will then use certbot to get missing certificates and update Kong via the Admin interface.
It uses certbot in the same way as https://github.com/luispabon/kong-certbot-agent

## Commands
Start test container:
```
docker build -t kong-companion .  && docker run -it --name kong-companion --rm --link kong_kong_1 -e KONG_ADMIN_URL=http://kong_kong_1:8001/ -v /var/run/docker.sock:/tmp/docker.sock:ro kong-companion
```

Create certbot API:
```
curl -i -X POST --url http://localhost:8001/apis/ --data 'name=certbot' --data 'upstream_url=http://172.17.0.5/.well-known/acme-challenge/' --data 'methods=GET,OPTIONS' --data 'uris=/.well-known/acme-challenge' --data 'http_if_terminated=true'
```

Start certbot-agent:
```
docker run -it --name kong-certbot-agent --link kong phpdockerio/kong-certbot-agent ./certbot-agent certs:update http://kong:8001 kjunghanns@informatik.uni-leipzig.de test.slidewiki.de
```

Start Kong:
```
docker run -d --rm --name kong -e "KONG_DATABASE=postgres" -e "KONG_PG_HOST=kong-database" -e KONG_PG_USER=postgres -p 80:8000  -p 443:8443 -p 8001:8001 -p 8444:8444 -e "KONG_LOG_LEVEL=info" -e "KONG_ADMIN_LISTEN=0.0.0.0:8001" -e "KONG_ADMIN_LISTEN_SSL=0.0.0.0:8444" --link=kong-database --link=testservice kong
```
