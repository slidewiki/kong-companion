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

RUN wget https://github.com/jwilder/docker-gen/releases/download/0.7.3/docker-gen-linux-amd64-0.7.3.tar.gz && tar xvzf docker-gen-linux-amd64-0.7.3.tar.gz && cp docker-gen /usr/bin/docker-gen


# ----------------------- #
#   Installation NodeJS   #
# ----------------------- #

ADD ./application/package.json ./
RUN npm install --production

ADD ./application/ ./

# ----------- #
#   Cleanup   #
# ----------- #

RUN apt-get autoremove -y && apt-get -y clean && \
		rm -rf /var/lib/apt/lists/*

# -------- #
#   Run!   #
# -------- #

Entrypoint []
CMD supervisord
