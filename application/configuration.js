/* This module is used for configurating the mongodb connection*/
'use strict';

const co = require('./common');

//read URLs from ENV
let kongURL = '',
  email = 'kjunghanns@informatik.uni-leipzig.de';
if (!co.isEmpty(process.env.KONG_ADMIN_URL)){
  kongURL = process.env.KONG_ADMIN_URL;
}
if (!co.isEmpty(process.env.LETSENCRYPT_EMAIL)){
  email = process.env.LETSENCRYPT_EMAIL;
}


module.exports = {
  URLS: {
    KONG_ADMIN: kongURL
  },
  LetsEncryptPrefix: 'le-',
  EMAIL: email
};
