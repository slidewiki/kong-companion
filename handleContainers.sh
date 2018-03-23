#!/bin/bash

node manageAPIs.js >> node.log

#certbot certonly --manual --agree-tos --preferred-challenges http -c cli.ini -n >> certbot.log #should use the config file
