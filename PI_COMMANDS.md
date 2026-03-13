# Raspberry Pi Command Guide (Copy/Paste)

This is a practical command sheet for running and maintaining Sports Command Center on your Pi.

## 0) Edit These Variables First

Set these to match your setup before you copy/paste commands:

- `PI_USER`: your Pi username (example: `dm1752`)
- `PI_IP`: your Pi IP address (example: `100.64.10.205`)
- `APP_DIR`: project folder on Pi (example: `/home/dm1752/sports-command-center`)
- `PORT`: app port (default: `3000`)

---

## 1) SSH from Windows

### Normal (if `ssh` works)
```powershell
ssh PI_USER@PI_IP
```

### Fallback (if `ssh` is not recognized in PowerShell)
```powershell
& "$env:WINDIR\Sysnative\OpenSSH\ssh.exe" PI_USER@PI_IP
```

Replace `PI_USER` and `PI_IP`.

---

## 2) First-Time Setup on Pi

```bash
sudo apt update
sudo apt install -y git curl
cd /home/PI_USER
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
```

If your repo is private, GitHub will ask for username + personal access token.

---

## 3) Start App Manually

From your project directory:

```bash
cd APP_DIR
npm run start:proxy
```

Dashboard URLs:
- `http://localhost:3000/`
- `http://localhost:3000/settings`

---

## 4) Update App from GitHub

```bash
cd APP_DIR
git pull origin main
```

If your default branch is not `main`, replace it (for example `master`).

---

## 5) Service at Startup (systemd)

### Create service file
```bash
sudo nano /etc/systemd/system/sports-command-center.service
```

Paste:
```ini
[Unit]
Description=Sports Command Center Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=PI_USER
WorkingDirectory=APP_DIR
ExecStart=/usr/bin/npm run start:proxy
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Enable + start
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sports-command-center.service
sudo systemctl status sports-command-center.service
```

### Common service commands
```bash
sudo systemctl restart sports-command-center.service
sudo systemctl stop sports-command-center.service
sudo systemctl start sports-command-center.service
sudo journalctl -u sports-command-center.service -n 100 --no-pager
```

---

## 6) Auto-Open Dashboard in Chromium Kiosk

### Ensure desktop autologin is enabled
```bash
sudo raspi-config
```
Path: `System Options` -> `Boot / Auto Login` -> `Desktop Autologin`

### Create autostart entry
```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/command-center.desktop
```

Paste:
```ini
[Desktop Entry]
Type=Application
Name=Sports Command Center
Exec=sh -c "unclutter -idle 0.5 -root & /usr/bin/chromium --kiosk --incognito --noerrdialogs --disable-session-crashed-bubble --disable-infobars http://localhost:3000/"
X-GNOME-Autostart-enabled=true
```

Reboot:
```bash
sudo reboot
```

---

## 7) Refresh / Control Chromium from SSH

Install helper once:
```bash
sudo apt install -y xdotool
```

Refresh current page:
```bash
DISPLAY=:0 XAUTHORITY=/home/PI_USER/.Xauthority xdotool key F5
```

Close current tab:
```bash
DISPLAY=:0 XAUTHORITY=/home/PI_USER/.Xauthority xdotool key ctrl+w
```

Hard reset browser (close + reopen kiosk):
```bash
pkill -f chromium
DISPLAY=:0 XAUTHORITY=/home/PI_USER/.Xauthority /usr/bin/chromium --kiosk --incognito --noerrdialogs --disable-session-crashed-bubble --disable-infobars http://localhost:3000/ >/dev/null 2>&1 &
```

---

## 8) Hide Mouse Cursor on TV

Install:
```bash
sudo apt install -y unclutter
```

Test now:
```bash
DISPLAY=:0 XAUTHORITY=/home/PI_USER/.Xauthority unclutter -idle 0.5 -root &
```

Auto-hide at startup:
```bash
mkdir -p ~/.config/lxsession/LXDE-pi
nano ~/.config/lxsession/LXDE-pi/autostart
```

Add:
```text
@unclutter -idle 0.5 -root
```

---

## 9) Wi-Fi MAC Address (for apartment network registration)

```bash
cat /sys/class/net/wlan0/address
```

If `wlan0` does not exist:
```bash
ls /sys/class/net
```
Then use the correct Wi-Fi interface name.

---

## 10) Useful Health Checks

```bash
curl http://localhost:3000/health
curl http://localhost:3000/settings/config
```

Check open port:
```bash
ss -lntp | grep 3000
```

---

## 11) How to Edit for Different Needs

### Change app port
If you want a different port, set environment variable in service:
```ini
Environment=PORT=4000
```
Then update all URLs from `3000` to `4000`, reload and restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart sports-command-center.service
```

### Change kiosk URL (for example settings page)
Edit:
```bash
nano ~/.config/autostart/command-center.desktop
```
Change `Exec=... http://localhost:3000/` to your target URL.

### Change scoring/layout behavior
Edit these files in repo:
- `src/js/config.js` (main tuning file)
- `server/settings.overrides.json` (saved settings from phone UI)

### Apply config changes after editing files
```bash
cd APP_DIR
git pull origin main
sudo systemctl restart sports-command-center.service
DISPLAY=:0 XAUTHORITY=/home/PI_USER/.Xauthority xdotool key F5
```

---

## 12) Quick Exit / Reboot

Exit SSH:
```bash
exit
```

Reboot Pi:
```bash
sudo reboot
```
