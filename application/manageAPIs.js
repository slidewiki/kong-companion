'strict mode'

console.log('Starting updating APIs of Kong');

const kongAPI = require('./kong_api.js'),
  fs = require('fs'),
  containers = JSON.parse(fs.readFileSync('./container.json', 'utf8'));

console.log('Read '+containers.length+' container');

return kongAPI.listAPIs()
  .then((apis) => {
    let newAPIs = [];
    containers.forEach((container) => {
      if (!container.Env || !container.Env.LETSENCRYPT_HOST)
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
        if (container.Env && container.Env.LETSENCRYPT_HOST === api.hosts[0]) {
          found = true;
          return;
        }
      });

      if (!found)
        obsoleteAPIs.push(api);
    });
    console.log('Found '+obsoleteAPIs.length+' obsolete APIs');


    return kongAPI.listCertificates((certificates) => {
      process.exit(0);
    });
  })
  .catch((error) => {
    console.log('Error', error);
  });
