// Realistic content for the e2e specs: what site/content.js looks like once it has been filled in.
// intro.title, finale.wish and finale.signoff are left out on purpose, so the specs also see the
// ones derived from the names: "For Maya", "Happy 1 year, Maya" and "Sam".
export default {
  herName: 'Maya',
  yourName: 'Sam',
  intro: {
    note: 'A little ride through our first year.',
  },
  finale: {
    message: 'Thank you for the best year of my life.',
  },
  zones: ['spring', 'summer', 'autumn', 'winter', 'evening'],
  moments: [
    { photo: '', date: 'Oct 2025', title: 'First coffee', caption: 'We stayed until the café closed.', zone: 'spring' },
    { photo: '', date: 'Nov 2025', title: 'Rainy walk', caption: 'One umbrella, two people, no complaints.', zone: 'spring' },
    { photo: '', date: 'Dec 2025', title: 'Beach day', caption: 'Sand in everything and smiles everywhere.', zone: 'summer' },
    { photo: '', date: 'Jan 2026', title: 'Sunset pier', caption: 'The sky turned pink and so did we.', zone: 'summer' },
    { photo: '', date: 'Feb 2026', title: 'Pumpkin patch', caption: 'You picked the smallest pumpkin and named it.', zone: 'autumn' },
    { photo: '', date: 'Mar 2026', title: 'Movie night', caption: 'Blankets, popcorn, and not one scene remembered.', zone: 'autumn' },
    { photo: '', date: 'May 2026', title: 'First snow', caption: 'We built the smallest snowman in town.', zone: 'winter' },
    { photo: '', date: 'Jun 2026', title: 'Ice skating', caption: 'Mostly just holding on to each other.', zone: 'winter' },
    { photo: '', date: 'Aug 2026', title: 'City lights', caption: 'The whole town glowed for us.', zone: 'evening' },
    { photo: '', date: 'Sep 2026', title: 'Our dinner', caption: 'One year in, and still the best table in town.', zone: 'evening' },
  ],
};
