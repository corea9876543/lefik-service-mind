// 정적 파일 서버 (Vercel/로컬 공용). publish-to-vercel 스킬 규격.
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = process.env.PORT || 3000;
var mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

var server = http.createServer(function (req, res) {
  var filePath = '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  var ext = path.extname(filePath);
  var contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, function (err, content) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>404 Not Found</h1>'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});
server.listen(PORT, function () { console.log('Server running at http://localhost:' + PORT); });
