#!/bin/bash

node manageAPIs.js >> node.log

certbot certonly >> certbot.log
