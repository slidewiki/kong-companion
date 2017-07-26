FROM node:6.11-slim
MAINTAINER Kurt Junghanns <kjunghanns@informatik.uni-leipzig.de>

RUN mkdir /nodeApp
WORKDIR /nodeApp

# ------------------------ #
#   Installation certbot   #
# ------------------------ #

RUN echo "deb http://ftp.debian.org/debian jessie-backports main" >> /etc/apt/sources.list && apt-get update && apt-get install -y certbot -t jessie-backports

# --------------------------- #
#   Installation docker-gen   #
# --------------------------- #

RUN wget https://github.com/jwilder/docker-gen/releases/download/0.7.3/docker-gen-linux-amd64-0.7.3.tar.gz && tar xvzf docker-gen-linux-amd64-0.7.3.tar.gz && rm -f docker-gen-linux-amd64-0.7.3.tar.gz && cp docker-gen /usr/bin/docker-gen
ENV DOCKER_HOST=unix:///tmp/docker.sock

# ----------------------- #
#   Installation NodeJS   #
# ----------------------- #

ADD ./application/package.json ./
RUN npm install --production

# ----------- #
#   Cleanup   #
# ----------- #

RUN apt-get autoremove -y && apt-get -y clean && \
		rm -rf /var/lib/apt/lists/*

# Add files
ADD ./application/ ./
ADD container.tpl container.tpl

# -------- #
#   Run!   #
# -------- #

ENTRYPOINT docker-gen -watch -interval 360 container.tpl container.json
CMD -notify "node application/createAPIs.js && certbot certonly"
