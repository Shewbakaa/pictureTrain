# A ride through our first year

## 1. What this is

A little website you send as a link. She taps "Begin the ride" and a cosy cartoon train takes her through
five scenes (spring, summer, autumn, winter and an evening town). It slows down beside a photo sign for each
moment you chose (ten to start with), and a card slides up with the photo, the date and your words. The
last stop is the Day 365 station, where your message to her appears. It is built for phones held upright,
plays gentle piano music by Chopin in each scene (or your own song) with the little train's own sounds and
the sounds of each scene, and works on a computer too.

It is a plain folder of files: no accounts, no server and no tracking. Nothing is fetched from anywhere
else when she opens it.

**The short version:**

1. Fill in `site/content.js` and the title in `site/index.html` (section 2).
2. Add your photos to `site/photos/` (section 3), and optionally a song (section 4).
3. Look at it on your computer (section 5) and then on a real phone (section 6).
4. Put it online (section 7), set up the link preview (section 8), and send her the link.

Nothing is sent or published by anything in this folder until you do it yourself.

**What is in the folder:**

- `site/` is the website. This is the only folder that gets published.
- `site/content.js` is the one file you edit to make it yours.
- `site/photos/` and `site/music/` are where your photos and song go. Each scene's own music is in
  `site/music/zones/`.
- `scripts/`, `tests/` and `package.json` are tools for checking the site and making the link-preview
  picture. She never sees them.

## 2. Make it yours

Open `site/content.js` in any text editor. Every field is explained in the notes inside the file. Replace
everything that is in `[square brackets]`, brackets included: her name, your name, the note on the first
screen, your message at the end, and the date, title and caption of each of the ten moments. You can add
moments, remove moments or reorder the seasons. The notes in the file say how.

Two things to know about that file:

- Keep every piece of text inside its quotes and keep the comma at the end of the line. If your text has an
  apostrophe (it's, Maya's), put the text in double quotes instead: `"Maya's laugh, all afternoon."`
- If something is wrong, open the browser console (right-click the page, Inspect, Console). Messages that
  start with `[content.js]` say what to fix. If the page never gets past the loading screen, a quote or a
  comma is probably missing; the console names the word (and, in Safari, the line) where it got confused,
  so look just before it.

Then open `site/index.html` and change two things near the top:

- `<title>For you</title>`: for example `<title>For Maya</title>`.
- `<meta property="og:title" content="For [Her name]">`: for example `content="For Maya"`.

The ride sets its own page title from `content.js`, but chat apps read the link preview from `index.html`
itself, so this is the place that decides what the link says when you send it (section 8). While you are
there you can also reword the description line (`A little ride through our first year`) in both places it
appears.

### The sound hint

Under the "Begin the ride" button the first screen shows a small line with a pair of headphones:
*Best with sound on and headphones in.* The ride is much nicer with sound, so it is there to remind her. To
say something of your own, add a `hint` line to the `intro` block in `content.js`:

```js
hint: 'Headphones on, please.',
```

To hide the line altogether, write `hint: 'none'`. Leave `hint` out, or as `''`, to keep the default.

### Poses and pets

The little couple stand beside the photo sign at every stop. By default they hold hands, but each moment can
give them its own pose. Add a `pose` line to that moment's block in `content.js`:

```js
pose: 'hug',
```

The poses are `'holding-hands'` (the one you get if you leave `pose` out), `'waving'`, `'hug'`, `'sitting'`,
`'dancing'`, `'pointing'` (she points at the photo) and `'none'` (no couple at that stop). A pose the ride
does not know is swapped for `'holding-hands'`, and the console says so.

A little dog or cat sits at their feet at each stop. Leave it to chance (`'random'`, which is what you get if
you write nothing), or add a `pets` line to the main block of `content.js` (the one that holds `herName`):

```js
pets: 'cat',
```

Use `'dog'` or `'cat'` to always have that one, or `'none'` for no pets.

## 3. Add photos

Put your pictures in `site/photos/` and point each moment at its file in `content.js`:

```js
photo: 'photos/01.jpg',
```

Phone photos are big (12 megapixels) and iPhone photos are often HEIC, a format browsers cannot show. This
Mac command shrinks them and turns them into JPEGs in one go. Change `~/Desktop/our-photos/` to the folder
you keep your chosen pictures in:

```sh
mkdir -p site/photos && sips -s format jpeg -s formatOptions 82 -Z 1600 ~/Desktop/our-photos/* --out site/photos/
```

Then check what came out with `ls site/photos`. Three things to watch for:

- **The file names are copied from the originals.** `IMG_4021.HEIC` becomes `IMG_4021.jpg`, but a file
  that was already `IMG_4022.JPG` stays `.JPG` with capital letters. Your Mac does not care about capitals,
  but once the site is online `photos/IMG_4022.jpg` is not the same file as `photos/IMG_4022.JPG`. Write
  the names in `content.js` exactly as `ls` shows them. Renaming them to `01.jpg`, `02.jpg`, ... keeps it
  simple.
- **Size matters.** The ride loads up to three photos at a time. Each one has 15 seconds, and the whole set
  has 45 seconds, before the loading screen gives up on stragglers and shows a placeholder instead. After
  the command above each photo should be a few hundred KB, which is plenty.
- **Any shape works.** A wide panorama or a tall screenshot shows whole, without stretching, on the card,
  and the sign beside the track crops it to fit.

If a moment has no photo (`photo: ''`), or a photo cannot be shown (a misspelt name, or a HEIC file that was
not converted), the ride shows a soft pastel placeholder reading "Photo 3" and so on, and the browser
console warns with the name of the file. So if you see a placeholder you did not expect, open the console
and the message tells you which file to fix.

### Videos

A moment can be a short video instead of a photo. Put it in `site/photos/` and point the moment at it the
same way; the ride knows it is a video from its ending (`.mp4`, `.m4v`, `.webm` or `.mov`):

```js
photo: 'photos/03.mp4',
```

The clip plays on the moment's sign as the train comes in, and again from the start in the card when the
train stops. It plays silently and loops; she taps the round speaker on the card to hear it, and the music,
the train's sounds and the scenery's sounds fade out while it plays and come back when she taps Continue. Only
one clip plays at a time.

iPhone videos are large, and Android phones cannot play every iPhone video, so convert each clip before you
add it. This command comes with every Mac. It makes a phone-sized MP4 that plays everywhere, and
`--duration 15` keeps the first 15 seconds (use `--start 4` as well to start 4 seconds in):

```sh
avconvert --source ~/Desktop/our-videos/IMG_4100.MOV --preset Preset960x540 --output site/photos/03.mp4 --duration 15
```

Keep clips short (5 to 15 seconds is lovely) so they start quickly on her phone. A clip that cannot be played
shows a "Video 3" placeholder on its sign and a photo-style placeholder in the card, and the console names the
file, as for photos.

### Live Photos

A Live Photo is a still picture plus about three seconds of motion, and the ride can show it the way her
iPhone does. The card shows the still with a small LIVE badge; the motion plays once, silently, as the card
comes up and then settles back to the still; and when she taps the picture it plays again with its sound (all
the ride's other sounds fade out for it). The sign beside the track shows the still.

Browsers cannot open a Live Photo directly, so export its two halves and convert them:

1. In Photos on your Mac, select the Live Photo and choose **File → Export → Export Unmodified Original**.
   You get two files with the same name: `IMG_4100.HEIC` (the still) and `IMG_4100.MOV` (the motion).
2. Convert the still with the `sips` command above, and the motion with `avconvert`:

   ```sh
   avconvert --source ~/Desktop/IMG_4100.MOV --preset Preset960x540 --output site/photos/04.mp4
   ```

3. Give the moment both, the still as `photo` and the motion as `live`:

   ```js
   photo: 'photos/04.jpg',
   live: 'photos/04.mp4',
   ```

If the motion cannot be played, the moment simply shows its still, and the console names the file.

## 4. Add your song

Each scene has its own music, so you do not need to do anything. The spring meadow, the summer beach, the
autumn forest and the evening town each play a piano piece by Chopin: *Wiosna* ("Spring"), the Nocturne in
E-flat (Op. 9 No. 2), the "Raindrop" Prelude (Op. 28 No. 15) and the Nocturne in D-flat (Op. 27 No. 2), which
plays on through the finale. In the winter hills *Silent Night* plays faintly on a little music box. As the
train passes from one scene into the next, one piece fades away and the next begins from its start, and a
scene that lasts longer than its piece hears it again from the top.

To use your own song instead, put an mp3 at `site/music/our-song.mp3` and set this in `content.js`:

```js
music: 'music/our-song.mp3',
```

Your song then replaces them all: it plays throughout, through every scene and the finale, with no scene's
piece and no carol (and their files are never downloaded). It starts when she taps "Begin the ride", loops,
and she can switch it off and on with the Sound button at the top, which also switches the ride's other
sounds: the train's (its whistle, steam, chugs and the clickety-clack of the rails), each scene's (birds and a
breeze in the meadow, waves at the beach, rustling leaves, a soft wind over the snow, crickets and a clock
tower in the evening town), a rustle as each card comes up, and the finale's sparkle and fireworks. If the
file is missing or will not play, each scene's own music plays instead and the console says why.
Keep the file to a few MB (a 128 kbps mp3 is about 1 MB per minute).

Her song is played at a little over a third of full volume on Android and computers, so the train's sounds can
be heard under it, but iPhones ignore the page's volume setting, so on an iPhone it plays at whatever the
phone's volume is. Check how loud it is on a real phone (section 6).

To change one scene's piece, replace the file of the same name in `site/music/zones/` (`spring.mp3`,
`summer.mp3`, `autumn.mp3` or `evening.mp3`) with another mp3. Each file is turned up by a set amount so the
four sit at the same loudness, worked out for the file that is there now (`PIECES` in
`site/src/audio/zoneMusic.js`). If yours sounds much louder or quieter than the others, measure it (for
example `ffmpeg -i yours.mp3 -af ebur128 -f null -` prints its loudness on the `I:` line, in LUFS) and put that
number in as its `lufs`. If a scene's file is missing or will not play, that scene plays a soft music-box tune
made by the ride itself instead, and the console names the file.

To hear the music without a phone, open the site on your computer (section 5) and tap Begin.

### Voice note

You can leave her a short voice note that plays at the end, after your message appears. Record it on your
iPhone with the Voice Memos app, then open the recording, tap the **...** button, choose **Share**, and
**Save to Files** to get an `.m4a` file. Make a `voice` folder inside `site/` (so `site/voice/`), put the file
in it, and point `content.js` at it from the `finale` block:

```js
voice: 'voice/message.m4a',
```

`.m4a`, `.mp3`, `.aac` and `.wav` files all work. Keep it short, a minute or less. Leave `voice` out, or as
`''`, and the ride has no voice note. A file with any other ending is ignored, and the console says so.

## 5. Preview it on your computer

```sh
npm run serve
```

Then open `http://localhost:8080` in your browser. (This only needs Python 3, which comes with macOS. You
do not need to run `npm install` for it.) Leave the terminal window open while you look; press Ctrl-C to
stop.

Do not double-click `index.html` to open it. Browsers refuse to load photos into the 3D scene from a file
opened that way, so the ride would show placeholders or not start.

## 6. Try it on a phone first

It was made for phones, and a real phone is the only way to know how it feels. With the phone on the same
Wi-Fi as your Mac:

```sh
python3 scripts/serve.py 8080 --directory site --bind 0.0.0.0
ipconfig getifaddr en0
```

The first command serves the site to your network (stop it with Ctrl-C when you are done; run it in one
terminal window and the second command in another). The second prints your Mac's address, something like
`192.168.1.23`. If it prints nothing, find the address under System Settings, Wi-Fi, Details. On the phone,
open `http://192.168.1.23:8080` in the browser.

Add `?stats=1` to the end of the address (`http://192.168.1.23:8080/?stats=1`) and a small line shows the
frame rate, how much is being drawn, and the quality level the ride has chosen (`low`, `medium` or `high`).
The ride starts at a balanced setting, `medium`, and steps down by itself if the phone struggles to keep the
motion smooth. (It can only step up to `high` on a screen that refreshes faster than the usual 60 times a
second.)

**A checklist for the real phone:**

- The ride is smooth. Watch the `?stats=1` line: a steady 30 or more frames per second is good, and it is
  fine if the quality level steps down once or twice at the start.
- Try it once in Low Power Mode (on an iPhone: Settings, Battery). The phone then draws at most 30 frames a
  second, so the `?stats=1` line shows about 30, and the ride should still feel smooth.
- The cards are readable and the Continue button is easy to reach with a thumb, including with your longest
  caption.
- Music starts after you tap Begin, and the train whistles as it sets off. Listen once with the phone's
  speaker: the train's and the scenery's sounds should sit softly under the music, the birds and crickets
  included, and the carol in the winter hills should be faint.
- Ride on past the first scene: the meadow's piece should fade away and the beach's begin. On an iPhone this is
  the thing to check, since iPhones only let each piece play because of her tap on Begin. If a scene plays the
  little music-box tune instead of its piano piece, the browser held that scene's file back: tap the Sound
  button off and on again, which should bring the piano back.
- Test with the iPhone's silent switch on and off. Whether the switch silences the music and the ride's other
  sounds depends on the iPhone and its iOS version (older ones are the likelier to go quiet), so check what you
  hear rather than assume. If it does go quiet and she keeps her switch on, tell her to flip it off. The same
  goes for your own song, if you use one: check whether the ride's other sounds are heard beside it.
- Her own song plays at the phone's volume on iPhones (see section 4).
- After the phone is locked and unlocked again, the sound may need one tap on the Sound button to come back.
- A phone call or a Siri interruption can leave the Sound button showing the wrong state until you tap it.
- The finale plays: the train pulls into the Day 365 station, fireworks go off, and your message appears.
- Try it inside the app you will send the link with. Instagram and WhatsApp open links in their own small
  browser, which can behave a little differently. iMessage opens Safari, so that one is the same as above.

**Do your testing in a private window, or clear the site's data afterwards.** The ride remembers which
moments you have reached (in the browser's local storage, under the name `pictureTrain.progress.v1`), so on
a later visit the timeline along the bottom already has those moments unlocked. That is a nice touch when
she comes back to it, but it would spoil the surprise on her phone if you had tested there. So:

- Test in a private (incognito) tab where you can, or
- If you test on her phone, or on a browser she will use, clear the data afterwards. On an iPhone, go to
  Settings, Safari (under Apps on newer iOS), Advanced, Website Data, find the address and delete it (or
  choose "Clear History and Website Data"). On Android Chrome, tap the icon next to the address, open the
  site's settings and choose Clear data. On a computer, open the console and run
  `localStorage.removeItem('pictureTrain.progress.v1')`, then reload.

Local storage belongs to one address on one browser, so testing on your own phone at `192.168.1.23` does
not leave anything behind at the final address.

## 7. Share it

Anyone with the link can open it. There is no password. Search engines are asked not to list it
(`noindex`), but treat the link as the secret: only send it to her.

**Option A: Netlify Drop** (the easiest, and it keeps the rest of the project private). Go to
[app.netlify.com/drop](https://app.netlify.com/drop) and drag the `site` folder onto the page. You get an
address straight away. Only the `site` folder is uploaded, so the rest of the project (the tests, scripts
and your git history) stays on your computer. Everything inside `site/`, your photos and `content.js`
included, can be opened by anyone who has the link.

A site dropped without an account may be taken down after a while, so sign up for Netlify (or log in) right
away and make sure the site belongs to your account. Then open the address again the next day, to check that
it still works, before you send it. You can also rename the address in the site's settings to something
nicer.

**Option B: GitHub Pages**, using the workflow already in this folder (`.github/workflows/pages.yml`).

1. Create a repository on GitHub and push this project to it.
2. In the repository, open Settings, Pages, and set Source to **GitHub Actions**.
3. Once it is personalised (your `content.js`, photos and title) and pushed to the `main` branch, publish
   it by hand: open the Actions tab, choose Deploy to GitHub Pages, and press Run workflow. The first run
   takes a minute or two. Nothing is published until you do this, and you run it again after each change.
4. Your address is `https://<your-username>.github.io/<repository-name>/`.

If you would rather have every push to `main` publish by itself, open `.github/workflows/pages.yml` and
change

```yaml
on:
  workflow_dispatch:
```

to

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

On a free GitHub plan, Pages only works for public repositories. That means the whole repository is public,
and so are your photos and your message in `site/`, for anyone who goes looking. If that is not what you
want, use Option A.

Whichever you pick, open the final address on a phone and ride all the way to the end once before you
send it. Then clear that browser's site data (section 6) so her first ride is a surprise.

## 8. The link preview

When you paste the link into WhatsApp, iMessage or Instagram, the app shows a small card with a picture, a
title and a line of text. Those come from the top of `site/index.html` (the title, `og:title`,
`description`) and from `site/og-image.jpg`.

1. After you have filled in `content.js`, run this to take a fresh picture of the first screen, with her
   name and your note on it:

   ```sh
   npm run og-image
   ```

   It writes `site/og-image.jpg` (1200 by 630). The first time on a new computer, run `npm install` and
   `npx playwright install chromium` first. Open the picture and have a look. Anyone who sees the link
   preview sees this picture, her name and your note included, so look at it before you send the link.
2. After you have deployed, open `site/index.html` and change the image line to the full address, for
   example:

   ```html
   <meta property="og:image" content="https://you.github.io/repo/og-image.jpg">
   ```

   Chat apps need the whole address, which is why it is not filled in yet. Deploy again afterwards (drop
   the `site` folder on Netlify again, or push and run the Pages workflow again).
3. Send the link to yourself first. Chat apps remember a preview once they have made it, so if you change
   the picture or title after sending, the old one may stick. Adding something to the end of the link,
   like `?v=2`, makes the app look again.

## 9. For tinkering

**Debug options.** Add these to the end of the address (`?speed=4&at=120`). They are harmless if left in.

| Option | What it does |
| --- | --- |
| `speed=N` | Ride speed multiplier, from 1 to 50. |
| `at=M` | Start M metres along the track (frozen there). |
| `look=DEG` | Initial look direction in degrees (positive is left). |
| `quality=low` | Force a quality level: `low`, `medium` or `high`. |
| `fallback=1` | Show the plain 2D version of the story. |
| `finale=1` | Jump straight to the finale. |
| `ft=S` | Freeze the finale at S seconds. |
| `stats=1` | Show the frame rate, draw calls, triangles and quality level. |
| `ui=0` | Hide the buttons and cards. |

**Ride pace.** The train cruises at 6.5 metres per second, which is about 17 seconds between stops and a
bit over three and a half minutes for the whole ride. If you want it faster or slower, change `RIDE.CRUISE`
in `site/src/ride/rideController.js`.

**Tests.** Setup once: `npm install`, then `npx playwright install` (it downloads the browsers the tests
use). Use a recent Node (22 or newer).

```sh
npm test            # unit tests, a few seconds
npm run test:e2e    # in-browser tests on an iPhone-sized WebKit and a Pixel-sized Chromium
npm run shot -- name "?at=120"    # screenshot into artifacts/shots/name.png
```

The in-browser tests ride the whole way through the ride once, on Chromium only. On WebKit that one test is
skipped on purpose (one full ride is enough); everything else runs on both.

`npm run vendor` re-copies Three.js and the fonts from `node_modules` into `site/`, if you ever need it.

## Credits

Made with:

- [Three.js](https://threejs.org), the 3D engine, copy in `site/vendor/`. MIT licence, in
  `site/vendor/THREE_LICENSE.txt`.
- [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) for the display text. SIL Open Font
  Licence 1.1, in `site/fonts/LICENSE-cormorant-garamond.txt`.
- [Nunito](https://github.com/googlefonts/nunito) for the body text and numbers. SIL Open Font Licence 1.1,
  in `site/fonts/LICENSE-nunito.txt`.
- Music: Frédéric Chopin — recordings from Musopen's Complete Chopin Collection (CC0 1.0),
  https://archive.org/details/musopen-chopin

The world, the train and the figures are all drawn in code, and the winter carol, the music-box tune and every
sound but the four Chopin recordings in `site/music/zones/` are made in code too. There are no model files.
