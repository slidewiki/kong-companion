'strict mode'

const kongAPI = require('./kong_api.js');

console.log('Cleaning up Kong ...');

kongAPI.removeAll()
  .then(() => {
    console.log('Success!');
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(0);
  });
