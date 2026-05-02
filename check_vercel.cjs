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
          console.log('Contains guest:', j.includes('"guest"'));
          console.log('Contains role:"guest":', j.includes('role:"guest"'));
        });
      });
    } else {
      console.log('No match found');
    }
  });
});
