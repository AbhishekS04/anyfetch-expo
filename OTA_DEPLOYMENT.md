# OTA Deployment & Native Build Guide

This guide explains how to compile the native Android APK and deploy Over-the-Air (OTA) updates to devices locally and globally.

---

## 1. Local Network Deployment (Testing)

Use this setup to test OTA updates on devices connected to the same Wi-Fi network as your development machine.

### Step 1: Find your Local IP Address
Find your computer's local IP address (e.g., `192.168.29.129`).
* **Linux/macOS**: Run `ip address show` or `ifconfig`.
* **Windows**: Run `ipconfig` in CMD.

### Step 2: Build the APK
Compile the release APK with your local updates server URL. Run this from the project root:

```bash
cd android
UPDATES_URL=http://192.168.29.129:4000/api/manifest ./gradlew clean assembleRelease
```
*The compiled APK will be located at:*  
`android/app/build/outputs/apk/release/app-release.apk`

### Step 3: Run the Local Updates Server
Start the server on your computer:
```bash
npm run serve-updates
```
Keep this terminal window running.

### Step 4: Export and Push updates
Whenever you make changes to your JavaScript or asset files (e.g., in `src/`):
1. **Export the assets**:
   ```bash
   npm run export-updates
   ```
2. **Apply OTA Update**: In the app, navigate to **Settings** and tap the **Check for Updates** button. The app will fetch the update from your local server, install it, and reload.

---

## 2. Global Deployment (To Anyone's Phone Anywhere)

To push updates to users globally, the update server must be hosted on a public internet address.

### Step A: Public Hosting Options

#### Option 1: VPS / Cloud Hosting (Recommended for Production)
1. Deploy the updates server (`scripts/serve-updates.js`) to a cloud provider (e.g., Render, Railway, Heroku, or a VPS like DigitalOcean/AWS).
2. Configure your hosting environment so the server runs on port `80` (or `443` for HTTPS).
3. Set the `HOSTNAME` environment variable to your public domain (e.g., `https://updates.anyfetch.com`).
4. Upload your generated `dist/` directory to the server whenever you run `npm run export-updates`.

#### Option 2: Secure Tunnel (Recommended for Sharing/Quick Testing)
Expose your local machine's update server using a tunneling service like **ngrok** or **Cloudflare Tunnels**:
```bash
# Expose port 4000 to the public internet
ngrok http 4000
```
Copy the generated forwarding URL (e.g., `https://xxxx.ngrok-free.app`).

---

### Step B: Build the Native APK with Public URL
Compile the release APK with the public URL from Step A. Run this from the project root:

```bash
cd android
UPDATES_URL=https://updates.anyfetch.com/api/manifest ./gradlew clean assembleRelease
```
*(Replace `https://updates.anyfetch.com` with your Vercel/Render hosting URL or ngrok address).*

Install this APK on anyone's phone. Because the public URL is compiled into the app, it can receive updates anywhere in the world.

---

### Step C: Pushing Updates Globally
1. **Make your changes** in the codebase.
2. **Export the bundle**:
   ```bash
   npm run export-updates
   ```
3. **Upload the `dist/` folder** to your hosting provider (or keep ngrok active if serving locally).
4. Users anywhere in the world will receive the update automatically or when they tap **Check for Updates** in Settings!
