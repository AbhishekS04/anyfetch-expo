#!/usr/bin/env node

/**
 * Local APK Builder Script
 * Builds the release APK and organizes it in a dedicated folder per version:
 *   builds/v<version>/anyfetch-v<version>.apk
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

console.log(`\n======================================================`);
console.log(`  ANYFETCH LOCAL APK BUILDER — Version: ${versionTag}`);
console.log(`======================================================\n`);

const androidDir = path.join(rootDir, 'android');
if (!fs.existsSync(androidDir)) {
  console.log('[Notice] android/ folder not found. Running expo prebuild...');
  execSync('npx expo prebuild --platform android --no-install', {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

// Ensure gradlew is executable on unix systems
const gradlewPath = path.join(androidDir, 'gradlew');
if (process.platform !== 'win32' && fs.existsSync(gradlewPath)) {
  try {
    fs.chmodSync(gradlewPath, 0o755);
  } catch (e) {
    // ignore
  }
}

console.log('[1/3] Building Release APK with Gradle...');
const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const buildResult = spawnSync(gradlewCmd, ['assembleRelease', '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
});

if (buildResult.status !== 0) {
  console.error('\n[Error] Gradle build failed. Check the error log above.');
  process.exit(buildResult.status || 1);
}

const outputApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!fs.existsSync(outputApk)) {
  console.error(`\n[Error] Expected APK not found at: ${outputApk}`);
  process.exit(1);
}

// 2. Create version-specific folder: builds/v<version>/
console.log(`\n[2/3] Organizing build into version folder: builds/${versionTag}/`);
const buildsDir = path.join(rootDir, 'builds', versionTag);
fs.mkdirSync(buildsDir, { recursive: true });

const targetApkName = `anyfetch-${versionTag}.apk`;
const targetApkPath = path.join(buildsDir, targetApkName);

fs.copyFileSync(outputApk, targetApkPath);

// 3. Print Summary
const stats = fs.statSync(targetApkPath);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n[3/3] Build Complete!');
console.log('------------------------------------------------------');
console.log(`  Version   : ${versionTag}`);
console.log(`  File Name : ${targetApkName}`);
console.log(`  Size      : ${sizeMb} MB`);
console.log(`  Location  : ${targetApkPath}`);
console.log('------------------------------------------------------\n');
console.log(`✓ Your APK is ready in: builds/${versionTag}/${targetApkName}\n`);
