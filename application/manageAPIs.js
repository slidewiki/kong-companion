'strict mode'

console.log('Starting updating APIs of Kong');

const kongAPI = require('./kong_api.js'),
  fs = require('fs'),
  containers = JSON.parse(fs.readFileSync('./container.json', 'utf8'));
const EMAIL = 'kjunghanns@informatik.uni-leipzig.de'; //TODO read setted email from container

console.log('Read '+containers.length+' container from docker-gen file');

/*
This code prepares Kong and a config file for certbot.
Detailed:
 * Update APIs of Kong (while reading running containers - description stored in container.json)
 * Detect for which domain a new certificate have to be created and start certbot
*/

let domains = containers.reduce((s, container) => {
  if (container.State && container.State.Running && container.Env && container.Env.LETSENCRYPT_HOST) {
    if (!s.has(container.Env.LETSENCRYPT_HOST))
      s.add(container.Env.LETSENCRYPT_HOST);
  }
  return s;
}, new Set());

console.log('Detected ' + domains.size + ' domains from containers:', domains);

return kongAPI.listAPIs()
  .then((apis) => {
    let newAPIs = [];
    containers.forEach((container) => {
      if (!container.State || !container.State.Running || !container.Env || !container.Env.LETSENCRYPT_HOST)
        return;
      let found = false;
      apis.data.forEach((api) => {
        if (api.hosts && container.Env.LETSENCRYPT_HOST === api.hosts[0]) {
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
        if (container.State && container.State.Running && container.Env && api.hosts && container.Env.LETSENCRYPT_HOST === api.hosts[0]) {
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

    let promises = [];
    obsoleteAPIs.forEach((api) => {
      // promises.push(kongAPI.deleteUpstreamHost(api.id));//TODO just remove them if they are lets encrypt apis
    });
    newAPIs.forEach((container) => {
      promises.push(kongAPI.addUpstreamHost(container.Env.LETSENCRYPT_HOST, container.Env.LETSENCRYPT_HOST, 'http://'+container.IP));
    });

    Promise.all(promises)
      .then(values => {
        console.log('Changed', promises.length, 'APIs!');
        //---------------------------------------------------------

        return kongAPI.listCertificates()
        .then((data) => {//Stopps here
          //not valid certificates have to be deleted
          //diff between existing certificate hosts and container domains is the set for which new certificates have to be created

          let certificates = data.data;
          let domainsWithoutCertificate = [];
          certificatePromises = [];
          certificatePromises.push(() => {return;});
          certificates.forEach((certificate) => {
            if (!domains.has(certificate.snis[0]))
              certificatePromises.push(kongAPI.deleteCertificate(certificate.id));
          });
          domains.forEach((domain) => {
            if (!certificates.find((certificate) => certificate.snis[0] === domain)) {
              domainsWithoutCertificate.push(domain);
            }
          });

          Promise.all(certificatePromises)
            .then((values) => {
              console.log('Removed', certificatePromises.length-1, 'Certificates!');
              // build command string
              let cmd = 'certbot certonly --agree-tos --standalone --preferred-challenges http -n -m ' + EMAIL + ' --expand -d ' + domainsWithoutCertificate.join(',');

              console.log('Now executing the certbot command:', cmd);
              const certbot_log = require('child_process').execSync(cmd);
              //TODO check log
              console.log('The command returned:', certbot_log);

              let lastPromises = [];
              const path = '/etc/letsencrypt/live';
              domainsWithoutCertificate.forEach((domain) => {
                lastPromises.push(kongAPI.addCertificate(domain, path));
              });

              Promise.all(lastPromises)
                .then((values) => {
                  console.log('Success!');
                  console.log('Added', lastPromises.length, 'Certificates!');
                  //TODO get certificates from Kong and compare
                  process.exit(0);
                })
                .catch((reason) => {
                  console.log('Failed adding certificates: ', reason);
                  process.exit(0);
                });
            })
            .catch((reason) => {
              console.log('Failed deleting certificates: ', reason);
              process.exit(0);
            });
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
