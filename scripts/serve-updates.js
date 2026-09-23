const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Port to listen on
const PORT = 4000;

// Resolve local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIp();

// Calculate base64url SHA-256 hash of a file
function getFileHash(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(buffer).digest('base64');
    return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch (err) {
    console.error(`Failed to calculate hash for ${filePath}:`, err);
    return '';
  }
}

// Map extensions to content types
function getMimeType(ext) {
  const mimeTypes = {
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'mp4': 'video/mp4',
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'woff': 'font/woff',
    'woff2': 'font/woff2'
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. Manifest Endpoint
  if (pathname === '/api/manifest') {
    const platform = req.headers['expo-platform'] || 'android';
    const runtimeVersion = req.headers['expo-runtime-version'];
    const protocolVersion = req.headers['expo-protocol-version'];

    console.log(`Manifest check request: platform=${platform}, runtimeVersion=${runtimeVersion}, protocolVersion=${protocolVersion}`);

    const metadataPath = path.join(__dirname, '../dist/metadata.json');
    if (!fs.existsSync(metadataPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No update metadata found. Run npm run export-updates first.' }));
      return;
    }

    try {
      const metadataBuffer = fs.readFileSync(metadataPath);
      const metadata = JSON.parse(metadataBuffer.toString('utf8'));
      const platformMeta = metadata.fileMetadata[platform];

      if (!platformMeta) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `No updates found for platform: ${platform}` }));
        return;
      }

      // Compute deterministic manifest ID from metadata.json hash
      const metadataHexHash = crypto.createHash('sha256').update(metadataBuffer).digest('hex');
      const manifestId = `${metadataHexHash.slice(0, 8)}-${metadataHexHash.slice(8, 12)}-${metadataHexHash.slice(12, 16)}-${metadataHexHash.slice(16, 20)}-${metadataHexHash.slice(20, 32)}`;
      
      const metadataStat = fs.statSync(metadataPath);
      const createdAt = new Date(metadataStat.mtime).toISOString();

      const clientProtocolVersion = parseInt(req.headers['expo-protocol-version'] || '0', 10);
      const currentUpdateId = req.headers['expo-current-update-id'];

      // If client is already running this update, return NoUpdateAvailable directive
      if (currentUpdateId === manifestId && clientProtocolVersion === 1) {
        console.log(`[Updates] App is already up to date (currentUpdateId: ${currentUpdateId})`);
        const boundary = '----ExpoUpdatesBoundary' + Math.random().toString(36).substring(2, 15);
        const directive = { type: 'noUpdateAvailable' };
        
        const directivePart =
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="directive"\r\n` +
          `Content-Type: application/json; charset=utf-8\r\n\r\n` +
          JSON.stringify(directive) + `\r\n`;
          
        const closingPart = `--${boundary}--\r\n`;
        
        res.writeHead(200, {
          'expo-protocol-version': '1',
          'expo-sfv-version': '0',
          'cache-control': 'private, max-age=0',
          'content-type': `multipart/mixed; boundary=${boundary}`
        });
        res.write(Buffer.concat([
          Buffer.from(directivePart, 'utf-8'),
          Buffer.from(closingPart, 'utf-8')
        ]));
        res.end();
        return;
      }

      const bundlePath = path.join(__dirname, '../dist', platformMeta.bundle);
      const bundleBuffer = fs.readFileSync(bundlePath);
      const bundleHash = getFileHash(bundlePath);
      const bundleMD5 = crypto.createHash('md5').update(bundleBuffer).digest('hex');

      // Build deterministic launchAsset
      const launchAsset = {
        hash: bundleHash,
        key: bundleMD5,
        fileExtension: '.bundle',
        contentType: 'application/javascript',
        url: `http://${LOCAL_IP}:${PORT}/${platformMeta.bundle}`
      };

      // Build deterministic assets list
      const assets = (platformMeta.assets || []).map(asset => {
        const assetFilePath = path.join(__dirname, '../dist', asset.path);
        const assetBuffer = fs.readFileSync(assetFilePath);
        const assetHash = getFileHash(assetFilePath);
        const assetMD5 = crypto.createHash('md5').update(assetBuffer).digest('hex');
        return {
          hash: assetHash,
          key: assetMD5,
          fileExtension: `.${asset.ext}`,
          contentType: getMimeType(asset.ext),
          url: `http://${LOCAL_IP}:${PORT}/${asset.path}`
        };
      });

      // Read dynamic app.json configuration for actual version and app info
      const appJsonPath = path.join(__dirname, '../app.json');
      let appConfig = { expo: {} };
      try {
        if (fs.existsSync(appJsonPath)) {
          appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        }
      } catch (e) {
        console.error('Failed to read or parse app.json:', e);
      }
      
      const appVersion = appConfig.expo?.version || '1.0.0';
      const appName = appConfig.expo?.name || 'anyfetch';
      const appSlug = appConfig.expo?.slug || 'anyfetch';

      // Construct manifest conforming to Expo Updates Protocol V1
      const manifest = {
        id: manifestId,
        createdAt,
        runtimeVersion: runtimeVersion || '1.0.0',
        launchAsset,
        assets,
        metadata: {},
        version: appVersion,
        extra: {
          expoClient: {
            name: appName,
            slug: appSlug,
            version: appVersion,
            sdkVersion: '56.0.0'
          }
        }
      };

      const boundary = '----ExpoUpdatesBoundary' + Math.random().toString(36).substring(2, 15);
      
      const manifestPart =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="manifest"\r\n` +
        `Content-Type: application/json; charset=utf-8\r\n\r\n` +
        JSON.stringify(manifest) + `\r\n`;

      const assetRequestHeaders = {};
      [...assets, launchAsset].forEach(asset => {
        assetRequestHeaders[asset.key] = {
          'test-header': 'test-header-value'
        };
      });

      const extensionsPart =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="extensions"\r\n` +
        `Content-Type: application/json; charset=utf-8\r\n\r\n` +
        JSON.stringify({ assetRequestHeaders }) + `\r\n`;

      const closingPart = `--${boundary}--\r\n`;

      res.writeHead(200, {
        'expo-protocol-version': String(clientProtocolVersion),
        'expo-sfv-version': '0',
        'cache-control': 'private, max-age=0',
        'content-type': `multipart/mixed; boundary=${boundary}`
      });
      res.write(Buffer.concat([
        Buffer.from(manifestPart, 'utf-8'),
        Buffer.from(extensionsPart, 'utf-8'),
        Buffer.from(closingPart, 'utf-8')
      ]));
      res.end();
    } catch (err) {
      console.error('Failed to construct manifest:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error while building manifest' }));
    }
    return;
  }

  // 2. Serve static files (bundles and assets) from dist
  const sanitizedPath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, '../dist', sanitizedPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).slice(1);
    res.writeHead(200, {
      'Content-Type': getMimeType(ext),
      'Cache-Control': 'public, max-age=31536000'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Expo Updates Server running locally!`);
  console.log(`👉 Update URL for app.config.js: http://${LOCAL_IP}:${PORT}/api/manifest`);
  console.log(`👉 Static files served from: ${path.join(__dirname, '../dist')}\n`);
});
