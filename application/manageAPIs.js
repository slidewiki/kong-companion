'strict mode'

console.log('Starting updating APIs of Kong');

const kongAPI = require('./kong_api.js'),
  fs = require('fs'),
  containers = JSON.parse(fs.readFileSync('./container.json', 'utf8'));

console.log('Read '+containers.length+' container');

/*
This code prepares Kong and a config file for certbot.
Detailed:
 * Update APIs of Kong (while reading running containers - description stored in container.json)
 * Detect for which domain a new certificate have to be created and store the summary in a config file
*/

let domains = containers.reduce((s, container) => {
  if (container.State && container.State.Running && container.Env && container.Env.LETSENCRYPT_HOST) {
    if (!s.has(container.Env.LETSENCRYPT_HOST))
      s.add(container.Env.LETSENCRYPT_HOST);
  }
  return s;
}, new Set());

return kongAPI.listAPIs()
  .then((apis) => {
    let newAPIs = [];
    containers.forEach((container) => {
      if (!container.State || !container.State.Running || !container.Env || !container.Env.LETSENCRYPT_HOST)
        return;
      let found = false;
      apis.data.forEach((api) => {
        if (container.Env.LETSENCRYPT_HOST === api.hosts[0]) {
          found = true;
          return;
        }
      });

      if (!found)
        newAPIs.push(container);
    });
    console.log('Found '+newAPIs.length+' new containers (for new APIs)');

    let obsoleteAPIs = [];
    apis.data.forEach((api) => {
      let found = false;
      containers.forEach((container) => {
        if (container.State && container.State.Running && container.Env && container.Env.LETSENCRYPT_HOST === api.hosts[0]) {
          found = true;
          return;
        }
      });

      if (!found)
        obsoleteAPIs.push(api);
    });
    console.log('Found '+obsoleteAPIs.length+' obsolete APIs');

    //TODO Update APIs where the container has now another IP

    //---------------------------------------------------------

    let promises = array();
    obsoleteAPIs.forEach((api) => {
      promises.push(kongAPI.deleteUpstreamHost(api.id));
    });
    newAPIs.forEach((container) => {
      promises.push(kongAPI.addUpstreamHost(container.Env.LETSENCRYPT_HOST, container.Env.LETSENCRYPT_HOST, 'http://'+container.IP));
    });

    Promise.all(promises)
      .then(values => {
        //---------------------------------------------------------

        return kongAPI.listCertificates((data) => {
          let domainsWhichNeedACertificate = ();
          //not valid certificates have to be deleted
          //diff between existing certificate hosts and container domains is the set for which new certificates have to be created

          let certificates = data.data;
          
        });

      }).catch(reason => {
        console.log('Failed managing APIs: ', reason);
        process.exit(0);
      });
  })
  .catch((error) => {
    console.log('Error', error);
    process.exit(0);
  });
