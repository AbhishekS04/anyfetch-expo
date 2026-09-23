#!/usr/bin/env node

/**
 * Local Release Publisher Script
 * Builds APK locally if needed and publishes/uploads it to GitHub Releases via gh CLI.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const appJsonPath = path.join(rootDir, 'app.json');

if (!fs.existsSync(appJsonPath)) {
  console.error('[Error] app.json not found in project root.');
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const version = appJson.expo?.version || '1.0.0';
const versionTag = `v${version}`;

const buildsDir = path.join(rootDir, 'builds', versionTag);
const apkPath = path.join(buildsDir, `anyfetch-${versionTag}.apk`);

console.log(`\n======================================================`);
console.log(`  ANYFETCH LOCAL RELEASE PUBLISHER — ${versionTag}`);
console.log(`======================================================\n`);

// 1. Check if APK exists; if not, build it locally
if (!fs.existsSync(apkPath)) {
  console.log(`[Info] No local APK found at builds/${versionTag}/. Building now...\n`);
  const buildResult = spawnSync('node', ['scripts/build-apk.js'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (buildResult.status !== 0) {
    console.error('\n[Error] Build failed. Aborting release.');
    process.exit(1);
  }
}

if (!fs.existsSync(apkPath)) {
  console.error(`\n[Error] APK still not found at: ${apkPath}`);
  process.exit(1);
}

// 2. Check if gh CLI is available
try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  console.error('[Error] GitHub CLI (`gh`) is not installed or not in PATH.');
  console.log('You can manually upload the APK from:', apkPath);
  process.exit(1);
}

// 3. Publish or update release on GitHub
console.log(`[Info] Publishing ${versionTag} to GitHub Releases...`);

try {
  // Check if release already exists
  const checkRelease = spawnSync('gh', ['release', 'view', versionTag], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  if (checkRelease.status === 0) {
    console.log(`[Info] Release ${versionTag} already exists on GitHub. Uploading/replacing APK asset...`);
    execSync(`gh release upload "${versionTag}" "${apkPath}" --clobber`, {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } else {
    console.log(`[Info] Creating new GitHub Release ${versionTag}...`);
    execSync(
      `gh release create "${versionTag}" "${apkPath}" --title "Anyfetch ${versionTag}" --generate-notes`,
      { cwd: rootDir, stdio: 'inherit' }
    );
  }

  console.log(`\n✓ Successfully published Anyfetch ${versionTag} to GitHub Releases!`);
  console.log(`  APK: ${apkPath}\n`);
} catch (err) {
  console.error('\n[Error] Failed to publish release via gh CLI:', err.message);
  process.exit(1);
}
