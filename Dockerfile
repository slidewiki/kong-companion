FROM ubuntu:xenial
MAINTAINER Kurt Junghanns <kjunghanns@informatik.uni-leipzig.de>

RUN mkdir /nodeApp
WORKDIR /nodeApp

# ------------------------ #
#   Installation NodeJS   #
# ------------------------ #

RUN apt-get update && apt-get -y --no-install-recommends install wget xz-utils && mkdir /usr/local/node
RUN wget --no-check-certificate https://nodejs.org/dist/v8.10.0/node-v8.10.0-linux-x64.tar.xz && tar -xf node-v8.10.0-linux-x64.tar.xz && rm -f node-v8.10.0-linux-x64.tar.xz && cp -r node-v8.10.0-linux-x64/* /usr/local/node/
ENV PATH="/usr/local/node/bin:${PATH}"
RUN node -v
RUN npm -v

# ------------------------ #
#   Installation certbot   #
# ------------------------ #

RUN  echo "deb http://ppa.launchpad.net/certbot/certbot/ubuntu xenial main" > /etc/apt/sources.list.d/letsencrypt.list \
    && apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 7BF576066ADA65728FC7E70A8C47BE8E75BCA694 \
    && apt-get update \
    && apt-get -y --no-install-recommends install nano certbot
RUN certbot --version
EXPOSE 80 443

# --------------------------- #
#   Installation docker-gen   #
# --------------------------- #

RUN wget https://github.com/jwilder/docker-gen/releases/download/0.7.4/docker-gen-linux-amd64-0.7.4.tar.gz && tar xvzf docker-gen-linux-amd64-0.7.4.tar.gz && rm -f docker-gen-linux-amd64-0.7.4.tar.gz && cp docker-gen /usr/bin/docker-gen
ENV DOCKER_HOST=unix:///tmp/docker.sock

# -------------------------- #
#   Installation NodeJS APP  #
# -------------------------- #

ADD ./application/package.json ./
RUN npm install --production

# ----------- #
#   Cleanup   #
# ----------- #

RUN apt-get autoremove -y && apt-get -y clean && \
		rm -rf /var/lib/apt/lists/*

# Add files
RUN touch node.log && touch certbot.log
ADD container.tpl container.tpl
ADD handleContainers.sh handleContainers.sh
ADD ./application/ ./

# -------- #
#   Run!   #
# -------- #

ENTRYPOINT docker-gen -watch -interval 360 container.tpl container.json -notify "/nodeApp/handleContainers.sh"
