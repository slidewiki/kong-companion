'use strict';
/* eslint promise/no-return-wrap: "off" */

console.log('Starting updating APIs of Kong');

const kongAPI = require('./kong_api.js'),
  fs = require('fs'),
  containers = JSON.parse(fs.readFileSync('./container.json', 'utf8'));
const EMAIL = require('./configuration.js').EMAIL,
  companionIP = '172.17.0.5', //later use compose service name
  LetsEncryptPrefix = require('./configuration.js').LetsEncryptPrefix;

console.log('Read '+containers.length+' container from docker-gen file');

/*
This code prepares Kong and a config file for certbot.
Detailed:
//get domains from containers
//delete not needed services and routes (just lets encrypt ones) (first routes via /services/{service name or id}/routes and then the services)
//update changed upstreams (just lets encrypt ones)
//create services and route for the missing domains
//add to list of new apis, apis which need a new certificate
//create a service and a route for the companion
//delete unneeded certificates
//get the certificates
//Add certificates with domain to Kong (perhaps at the end?)
//delete service and the route of the companion
*/

//get domains from containers
let domains = containers.reduce((s, container) => {
  if (container.State && container.State.Running && container.Env && container.Env.LETSENCRYPT_HOST) {
    if (!s.has(container.Env.LETSENCRYPT_HOST))
      s.add(container.Env.LETSENCRYPT_HOST);
  }
  return s;
}, new Set());

console.log('Detected ' + domains.size + ' domains from containers:', domains);

let newAPIs = [];
let obsoleteAPIs = [];
let promises = [];
let lastAPIs = [];
let currentCertificates = [];
let apisForWhichACertificateIsNeeded = [];
kongAPI.listAPIs() //NOTE dont forget that entry could have routes as attribute
  //delete not needed services and routes (just lets encrypt ones) (first routes via /services/{service name or id}/routes and then the services)
  //Also get new apis
  .then((apis) => {
    containers.forEach((container) => {
      if (!container.State || !container.State.Running || !container.Env || !container.Env.LETSENCRYPT_HOST)
        return;
      let found = false;
      (apis || []).forEach((api) => {
        if (api.domain && container.Env.LETSENCRYPT_HOST === api.domain) {
          found = true;
          return;
        }
      });

      if (!found)
        newAPIs.push(container);
    });
    console.log('Found '+newAPIs.length+' new containers (for new APIs)');

    (apis || []).forEach((api) => {
      let found = false;
      containers.forEach((container) => {
        if (container.State && container.State.Running && container.Env && api.domain && container.Env.LETSENCRYPT_HOST === api.domain) {
          found = true;
          return;
        }
      });

      if (!found)
        obsoleteAPIs.push(api);
    });
    console.log('Found '+obsoleteAPIs.length+' obsolete APIs');

    obsoleteAPIs.forEach((api) => {
      promises.push(kongAPI.deleteUpstreamHost(api.route.id, api.service.id));
    });
    return Promise.all(promises);
  })
  .then(() => {
    return kongAPI.listAPIs(); //NOTE dont forget that entry could have routes as attribute
  })
  //update changed upstreams (just lets encrypt ones)
  //and create services and route for the missing domains
  .then((apis) => {
    lastAPIs = apis;
    let changedUpstreams = [];
    containers.forEach((container) => {
      if (!container.State || !container.State.Running || !container.Env || !container.Env.LETSENCRYPT_HOST)
        return;
      let found = false;
      (apis || []).forEach((api) => {
        if (api.domain && container.Env.LETSENCRYPT_HOST === api.domain) {
          found = api;
          return;
        }
      });

      if (found && container.IP !== found.service.host) {
        console.log('Found mismatching IP of service:', found.service, container);
        changedUpstreams.push({container: container, api: found});
      }
    });
    console.log('Found '+changedUpstreams.length+' APIs with outdated upstream');

    promises = [];
    changedUpstreams.forEach((entry) => {
      promises.push(kongAPI.updateService(entry.api.service.id, LetsEncryptPrefix + entry.container.Env.LETSENCRYPT_HOST, 'http://' + entry.container.IP));
    });
    newAPIs.forEach((container) => {
      promises.push(kongAPI.addUpstreamHost(container.Env.LETSENCRYPT_HOST, 'http://'+container.IP));
    });

    return Promise.all(promises);
  })
  .then(() => {
    return kongAPI.listCertificates();
  })
  //add to list of new apis, apis which need a new certificate
  //create a service and a route for the companion
  .then((certificates) => {
    currentCertificates = certificates;
    apisForWhichACertificateIsNeeded = [].concat(newAPIs);
    certificates.forEach((certificate) => {
      const domain = certificate.snis[0];
      let matchingApi = lastAPIs.find((api) => api.route.hosts[0] === domain);
      if (matchingApi) {
        const now = (new Date()).getTime();
        if (now > certificate.created_at + 89*24*60*60*1000) { //89 days
          apisForWhichACertificateIsNeeded.push(matchingApi);
        }
      }
    });

    //create service and route for companion
    return kongAPI.addCompanionAPI('http://' + companionIP);
  })
  //delete unneeded certificates
  .then(() => {
    promises = [];
    currentCertificates.forEach((certificate) => {
      if (!domains.has(certificate.snis[0]))
        promises.push(kongAPI.deleteCertificate(certificate.id));
    });
    return Promise.all(promises);
  })
  //get the certificates
  .then(() => {
    console.log('Removed', promises.length, 'Certificates!');

    if (apisForWhichACertificateIsNeeded.length < 1) {
      console.log('No need to create certificates');
      return Promise.resolve();
    }

    // build command string
    const domainsForCertbot = apisForWhichACertificateIsNeeded.reduce((a, curr) => {
      const d = curr.domain || curr.Env.LETSENCRYPT_HOST;
      if (a === '')
        return d;
      return a + ',' + d;
    }, '');
    let cmd = 'certbot certonly --agree-tos --standalone --preferred-challenges http -n -m ' + EMAIL + ' --expand -d ' + domainsForCertbot;

    console.log('Now executing the certbot command:', cmd);
    const certbot_log = require('child_process').execSync(cmd);
    //TODO check log
    console.log('The command returned:', certbot_log);

    return Promise.resolve();
  })
  //Add certificates with domain to Kong
  .then(() => {
    promises = [];
    const path = '/etc/letsencrypt/live';
    apisForWhichACertificateIsNeeded.forEach((api) => {
      promises.push(kongAPI.addCertificate(api.domain || api.Env.LETSENCRYPT_HOST, path));
    });

    return Promise.all(promises);
  })
  //delete service and the route of the companion
  .then(() => {
    console.log('Added', promises.length, 'Certificates!');

    return kongAPI.deleteUpstreamHost('kong-companion');
  })
  .then(() => {
    console.log('Success!');
    process.exit(0);
  })
  .catch((error) => {
    console.log('Error', error);
    process.exit(0);
  });
