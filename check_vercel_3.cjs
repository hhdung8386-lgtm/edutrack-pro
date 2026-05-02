const https = require('https');

https.get('https://trackingplatium-2ecgdnitx-ha-huy-dungs-projects.vercel.app/', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const m = d.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (m) {
      https.get('https://trackingplatium-2ecgdnitx-ha-huy-dungs-projects.vercel.app' + m[1], (r) => {
        let j = '';
        r.on('data', c => j += c);
        r.on('end', () => {
          console.log('Contains guest:', j.includes('"guest"'));
          console.log('Contains admin:', j.includes('"admin"'));
        });
      });
    }
  });
});
