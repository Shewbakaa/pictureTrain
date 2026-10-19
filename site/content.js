// =============================================================================
//  This is the one file you edit to make the ride yours.
//
//  Everything in [square brackets] is a placeholder. Replace it, brackets and all, with
//  your own words. Take your time, and change anything whenever you like.
//
//  This is a tiny bit of code, so a few friendly rules:
//    - Keep each piece of text inside its quotes:   title: 'First coffee',
//    - Keep the comma at the end of every line.
//    - If your text has an apostrophe (it's, don't, Maya's), wrap that text in double
//      quotes instead:   caption: "Maya's laugh, all afternoon.",
//    - Keep each piece of text on one line. To start a new line inside your final message,
//      type \n where the new line should begin.
//    - Lines that start with // are notes to you. The ride ignores them.
//
//  If something looks off, open the browser console (right-click the page, choose
//  Inspect, then Console). Messages that start with "[content.js]" say what to change.
//  If the page never gets past the loading screen, a quote or a comma is probably
//  missing in this file. The console names the line where the page got confused, so look
//  at that line and the one just above it.
// =============================================================================

export default {
  // ---------------------------------------------------------------------------
  //  Names
  // ---------------------------------------------------------------------------

  // Her name. It appears in the greeting ("For ...") and in the final "Happy 1 year, ..." wish.
  herName: '[Her name]',

  // Your name. It signs off your final message.
  yourName: '[Your name]',

  // ---------------------------------------------------------------------------
  //  The first screen: what she sees before the ride starts
  // ---------------------------------------------------------------------------
  intro: {
    // The small line above the title. Leave it as '' to use "Our first year".
    eyebrow: '',

    // The big title. Leave it as '' to use "For <her name>".
    title: '',

    // A short, sweet note to her. A sentence or two is plenty: it is the first thing she reads.
    note: '[A short note to her before the ride starts]',

    // The words on the start button. Leave it as '' to use "Begin the ride".
    button: '',
  },

  // ---------------------------------------------------------------------------
  //  The last screen: after the train pulls into the evening station
  // ---------------------------------------------------------------------------
  finale: {
    // The small line above the wish. Leave it as '' to use "One year of us".
    eyebrow: '',

    // The big wish. Leave it as '' to use "Happy 1 year, <her name>".
    wish: '',

    // Your message to her. This is the heart of it, so take your time. To start a new line,
    // type \n in the text. Type \n\n to leave a blank line between two paragraphs.
    message: '[Your 1-year message to her]',

    // How you sign off. Leave it as '' to use "— <your name>", or write your own, like 'Love, Sam'.
    signoff: '',
  },

  // ---------------------------------------------------------------------------
  //  The scenery: which places the train passes through, and in what order
  //
  //    'spring'   a flowery green meadow
  //    'summer'   a sunny beach
  //    'autumn'   a forest of orange and red leaves
  //    'winter'   snowy hills
  //    'evening'  the town at dusk, where the ride ends and your message appears
  //
  //  The order of this list is the order of the ride, so you can put the first four in
  //  whatever order matches your year. Got together in autumn? Start with 'autumn'.
  //
  //  'evening' always comes last, because that is where the finale happens. If you forget,
  //  it is moved (or added) at the end for you.
  //
  //  Use each name once. You can leave a scene out if you don't want it on the ride.
  // ---------------------------------------------------------------------------
  zones: ['spring', 'summer', 'autumn', 'winter', 'evening'],

  // ---------------------------------------------------------------------------
  //  Your moments: one stop on the ride for each
  //
  //  The train slows down beside a photo sign, and a card slides up with your photo, the
  //  date, a title and your note. Ten moments is the starting plan, but you can have as many
  //  as you like. To add one, copy a whole moment (from its { to its }, including the comma
  //  after it) and paste it where you want it. To remove one, delete its block. The track
  //  gets longer or shorter to fit.
  //
  //  Every moment has the same five fields:
  //
  //    photo    The picture for this stop. Put your pictures in the photos folder
  //             (site/photos/) and write the path here, like 'photos/01.jpg'. Use JPG or PNG.
  //             iPhone photos are often HEIC, which browsers cannot show, so convert and
  //             shrink them first (the README has a one-line command for that). Leave it as
  //             '' to show a soft placeholder picture instead.
  //    date     When it happened. It is just text, so write it however you like: 'Oct 2025',
  //             '14 Feb', 'Our first date'. Short is best, because it also appears on the
  //             photo sign.
  //    title    A short title for the moment, just a few words.
  //    caption  What made this moment special, in your own words. Write as much as you like:
  //             a long note scrolls inside the card.
  //    zone     Which scene the train is in at this stop: 'spring', 'summer', 'autumn',
  //             'winter' or 'evening'. It has to be one of the names in zones above, and
  //             moments must follow the zone order (see the rule below).
  //
  //  The one rule: moments must go in the same order as the zones above. All the moments for
  //  the first zone come first, then the second zone's, and so on, ending in 'evening'.
  //  (Two per zone is the starting plan. A zone with no moments is just a short stretch of
  //  scenery.) If a moment is in an earlier zone than the moment before it, the ride puts it
  //  in the same zone as the moment before it and shows a "zone order" error in the console.
  // ---------------------------------------------------------------------------
  moments: [
    // Moment 1
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 1 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'spring',
    },

    // Moment 2
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 2 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'spring',
    },

    // Moment 3
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 3 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'summer',
    },

    // Moment 4
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 4 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'summer',
    },

    // Moment 5
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 5 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'autumn',
    },

    // Moment 6
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 6 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'autumn',
    },

    // Moment 7
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 7 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'winter',
    },

    // Moment 8
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 8 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'winter',
    },

    // Moment 9
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 9 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'evening',
    },

    // Moment 10
    {
      // Photo file in site/photos/, like 'photos/01.jpg', or '' for a soft placeholder.
      photo: '',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: '[Date]',
      // A short title, just a few words.
      title: '[Moment 10 title]',
      // What made this moment special. A long note scrolls inside the card.
      caption: '[What made this moment special]',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'evening',
    },
  ],

  // ---------------------------------------------------------------------------
  //  The little couple: the cartoon pair you will see beside some of the signs and in the finale
  //
  //  Make them look a bit like the two of you. A colour is written as a # followed by six
  //  letters or numbers, like '#e98aa6' (a soft pink). To find yours, search for "color picker"
  //  in your browser, choose a shade and copy its code. Anything that is not written like that
  //  is swapped for the starting colour, and the console tells you.
  // ---------------------------------------------------------------------------
  characters: {
    // Her.
    her: {
      // Skin tone.
      skin: '#f2c9a5',

      // Hair colour.
      hair: '#3b2416',

      // Dress colour.
      outfit: '#e98aa6',
    },

    // You.
    you: {
      // Skin tone.
      skin: '#e8b994',

      // Hair colour.
      hair: '#2a1a10',

      // Shirt colour.
      outfit: '#5b7fc4',
    },
  },

  // ---------------------------------------------------------------------------
  //  Music
  //
  //  Leave it as '' and the ride plays a soft, gentle tune it makes by itself. To use your own
  //  song instead, put an mp3 in the music folder (site/music/) and write its path here, like
  //  'music/our-song.mp3'. It starts when she taps the start button, and she can switch it
  //  off and on with the music button.
  // ---------------------------------------------------------------------------
  music: '',
};
