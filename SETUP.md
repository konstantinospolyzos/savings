# Savings Tracker for your phone: setup (about 20 minutes, once)

You'll do three things:

1. Put the app online for free with **GitHub Pages**, so it gets an address like `https://yourname.github.io/savings/`.
2. Let that address use **Google Drive**, so your data is saved as a file in your own Drive.
3. Open it on your phone and **Add to Home Screen**.

Nothing costs money, and no server holds your numbers: the website is just these files, and your data
goes from your phone straight to your own Google Drive.

---

## 1. Put the app online (GitHub Pages)

1. Sign in at <https://github.com> (or make a free account).
2. Go to <https://github.com/new>.
   - Repository name: `savings` (any name works; it becomes part of the address)
   - Choose **Public**. Only the app's code is public. Your data never goes to GitHub.
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
   Drag **everything inside** the unzipped `savings-web` folder (the `index.html` file plus the `css`, `js`,
   `icons` and `vendor` folders) into the page, then click **Commit changes**.
4. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**,
   branch **main**, folder **/ (root)**, and click **Save**.
5. After a minute the page shows *Your site is live at* `https://YOURNAME.github.io/savings/`.
   Open it: you should see the welcome screen. "Only on this device" already works.

## 2. Allow Google Drive

You create a "sign-in client" in Google Cloud. It tells Google that your website may ask for permission
to save files in Drive.

1. Go to <https://console.cloud.google.com/projectcreate>, name the project `Savings Tracker`,
   click **Create**, and make sure it's selected at the top of the page.
2. Turn on the Drive API: open <https://console.cloud.google.com/apis/library/drive.googleapis.com>
   and click **Enable**.
3. Open **Google Auth Platform** (<https://console.cloud.google.com/auth/overview>) and click **Get started**:
   - App name: `Savings Tracker`, and your email as the support email
   - Audience: **External**
   - Contact information: your email
   - Accept the policy and click **Create**.
4. **Audience** tab → under *Test users* click **Add users** and add your Gmail address
   (and your brother's, if he'll use it too). Leave the app in **Testing**. That's fine for personal use.
5. **Clients** tab → **Create client**:
   - Application type: **Web application**
   - Name: `Savings Tracker web`
   - **Authorized JavaScript origins** → **Add URI** → `https://YOURNAME.github.io`
     (just this part: no `/savings/` and no slash at the end)
   - Leave *Authorized redirect URIs* empty and click **Create**.
6. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). You don't need the client secret.
7. Back on GitHub, open `js/config.js` in your repository, click the pencil (Edit), paste the ID
   between the quotes, and click **Commit changes**:

   ```js
   googleClientId: "1234567890-abc123.apps.googleusercontent.com",
   ```

## 3. Start using it

The easiest way to bring your existing data:

1. On your **computer**, open `https://YOURNAME.github.io/savings/` and tap **Continue with Google**.
   Google shows *"Google hasn't verified this app"* because it's your own personal app in Testing mode:
   click **Continue**, and allow access to the files this app creates.
2. On the Overview page click **Import from the desktop app** and pick your `savings.db`.
   (The desktop app shows where it is: sidebar → **Data file**.) Your months, fixed costs, goals and
   settings now live in Google Drive in `My Drive › Savings Tracker › savings-tracker.json`.
3. On your **iPhone**, open the same address in **Safari**, tap **Share → Add to Home Screen**, open the new
   icon, and tap **Continue with Google**. Your data appears.
   On **Android**: open it in **Chrome**, tap **⋮ → Add to Home screen** (or *Install app*).

### Good to know

- **Signing in again:** Google's permission lasts about an hour. When you open the app later, it shows
  your data at once (it keeps a copy on the phone), and the cloud icon turns orange: tap it, or just save
  a month, and it syncs again (a Google window may flash for a second).
- **Phone and computer at the same time:** changes are merged month by month, so adding a month on one
  device and editing a note on the other doesn't lose either change.
- **Offline:** you can log a month without a connection. It's saved on the phone and goes to Drive when
  you're back online.
- **Backups:** Settings → *Save a backup* gives you one file with everything. Google Drive also keeps
  older versions of the file (in Drive: right-click the file → *Manage versions*).
- **Your brother:** send him the address. He signs in with his own Google account (add him as a test user,
  step 2.4) and gets his own file in his own Drive. He never sees your data.
- **Updating the app later:** upload the new files to the same GitHub repository (they replace the old
  ones). Phones pick up the new version the next time the app is opened.
