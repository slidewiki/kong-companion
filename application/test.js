require('./kong_api.js').addUpstreamHost('test.slidewiki.org', 'test.slidewiki.org', 'http://172.18.0.4').then((data) => console.log(data)).catch((e) => console.log(e));
