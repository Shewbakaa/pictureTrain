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
//  missing in this file. The console names the word (and, in Safari, the line) where the
//  page got confused, so look just before it, on that line or the one above.
// =============================================================================

export default {
  // ---------------------------------------------------------------------------
  //  Names
  // ---------------------------------------------------------------------------

  // Her name. It appears in the greeting ("For ...") and in the final "Happy 1 year, ..." wish.
  herName: 'Brianna',

  // Your name. It signs off your final message.
  yourName: 'Shivba',

  // ---------------------------------------------------------------------------
  //  The first screen: what she sees before the ride starts
  // ---------------------------------------------------------------------------
  intro: {
    // The small line above the title. Leave it as '' to use "Our first year".
    eyebrow: '',

    // The big title. Leave it as '' to use "For <her name>".
    title: '',

    // A short, sweet note to her. A sentence or two is plenty: it is the first thing she reads.
    note: "Grab a seat next to me. This little train rides through our first year together, one memory at a time, and I'd take every stop again with you.",

    // The words on the start button. Leave it as '' to use "Begin the ride".
    button: '',

    // Optional, and not written here: the small line under the start button. Leave it out to
    // show "Best with sound on and headphones in." To say something else, add a line like
    //   hint: 'Headphones on, please.',
    // and to hide it, add   hint: 'none',   (README, "The sound hint").
  },

  // ---------------------------------------------------------------------------
  //  The last screen: after the train pulls into the evening station
  // ---------------------------------------------------------------------------
  finale: {
    // The small line above the wish. Leave it as '' to use "One year of us", or write 'none'
    // to hide it.
    eyebrow: 'none',

    // The big wish. Leave it as '' to use "Happy 1 year, <her name>".
    wish: 'Happy 1 year of us in a relationship!',

    // Your message to her. This is the heart of it, so take your time. To start a new line,
    // type \n in the text. Type \n\n to leave a blank line between two paragraphs.
    message: 'Thank you for being my partner and being an awesome person. You have such an amazing aura and the way you do things is fascinating and I am happy to do it with you!',

    // How you sign off. Leave it as '' to use your name, or write your own, like 'Love, Sam'.
    signoff: '',

    // A voice note from you, played at the end after your message appears. To record one, make
    // a Voice Memo on your iPhone, then choose Share → Save to Files to export it as a .m4a
    // file. Name it message.m4a and put it in site/voice/, or change the name below to match
    // yours. It can be .m4a, .mp3, .aac or .wav. Until the file is there, the ride has no voice
    // note and the console says so. Delete this line for no voice note (README, "Voice note").
    voice: 'voice/message.m4a',
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
  zones: ['autumn', 'winter', 'spring', 'summer', 'evening'],

  // ---------------------------------------------------------------------------
  //  Your moments: one stop on the ride for each
  //
  //  The train slows down beside a photo sign, and a card slides up with your photo, the
  //  date, a title and your note. Fifteen moments is the starting plan, but you can have as many
  //  as you like. To add one, copy a whole moment (from its { to its }, including the comma
  //  after it) and paste it where you want it. To remove one, delete its block. The track
  //  gets longer or shorter to fit.
  //
  //  Every moment has the same five fields (and two optional ones, live and pose):
  //
  //    photo    The picture for this stop. Put your pictures in the photos folder
  //             (site/photos/) and write the path here, like 'photos/01.jpg'. Use JPG or PNG.
  //             iPhone photos are often HEIC, which browsers cannot show, so convert and
  //             shrink them first (the README has a one-line command for that). Leave it as
  //             '' to show a soft placeholder picture instead. It can also be a short video,
  //             like 'photos/03.mp4' (README, "Videos"): it plays on the sign and in the card.
  //    live     Optional, and not in the blocks below: add it to a moment to make its photo a
  //             Live Photo. The photo is the still and this is its motion, like
  //             live: 'photos/04.mp4' (README, "Live Photos"). It plays once when the train
  //             stops, and again with its sound when she taps it.
  //    pose     Optional: what the little couple are doing beside this stop's sign, like
  //             pose: 'hug'. Choose 'holding-hands' (the one you get if you leave it out),
  //             'waving', 'hug', 'sitting', 'dancing', 'pointing' (she points at the photo),
  //             'celebrate' (they jump for joy), 'walking' (hand in hand, on the spot),
  //             'selfie' (he holds up a phone), 'goofy' (a silly dance), 'heart' (they make a
  //             heart with their hands, and keep fumbling it) or 'none' (no couple at this
  //             stop). Whatever they are doing, a tap makes them wave. See README, "Poses and pets".
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
  //  (Three per zone is the starting plan. A zone with no moments is just a short stretch of
  //  scenery.) If a moment is in an earlier zone than the moment before it, the ride puts it
  //  in the same zone as the moment before it and shows a "zone order" error in the console.
  // ---------------------------------------------------------------------------
  moments: [
    // Moment 1
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/01.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Nov 17, 2025',
      // A short title, just a few words.
      title: 'Will you be mine?',
      // What made this moment special. A long note scrolls inside the card.
      caption: "The night I asked you to be my girlfriend, and you said yes. Still the best answer I've ever gotten.",
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'autumn',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'hug',
    },

    // Moment 2
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/02.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Nov 28, 2025',
      // A short title, just a few words.
      title: 'Our first Thanksgiving',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'Our first Thanksgiving together, and the first time I got to meet your family. I was so happy to spend it with you.',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'autumn',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'waving',
    },

    // Moment 3
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/03.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Dec 16, 2025',
      // A short title, just a few words.
      title: 'Our first musical',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'Our first Christmas show together, and our first musical too. I had so much fun sitting next to you.',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'autumn',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'dancing',
    },

    // Moment 4
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/04.mp4',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Dec 31, 2025',
      // A short title, just a few words.
      title: "New Year's fiasco",
      // What made this moment special. A long note scrolls inside the card.
      caption: "Our New Year's fiasco lol. I will never forget it, and I'm glad I got to laugh through it with you.",
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'winter',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'celebrate',
    },

    // Moment 5
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/05.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Feb 13, 2026',
      // A short title, just a few words.
      title: 'Universal with you',
      // What made this moment special. A long note scrolls inside the card.
      caption: "You took me to Universal, and it's one of the highlights of my life. Thank you so much for that day.",
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'winter',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'pointing',
    },

    // Moment 6
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/06.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Apr 25, 2026',
      // A short title, just a few words.
      title: 'Our first hike',
      // What made this moment special. A long note scrolls inside the card.
      caption: "Our first hike together. I'll take any trail as long as you're on it with me.",
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'winter',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'walking',
    },

    // Moment 7
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/07.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'May 2, 2026',
      // A short title, just a few words.
      title: 'Your pre-birthday',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'Your pre-birthday celebration. You were traveling on the real day, so getting to celebrate you early meant so much to me.',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'spring',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'selfie',
    },

    // Moment 8
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/08.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Jun 29, 2026',
      // A short title, just a few words.
      title: 'Lake Tahoe',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'My birthday trip to Lake Tahoe. I love this picture so much. Look how cute we are!',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'spring',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'hug',
    },

    // Moment 9
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/09.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Jun 30, 2026',
      // A short title, just a few words.
      title: 'Still in Tahoe',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'Same trip, and proof of how goofy we are together. I love that we get to be this silly.',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'spring',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'goofy',
    },

    // Moment 10
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/10.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Jul 2, 2026',
      // A short title, just a few words.
      title: 'That view',
      // What made this moment special. A long note scrolls inside the card.
      caption: "Look at that background! This one turned out amazing. I'm so glad you put up with my friends (and me).",
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'summer',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'waving',
    },

    // Moment 11
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/11.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Aug 9, 2026',
      // A short title, just a few words.
      title: 'Our first camping trip',
      // What made this moment special. A long note scrolls inside the card.
      caption: "Our first camping trip together, and we made it! I'd go again anytime with you.",
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'summer',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'sitting',
    },

    // Moment 12
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/12.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Aug 22, 2026',
      // A short title, just a few words.
      title: 'Almost a heart',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'Us trying to make a heart with our hands and failing, LOL. Still my favorite heart.',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'summer',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'heart',
    },

    // Moment 13
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/13.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Sep 5, 2026',
      // A short title, just a few words.
      title: 'Labor Day in Arnold',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'Our Labor Day trip to Arnold was so much fun! Your family is amazing, and having you there made the whole trip.',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'evening',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'celebrate',
    },

    // Moment 14
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/14.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Sep 14, 2026',
      // A short title, just a few words.
      title: 'Meeting my family',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'Us in Indian traditional wear. So many people texted me about how great you looked! It was also your first time meeting my family, and we made it through. Yay us!',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'evening',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'dancing',
    },

    // Moment 15
    {
      // Photo (or short video) in site/photos/, like 'photos/01.jpg', or '' for a placeholder.
      photo: 'photos/15.jpg',
      // When it happened, as text: 'Oct 2025', '14 Feb', 'Our first date'. Short is best.
      date: 'Oct 14, 2026',
      // A short title, just a few words.
      title: 'Our life together',
      // What made this moment special. A long note scrolls inside the card.
      caption: 'A little slice of our everyday life together. It makes me laugh, and it fills my heart.',
      // The scene at this stop: spring, summer, autumn, winter or evening, in zone order.
      zone: 'evening',
      // What the two of them are doing at this stop (README, "Poses and pets").
      pose: 'sitting',
    },
  ],

  // ---------------------------------------------------------------------------
  //  The little couple: the cartoon pair you will see beside every photo sign and in the finale
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
  //  Pets
  //
  //  Optional, and not written here: a little dog or cat sits at the couple's feet at each
  //  stop, and one trots over with you in the finale. Leave it out and the ride picks one at
  //  random for each. To always have the same kind, add a line like
  //    pets: 'cat',
  //  using 'random' (the same as leaving it out), 'dog', 'cat' or 'none' (no pets at all).
  //  See README, "Poses and pets".
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  //  Music
  //
  //  Leave it as '' and each scene plays its own gentle music (piano pieces by Chopin, and a
  //  carol in the winter hills). To use your own song instead, put an mp3 in the music folder
  //  (site/music/) and write its path here, like 'music/our-song.mp3'. It plays through every
  //  scene, in place of theirs. It starts when she taps the start button, and she can switch
  //  it off and on with the Sound button.
  // ---------------------------------------------------------------------------
  music: '',
};
