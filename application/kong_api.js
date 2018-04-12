/*
Controller which configures a Kong instance.
It has functions to create a costumer and a application and also to retrieve a access token for the API.
*/
/* eslint no-inner-declarations: "off" */

'use strict';

let request = require('request'),
  fs = require('fs');

const URLs = require('./configuration.js').URLS,
  KONG_ADMIN = (URLs.KONG_ADMIN === '') ? 'http://localhost:8001/' : URLs.KONG_ADMIN,
  LetsEncryptPrefix = require('./configuration.js').LetsEncryptPrefix;

module.exports = {
  //returns ...
  addUpstreamHost: (hostname, upstreamURL, https_only = true) => {
    let promise = new Promise((resolve, reject) => {
      let options = {
        url: KONG_ADMIN + 'services/',
        method: 'POST',
        json: true,
        body: {
          name: LetsEncryptPrefix + hostname,
          url: upstreamURL
        }
      };

      function callback(error, response, body) {
        console.log('Kong: addService: ', options);
        console.log('Kong: addService: got ', error, response.statusCode, body);

        if (!error && response.statusCode === 201) {
          //now the route
          let protocols = ['https'];
          if (!https_only)
            protocols.push('http');
          options = {
            url: KONG_ADMIN + 'routes/',
            method: 'POST',
            json: true,
            body: {
              hosts: [hostname],
              service: {
                id: body.id
              },
              protocols: protocols
            }
          };

          function callbackRoute(error, response, body) {
            console.log('Kong: addRoute: ', options);
            console.log('Kong: addRoute: got ', error, response.statusCode, body);

            if (!error && response.statusCode === 201) {
              resolve(body);
            } else {
              reject(error);
            }
          }

          request(options, callbackRoute);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });

    return promise;
  },

  addCompanionAPI: (upstreamURL) => {
    let promise = new Promise((resolve, reject) => {
      let options = {
        url: KONG_ADMIN + 'services/',
        method: 'POST',
        json: true,
        body: {
          name: 'kong-companion',
          url: upstreamURL + '/.well-known/acme-challenge/'
        }
      };

      function callback(error, response, body) {
        console.log('Kong: addService: ', options);
        console.log('Kong: addService: got ', error, response.statusCode, body);

        if (!error && response.statusCode === 201) {
          //now the route
          options = {
            url: KONG_ADMIN + 'routes/',
            method: 'POST',
            json: true,
            body: {
              paths: ['/.well-known/acme-challenge'],
              service: {
                id: body.id
              },
              protocols: ['http', 'https'],
              methods: ['GET', 'OPTIONS']
            }
          };

          function callbackRoute(error, response, body) {
            console.log('Kong: addRoute: ', options);
            console.log('Kong: addRoute: got ', error, response.statusCode, body);

            if (!error && response.statusCode === 201) {
              resolve(body);
            } else {
              reject(error);
            }
          }

          request(options, callbackRoute);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });

    return promise;
  },

  //returns nothing
  deleteUpstreamHostDirect: (routeId, serviceId) => {
    let promise = new Promise((resolve, reject) => {
      return removeRoute(routeId)
        .then(() => {
          return removeService(serviceId)
            .then((data) => {
              resolve(data);
            })
            .catch((error) => {
              reject(error);
            });
        })
        .catch((error) => {
          reject(error);
        });
    });

    return promise;
  },

  //returns nothing
  deleteUpstreamHost: (serviceIdentificator) => {
    let promise = new Promise((resolve, reject) => {
      let options = {
        url: KONG_ADMIN + 'services/' + serviceIdentificator + '/routes',
        method: 'GET',
        json: true
      };

      function deleteServiceLocal(serviceIdentificator) {
        return removeService(serviceIdentificator)
          .then((data) => {
            resolve(data);
          })
          .catch((error) => {
            reject(error);
          });
      }

      function callback(error, response, body) {
        console.log('Kong: getRoutes: ', options);
        console.log('Kong: getRoutes: got ', error, response.statusCode, body);

        if (!error && response.statusCode === 200) {
          let promises = [];
          if (body.data.length > 0) {
            body.data.forEach((route) => {
              promises.push(removeRoute(route.id));
            });

            return Promise.all(promises)
              .then(() => {
                return deleteServiceLocal(serviceIdentificator);
              })
              .catch((error) => {
                reject(error);
              });
          }
          else {
            return deleteServiceLocal(serviceIdentificator);
          }
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });

    return promise;
  },

  //returns list of objects: {domain, upstream, route, service}
  listAPIs: () => {
    let promise = new Promise((resolve, reject) => {
      let options = {
        url: KONG_ADMIN + 'routes/',
        method: 'GET',
        json: true
      };
      let routes = [];

      function callback(error, response, body) {
        if (!error) {
          routes = body.data || [];
          //Now the services
          options = {
            url: KONG_ADMIN + 'services/',
            method: 'GET',
            json: true
          };

          function callbackService(error, response, body) {
            if (!error) {
              // go through everything and match them
              let result = [];
              routes.forEach((route) => {
                let serviceid = route.service.id;
                let service = body.data.find((d) => d.id === serviceid);

                if (service && service.name.startsWith(LetsEncryptPrefix)) {
                  let existingEntry = result.find((entry) => {
                    return entry.service.id === service.id;
                  });

                  if (!existingEntry)
                    result.push({
                      route: route,
                      service: service,
                      upstream: service.protocol + '://' + service.host + ':' + service.port + service.path,
                      domain: route.hosts[0]
                    });
                  else {
                    existingEntry.domain = existingEntry.domain || route.hosts[0];
                    if (!existingEntry.routes) {
                      existingEntry.routes = [existingEntry.route];
                    }
                    existingEntry.routes.push(route);
                  }
                }
              });
              resolve(result);
            } else {
              reject(error);
            }
          }

          request(options, callbackService);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });

    return promise;
  },

  listCertificates: () => {
    let promise = new Promise((resolve, reject) => {
      const options = {
        url: KONG_ADMIN + 'certificates/',
        method: 'GET',
        json: true
      };

      function callback(error, response, body) {
        if (!error) {
          resolve(body.data);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });
    return promise;
  },

  //returns nothing
  deleteCertificate: (id) => {
    let promise = new Promise((resolve, reject) => {
      const options = {
        url: KONG_ADMIN + 'certificates/' + id,
        method: 'DELETE'
      };

      function callback(error, response, body) {
        console.log('Kong: deleteCertificate: ', options);
        console.log('Kong: deleteCertificate: got ', error, response.statusCode, body);

        if (!error && response.statusCode === 204) {
          resolve(response);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });
    return promise;
  },

  addCertificate: (domain, path) => {
    let promise = new Promise((resolve, reject) => {
      const options = {
        url: KONG_ADMIN + 'certificates/',
        method: 'POST',
        json: true,
        body: {
          snis: domain,
          cert: fs.readFileSync(path+'/'+domain+'/fullchain.pem').toString(),
          key: fs.readFileSync(path+'/'+domain+'/privkey.pem').toString()
        }
      };

      function callback(error, response, body) {
        console.log('Kong: addCertificate: ', options);
        console.log('Kong: addCertificate: got ', error, response.statusCode, body);

        if (!error && response.statusCode === 201) {
          resolve(body);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });
    return promise;
  },

  updateService: (identifier, name, url) => {
    let promise = new Promise((resolve, reject) => {
      const options = {
        url: KONG_ADMIN + 'services/' + identifier,
        method: 'PATCH',
        json: true,
        body: {
          name: name,
          url: url
        }
      };

      function callback(error, response, body) {
        console.log('Kong: updateService: ', options);
        console.log('Kong: updateService: got ', error, response.statusCode, body);

        if (!error && response.statusCode === 200) {
          resolve(body);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });
    return promise;
  },

  removeAll: () => {
    let promise = new Promise((resolve, reject) => {
      let options = {
        url: KONG_ADMIN + 'routes/',
        method: 'GET',
        json: true
      };
      let routes = [];

      function callback(error, response, body) {
        if (!error) {
          routes = body.data || [];
          //Now the services
          options = {
            url: KONG_ADMIN + 'services/',
            method: 'GET',
            json: true
          };

          function callbackService(error, response, body) {
            if (!error) {
              // go through everything and match them
              let promises = [];
              routes.forEach((route) => {
                promises.push(removeRoute(route.id));
              });
              Promise.all(promises)
                .then(() => {
                  promises = [];
                  (body.data || []).forEach((service) => {
                    promises.push(removeService(service.id));
                  });
                  Promise.all(promises)
                    .then(() => {
                      resolve();
                    })
                    .catch((error) => reject(error));
                })
                .catch((error) => reject(error));
            } else {
              reject(error);
            }
          }

          request(options, callbackService);
        } else {
          reject(error);
        }
      }

      request(options, callback);
    });

    return promise;
  }
};

function removeRoute(routeId) {
  return new Promise((resolve, reject) => {
    let options = {
      url: KONG_ADMIN + 'routes/' + routeId,
      method: 'DELETE'
    };

    function callback(error, response, body) {
      console.log('Kong: removeRoute: ', options);
      console.log('Kong: removeRoute: got ', error, response.statusCode, body);

      if (!error && response.statusCode === 204) {
        resolve(response);
      } else {
        reject(error);
      }
    }

    request(options, callback);
  });
}

function removeService(serviceId) {
  return new Promise((resolve, reject) => {
    let options = {
      url: KONG_ADMIN + 'services/' + serviceId,
      method: 'DELETE'
    };

    function callback(error, response, body) {
      console.log('Kong: removeService: ', options);
      console.log('Kong: removeService: got ', error, response.statusCode, body);

      if (!error && response.statusCode === 204) {
        resolve(response);
      } else {
        reject(error);
      }
    }

    request(options, callback);
  });
}
