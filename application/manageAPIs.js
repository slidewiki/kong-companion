'strict mode'

console.log('Starting updating APIs of Kong');

const kongAPI = require('./kong_api.js'),
  fs = require('fs'),
  containers = JSON.parse(fs.readFileSync('./container.json', 'utf8'));
const EMAIL = 'kjunghanns@informatik.uni-leipzig.de', //TODO read setted email from container
  companionIP = '172.17.0.5', //later use compose service name
  LetsEncryptPrefix = 'le-';

console.log('Read '+containers.length+' container from docker-gen file');

/*
This code prepares Kong and a config file for certbot.
Detailed:
 *
*/

let domains = containers.reduce((s, container) => {
  if (container.State && container.State.Running && container.Env && container.Env.LETSENCRYPT_HOST) {
    if (!s.has(container.Env.LETSENCRYPT_HOST))
      s.add(container.Env.LETSENCRYPT_HOST);
  }
  return s;
}, new Set());

console.log('Detected ' + domains.size + ' domains from containers:', domains);

return kongAPI.listAPIs() //NOTE dont forget that entry could have routes as attribute
  .then((apis) => {
    let newAPIs = [];
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

    let obsoleteAPIs = [];
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

    let promises = [];
    obsoleteAPIs.forEach((api) => {
      promises.push(kongAPI.deleteUpstreamHost(api.id));
    });
    Promise.all(promises)
      .then(() => {
        //update upstream URLs
        return kongAPI.listAPIs() //NOTE dont forget that entry could have routes as attribute
          .then((apis) => {
            let changedUpstreams = [];
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

              if (found && container.IP === api.route.hosts[0])//TODO
                changedUpstreams.push(container);
            });
            console.log('Found '+changedUpstreams.length+' APIs with outdated upstream');
          })
          .catch((error) => {
            console.log('Error', error);
            process.exit(0);
          });
      })
      .catch((reason) => {
        console.log('Failed delete old APIs: ', reason);
        process.exit(0);
      });

    //TODO Update APIs where the container has now another IP

    //---------------------------------------------------------

    let promises = [];
    obsoleteAPIs.forEach((api) => {
      promises.push(kongAPI.deleteUpstreamHost(api.id));//TODO just remove them if they are lets encrypt apis
    });
    newAPIs.forEach((container) => {
      promises.push(kongAPI.addUpstreamHost(container.Env.LETSENCRYPT_HOST, 'http://'+container.IP));
    });

    Promise.all(promises)
      .then(values => {
        console.log('Changed', promises.length, 'APIs!');
        //---------------------------------------------------------
        process.exit(0);return;
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



  //new workflow

  //get domains from containers
  //delete not needed services and routes (just lets encrypt ones) (first routes via /services/{service name or id}/routes and then the services)
  //update changed upstreams (just lets encrypt ones)
  //create services and route for the missing domains
  //add to list of new apis, apis which need a new certificate
  //create a service and a route for the companion
  //get the certificates
  //Add certificates with domain to Kong (perhaps add the end?)
  //delete service and the route of the companion


  //Remarks:
  // - retrieving a list could contain "next" because the list is too long ...
