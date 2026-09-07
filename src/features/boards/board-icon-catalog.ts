import { boardSymbolAllowlist } from '@/core/domain/entities';

export const boardIconCategories = [
  'Everyday', 'Health', 'Movement', 'Food', 'Focus', 'Creative', 'Life', 'Outdoors',
] as const;

export type BoardIconCategory = (typeof boardIconCategories)[number];
type BoardIconName = (typeof boardSymbolAllowlist)[number];
type BoardIconMetadata = {
  label: string;
  category: BoardIconCategory;
  keywords: string;
  // simple 24-point outline artwork keeps the same meaning on android and web
  path: string;
};

const metadata = {
  calendar: { label: 'Calendar', category: 'Everyday', keywords: 'daily schedule plan', path: 'M4 5h16v16H4zM4 10h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2' },
  'star.fill': { label: 'Star', category: 'Everyday', keywords: 'favorite goal reward', path: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z' },
  'checkmark.circle.fill': { label: 'Checkmark', category: 'Everyday', keywords: 'done complete task', path: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 12l3 3 5-6' },
  'flame.fill': { label: 'Flame', category: 'Everyday', keywords: 'streak energy fire', path: 'M12 3c1 6 7 6 7 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 4 2 4 2 4s2-3 1-9ZM12 14c-4 3-3 7 0 7s4-4 0-7Z' },
  'alarm.fill': { label: 'Alarm', category: 'Everyday', keywords: 'wake morning early', path: 'M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM12 8v5l3 2M2 5l4-3m12 0 4 3M6 20l-2 2m14-2 2 2' },
  timer: { label: 'Timer', category: 'Everyday', keywords: 'time minutes pomodoro', path: 'M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM9 2h6m-3 0v4m0 4v4l3 2m3-10 2-2' },
  'sun.max.fill': { label: 'Sun', category: 'Everyday', keywords: 'morning light daylight', path: 'M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5' },
  'moon.stars.fill': { label: 'Moon', category: 'Everyday', keywords: 'night bedtime evening', path: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11ZM17 3v4m-2-2h4m1 3v4m-2-2h4' },
  'heart.fill': { label: 'Heart', category: 'Health', keywords: 'love wellbeing care', path: 'M12 21 3.8 13A5.5 5.5 0 0 1 12 5.7 5.5 5.5 0 0 1 20.2 13Z' },
  'pills.fill': { label: 'Medicine', category: 'Health', keywords: 'pills vitamins medication supplement', path: 'm5 13 8-8a4.2 4.2 0 0 1 6 6l-8 8a4.2 4.2 0 0 1-6-6ZM9 9l6 6' },
  'brain.head.profile': { label: 'Mind', category: 'Health', keywords: 'brain mental therapy mindful', path: 'M9 21v-4H6v-4H3l3-5a7 7 0 1 1 12 7v6M10 7l3-2 3 2v3l-3 2-3-2Zm3-2v7' },
  'leaf.fill': { label: 'Leaf', category: 'Health', keywords: 'wellness nature breathing plant', path: 'M20 3C7 3 2 9 5 16c7 5 16 0 15-13ZM4 21 16 9' },
  'drop.fill': { label: 'Water', category: 'Health', keywords: 'drink hydration hydrate', path: 'M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-12ZM8 15a4 4 0 0 0 4 4' },
  'mouth.fill': { label: 'Dental care', category: 'Health', keywords: 'teeth brush floss dentist dental', path: 'M12 5C4 0 2 6 5 13c1 4 1 8 3 8 2 0 1-7 4-7s2 7 4 7c2 0 2-4 3-8 3-7 1-13-7-8Z' },
  'bandage.fill': { label: 'Recovery', category: 'Health', keywords: 'heal injury rest bandage', path: 'm4 14 10-10a4.2 4.2 0 0 1 6 6L10 20a4.2 4.2 0 0 1-6-6ZM8 10l6 6m-4-8 6 6m-5-2 .1.1m1.9-2.1 .1.1' },
  'lungs.fill': { label: 'Breathing', category: 'Health', keywords: 'breath lungs breathe meditation', path: 'M12 3v8M9 7C7 2 2 11 2 17c0 4 5 4 7 2V7Zm6 0c2-5 7 4 7 10 0 4-5 4-7 2V7ZM7 14l5-3 5 3' },
  'figure.walk': { label: 'Walking', category: 'Movement', keywords: 'walk steps stroll', path: 'M15 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 12l4-4 4 2 3 1m-7-3-2 7-4 6m4-6 5 2 1 5m-3-12 1 5' },
  'figure.run': { label: 'Running', category: 'Movement', keywords: 'run jogging cardio marathon', path: 'M17 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM4 10l5-3 5 3 3 3h4m-7-3-4 5-6 2-2-3m8 1 5 2-2 5' },
  bicycle: { label: 'Cycling', category: 'Movement', keywords: 'bike ride cycle commute', path: 'M9 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm14 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 17l5-8 5 8H5Zm5-8h6l3 8m-3-8-1-4h3M8 6h4' },
  'dumbbell.fill': { label: 'Strength', category: 'Movement', keywords: 'gym weights lift workout exercise', path: 'M8 10h8v4H8ZM4 6h4v12H4Zm12 0h4v12h-4ZM2 9v6m20-6v6' },
  'figure.pool.swim': { label: 'Swimming', category: 'Movement', keywords: 'swim pool water laps', path: 'M3 20q3-3 6 0t6 0 6 0M3 16q3-3 6 0t6 0 6 0M4 12l6-6 5 3-5 5m0-8 6-3 4 3m-2 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
  'figure.mind.and.body': { label: 'Yoga', category: 'Movement', keywords: 'stretch pilates meditation balance', path: 'M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM4 13l4-2 2-3h4l2 3 4 2M10 8v7l-6 4 8 2 8-2-6-4V8M8 18l4 3 4-3' },
  soccerball: { label: 'Football', category: 'Movement', keywords: 'soccer sport team', path: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 7l5 4-2 6H9l-2-6Zm0 0V2m5 9 5-2m-7 8 3 3m-9-3-3 3m1-9L2 9' },
  'basketball.fill': { label: 'Basketball', category: 'Movement', keywords: 'hoops sport play', path: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2v20M5 5c8 3 8 11 0 14M19 5c-8 3-8 11 0 14' },
  'carrot.fill': { label: 'Vegetables', category: 'Food', keywords: 'carrot healthy nutrition salad', path: 'M16 8c-3-3-5-2-7 1L3 21l12-6c3-2 4-4 1-7Zm0 0 5-5m-5 5 5 1m-5-1-1-5M8 13l3 2m0-7 3 2' },
  'cup.and.saucer.fill': { label: 'Coffee', category: 'Food', keywords: 'tea cup caffeine drink', path: 'M4 8h12v7a6 6 0 0 1-12 0Zm12 1h2a3 3 0 0 1 0 6h-2M2 22h18M7 2v3m5-3v3' },
  'fork.knife': { label: 'Meals', category: 'Food', keywords: 'eat dinner food cooking lunch', path: 'M4 2v6c0 4 6 4 6 0V2M7 2v20M20 2c-4 3-5 7-5 11h5V2Zm0 11v9' },
  'takeoutbag.and.cup.and.straw.fill': { label: 'Takeout', category: 'Food', keywords: 'food delivery lunch fast', path: 'M2 8h11l-1 13H3ZM5 8V5a3 3 0 0 1 6 0v3m4 3h7l-1 10h-5ZM19 11V4l3-2' },
  'mug.fill': { label: 'Tea', category: 'Food', keywords: 'herbal drink mug relax warm', path: 'M3 7h13v13H3Zm13 2h3a3 3 0 0 1 0 6h-3M6 2v2m4-2v2m4-2v2' },
  'waterbottle.fill': { label: 'Water bottle', category: 'Food', keywords: 'water drink refill hydration', path: 'M9 2h6v4l3 3v11l-2 2H8l-2-2V9l3-3ZM9 6h6M6 11h12M6 18h12' },
  'birthday.cake.fill': { label: 'Baking', category: 'Food', keywords: 'cake bake dessert cook treat', path: 'M3 12h18v10H3ZM3 16q3 4 6 0 3 4 6 0 3 4 6 0M7 8v4m5-4v4m5-4v4M7 4v1m5-3v2m5 0v1' },
  'fish.fill': { label: 'Fish', category: 'Food', keywords: 'protein seafood nutrition', path: 'M3 12c5-10 12-10 16 0-4 10-11 10-16 0Zm16 0 4-5v10Zm-11-1h.1M12 6v12' },
  'book.fill': { label: 'Reading', category: 'Focus', keywords: 'book read study learn', path: 'M12 6C8 3 4 3 2 4v16c4-1 7 0 10 2 3-2 6-3 10-2V4c-2-1-6-1-10 2ZM12 6v16' },
  pencil: { label: 'Writing', category: 'Focus', keywords: 'journal diary pages notes write', path: 'm3 17 12-12 4 4L7 21H3Zm12-12 3-3 4 4-3 3M3 17l4 4' },
  desktopcomputer: { label: 'Computer', category: 'Focus', keywords: 'work code programming desktop', path: 'M2 3h20v14H2ZM8 22h8m-4-5v5M2 13h20' },
  'phone.fill': { label: 'Phone call', category: 'Focus', keywords: 'call talk connect family', path: 'm5 2 4 5-3 3c2 4 4 6 8 8l3-3 5 4c-3 6-8 3-13-2S1 5 5 2Z' },
  'iphone.slash': { label: 'Screen break', category: 'Focus', keywords: 'digital detox offline phone less', path: 'M7 3h10v18H7ZM10 6h4m-2 12h.1M2 2l20 20' },
  'play.rectangle.fill': { label: 'Video', category: 'Focus', keywords: 'watch learn course movie', path: 'M2 4h20v16H2ZM10 8l6 4-6 4Z' },
  magnifyingglass: { label: 'Research', category: 'Focus', keywords: 'search explore learn investigate', path: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 15l7 7' },
  checklist: { label: 'Tasks', category: 'Focus', keywords: 'todo checklist plan organize productivity', path: 'm3 5 2 2 3-4m3 2h10M3 12l2 2 3-4m3 2h10M3 19l2 2 3-4m3 2h10' },
  'paintbrush.fill': { label: 'Painting', category: 'Creative', keywords: 'paint brush art create', path: 'm9 12 9-10 4 4-10 9Zm0 0c-7-2-3 8-7 8 7 2 11-1 10-5' },
  'music.note': { label: 'Music', category: 'Creative', keywords: 'listen practice song sing', path: 'M9 18V5l12-3v13M9 9l12-3M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-3a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
  'guitars.fill': { label: 'Guitar', category: 'Creative', keywords: 'instrument practice strings', path: 'm12 10 7-7 2 2-7 7c4 3 1 5-2 5 0 6-6 7-9 4S1 12 7 12c0-3 2-6 5-2ZM6 16l2 2m3-5 .1.1' },
  'camera.fill': { label: 'Photography', category: 'Creative', keywords: 'photo picture camera capture', path: 'M2 7h5l2-4h6l2 4h5v14H2ZM17 13a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z' },
  'paintpalette.fill': { label: 'Art', category: 'Creative', keywords: 'draw design color creativity', path: 'M12 2a10 10 0 1 0 0 20c4 0 1-5 4-6h3c6-5 0-14-7-14ZM7 7h.1m5-2h.1m5 3h.1M5 12h.1' },
  scissors: { label: 'Crafts', category: 'Creative', keywords: 'craft sew make handmade', path: 'M8 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 9l14 12M7 15 21 3' },
  'keyboard.fill': { label: 'Typing', category: 'Creative', keywords: 'keyboard practice code write', path: 'M2 5h20v14H2ZM5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10' },
  'mic.fill': { label: 'Voice', category: 'Creative', keywords: 'sing podcast speak record language', path: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8' },
  'bed.double.fill': { label: 'Sleep', category: 'Life', keywords: 'rest bed bedtime nap', path: 'M3 3v19m18-13v13M3 9h18v9H3Zm3-4h6v4H6Zm6 0h6v4h-6Z' },
  'person.2.fill': { label: 'Friends', category: 'Life', keywords: 'social family connect people', path: 'M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM1 22v-4a6 6 0 0 1 12 0v4M15 3a4 4 0 0 1 0 8m1 3a6 6 0 0 1 7 6v2' },
  'pawprint.fill': { label: 'Pets', category: 'Life', keywords: 'dog cat pet walk animal', path: 'M8 5a2 3 0 1 1-4 0 2 3 0 0 1 4 0Zm12 0a2 3 0 1 1-4 0 2 3 0 0 1 4 0ZM5 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM12 12c-3 0-9 9-5 10l5-1 5 1c4-1-2-10-5-10Z' },
  'house.fill': { label: 'Home', category: 'Life', keywords: 'clean chores tidy household', path: 'm2 10 10-8 10 8M4 9v13h16V9M9 22v-8h6v8' },
  sparkles: { label: 'Self care', category: 'Life', keywords: 'skincare beauty clean gratitude', path: 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3ZM3 2v4M1 4h4m15 14v4m-2-2h4' },
  'suitcase.fill': { label: 'Travel', category: 'Life', keywords: 'trip work commute pack', path: 'M3 7h18v15H3ZM8 7V2h8v5M8 7v15m8-15v15' },
  'gift.fill': { label: 'Giving', category: 'Life', keywords: 'gift kind charity generosity', path: 'M2 8h20v5H2ZM4 13v9h16v-9M12 8v14m0-14c-10 0-7-9-3-5Zm0 0c10 0 7-9 3-5Z' },
  'cart.fill': { label: 'Shopping', category: 'Life', keywords: 'groceries errands buy budget', path: 'M1 2h3l3 14h12l3-10H5M7 20a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm10 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z' },
  'tree.fill': { label: 'Nature', category: 'Outdoors', keywords: 'tree forest fresh air', path: 'm12 2 6 7h-3l5 7H4l5-7H6Zm0 14v6m-4 0h8' },
  'mountain.2.fill': { label: 'Hiking', category: 'Outdoors', keywords: 'hike mountain climb trail', path: 'm2 21 9-18 11 18ZM7 11l4 2 3-4M15 6l3-3 5 10' },
  'tent.fill': { label: 'Camping', category: 'Outdoors', keywords: 'camp outdoor adventure', path: 'M2 22 12 3l10 19ZM8 22l4-8 4 8M9 2l6 6m0-6L9 8' },
  'globe.americas.fill': { label: 'Explore', category: 'Outdoors', keywords: 'globe world language travel', path: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM4 6l5 1 2 4-3 2 2 3v5m3-17 2 4 5 1m-3 4-3 3 3 4' },
  airplane: { label: 'Flying', category: 'Outdoors', keywords: 'plane travel trip flight', path: 'M10 9V4c0-4 4-4 4 0v5l8 6v3l-8-3v4l3 2v1l-5-1-5 1v-1l3-2v-4l-8 3v-3Z' },
  'location.north.circle.fill': { label: 'Adventure', category: 'Outdoors', keywords: 'compass direction explore journey', path: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 5l5 13-5-3-5 3Z' },
  'sun.haze.fill': { label: 'Fresh air', category: 'Outdoors', keywords: 'outside sunlight morning outdoors', path: 'M7 14a5 5 0 0 1 10 0M12 2v3M3 7l3 2m15-2-3 2M2 14h20M4 18h16M7 22h10' },
  'umbrella.fill': { label: 'Rain', category: 'Outdoors', keywords: 'rain weather walk umbrella', path: 'M2 12a10 10 0 0 1 20 0ZM12 2v18c0 3 5 3 5 0M7 12c0-13 10-13 10 0' },
} satisfies Record<BoardIconName, BoardIconMetadata>;

export const boardIcons = boardSymbolAllowlist.map((symbol) => ({ symbol, ...metadata[symbol] }));
export type BoardIcon = (typeof boardIcons)[number];

const iconsBySymbol = new Map<string, BoardIcon>(boardIcons.map((icon) => [icon.symbol, icon]));

export function getBoardIcon(symbol: string): BoardIcon | undefined {
  return iconsBySymbol.get(symbol);
}

export function filterBoardIcons(query: string, category: BoardIconCategory | 'All') {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return boardIcons.filter((icon) => {
    const searchText = `${icon.label} ${icon.keywords} ${icon.symbol} ${icon.category}`.toLowerCase();
    return (category === 'All' || icon.category === category) && words.every((word) => searchText.includes(word));
  });
}
