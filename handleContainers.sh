#!/bin/bash
echo "Now executing NodeJS"
node manageAPIs.js >> node.log
echo "Finished executing"
#certbot certonly --manual --agree-tos --preferred-challenges http -c cli.ini -n >> certbot.log #should use the config file
