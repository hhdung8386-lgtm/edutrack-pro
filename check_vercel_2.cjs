const https = require('https');

https.get('https://trackingplatium.vercel.app/', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const m = d.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (m) {
      https.get('https://trackingplatium.vercel.app' + m[1], (r) => {
        let j = '';
        r.on('data', c => j += c);
        r.on('end', () => {
          const regex = /role:"[^"]+"/g;
          const matches = j.match(regex);
          console.log('Roles found:', matches);
        });
      });
    } else {
      console.log('No match found');
    }
  });
});
