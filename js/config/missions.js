// ============================================================================
//  MISSIONS (sequential, 3 active at a time) & ACHIEVEMENTS.
//  type:
//   run        reach `target` metres in ONE run          (max-tracked)
//   distance   run `target` metres in total              (counter)
//   cashout    earn $`target` from cash outs              (counter)
//   cashouts   cash out `target` times                    (counter)
//   sneakers   buy `target` sneakers                      (counter)
//   eggs       hatch `target` eggs                        (counter)
//   equip      have `target` pets equipped                (state)
//   rarity     own a pet of rarity >= `rarity`            (state)
//   coins      collect `target` coins on the track        (counter)
//   hurdles    jump over `target` hurdles                 (counter)
//   pads       hit `target` boost pads                    (counter)
//   speed      reach `target` km/h                        (max-tracked)
// ============================================================================

export const MISSIONS = [
  { id: 'm1', type: 'run', target: 100, text: 'Run 100 m in one run', reward: { money: 60 } },
  { id: 'm2', type: 'cashouts', target: 1, text: 'Cash out once', reward: { money: 50, gems: 2 } },
  { id: 'm3', type: 'sneakers', target: 1, text: 'Buy a new pair of sneakers', reward: { money: 120 } },
  { id: 'm4', type: 'coins', target: 15, text: 'Collect 15 coins on the track', reward: { money: 150 } },
  { id: 'm5', type: 'eggs', target: 1, text: 'Hatch your first egg', reward: { money: 250, gems: 3 } },
  { id: 'm6', type: 'run', target: 500, text: 'Run 500 m in one run', reward: { money: 600 } },
  { id: 'm7', type: 'cashout', target: 1000, text: 'Cash out $1,000 in total', reward: { money: 500, gems: 3 } },
  { id: 'm8', type: 'sneakers', target: 2, text: 'Buy 2 more sneakers', reward: { money: 1500 } },
  { id: 'm9', type: 'eggs', target: 3, text: 'Hatch 3 eggs', reward: { money: 1500, gems: 3 } },
  { id: 'm10', type: 'equip', target: 3, text: 'Equip 3 pets', reward: { money: 2000 } },
  { id: 'm11', type: 'hurdles', target: 10, text: 'Jump over 10 hurdles', reward: { money: 2500, gems: 2 } },
  { id: 'm12', type: 'run', target: 2000, text: 'Reach the DESERT (2 km)', reward: { money: 6000, gems: 4 } },
  { id: 'm13', type: 'pads', target: 10, text: 'Hit 10 boost pads', reward: { money: 8000, boost: 'speed' } },
  { id: 'm14', type: 'rarity', rarity: 'Epic', text: 'Own an Epic pet', reward: { money: 15000, gems: 5 } },
  { id: 'm15', type: 'run', target: 5000, text: 'Reach 5 KM', reward: { money: 40000, gems: 5 } },
  { id: 'm16', type: 'speed', target: 100, text: 'Reach 100 km/h', reward: { money: 60000, boost: 'money' } },
  { id: 'm17', type: 'cashout', target: 500000, text: 'Cash out $500K in total', reward: { money: 120000, gems: 6 } },
  { id: 'm18', type: 'run', target: 10000, text: 'Reach the MOUNTAINS (10 km)', reward: { money: 250000, gems: 8 } },
  { id: 'm19', type: 'rarity', rarity: 'Legendary', text: 'Own a Legendary pet', reward: { money: 500000, gems: 10 } },
  { id: 'm20', type: 'run', target: 25000, text: 'Reach NEON CITY (25 km)', reward: { money: 3e6, gems: 12 } },
  { id: 'm21', type: 'speed', target: 300, text: 'Reach 300 km/h', reward: { money: 10e6, gems: 12 } },
  { id: 'm22', type: 'run', target: 50000, text: 'Reach the SKY WORLD (50 km)', reward: { money: 50e6, gems: 15 } },
  { id: 'm23', type: 'run', target: 100000, text: 'Reach SPACE (100 km)', reward: { money: 500e6, gems: 25 } },
];

/** After the scripted list: endless procedural missions scaled to the player's records. */
export const PROCEDURAL_MISSIONS = [
  { type: 'run', mult: 1.25, text: (t) => `Run ${t} in one run`, rewardRuns: 2, gems: 3 },
  { type: 'cashouts', base: 5, text: (t) => `Cash out ${t} times`, rewardRuns: 2, gems: 2 },
  { type: 'coins', base: 60, text: (t) => `Collect ${t} coins`, rewardRuns: 1.5, gems: 2 },
  { type: 'eggs', base: 5, text: (t) => `Hatch ${t} eggs`, rewardRuns: 1.5, gems: 3 },
  { type: 'hurdles', base: 25, text: (t) => `Jump over ${t} hurdles`, rewardRuns: 1.5, gems: 2 },
];

export const ACHIEVEMENTS = [
  { id: 'first_run', name: 'First Steps', desc: 'Complete your first run', icon: '👟', gems: 2, check: (s) => s.stats.runs >= 1 },
  { id: 'km1', name: '1 KM Club', desc: 'Run 1 km in one run', icon: '🏁', gems: 3, check: (s) => s.stats.bestDistance >= 1000 },
  { id: 'km10', name: '10 KM Legend', desc: 'Run 10 km in one run', icon: '⛰️', gems: 8, check: (s) => s.stats.bestDistance >= 10000 },
  { id: 'marathon', name: 'Marathoner', desc: 'Run a full marathon (42.195 km)', icon: '🏅', gems: 12, check: (s) => s.stats.bestDistance >= 42195 },
  { id: 'km100', name: 'Space Cadet', desc: 'Run 100 km in one run', icon: '🚀', gems: 25, check: (s) => s.stats.bestDistance >= 100000 },
  { id: 'collector', name: 'Sneaker Collector', desc: 'Own 7 different sneakers', icon: '🧦', gems: 6, check: (s) => s.sneakers.owned.length >= 7 },
  { id: 'master', name: 'Sneakerhead', desc: 'Own all 14 sneakers', icon: '👑', gems: 30, check: (s) => s.sneakers.owned.length >= 14 },
  { id: 'pets10', name: 'Pet Collector', desc: 'Hatch 10 eggs', icon: '🥚', gems: 5, check: (s) => s.stats.eggsHatched >= 10 },
  { id: 'pets50', name: 'Zookeeper', desc: 'Hatch 50 eggs', icon: '🦁', gems: 12, check: (s) => s.stats.eggsHatched >= 50 },
  { id: 'legendary', name: 'Legendary Find', desc: 'Hatch a Legendary pet', icon: '🌟', gems: 8, check: (s) => s.stats.bestRarity >= 4 },
  { id: 'mythic', name: 'Mythic Find', desc: 'Hatch a Mythic pet', icon: '💫', gems: 15, check: (s) => s.stats.bestRarity >= 5 },
  { id: 'secret', name: 'The Void Stares Back', desc: 'Hatch a Secret pet', icon: '🕳️', gems: 40, check: (s) => s.stats.bestRarity >= 6 },
  { id: 'million', name: 'Millionaire', desc: 'Earn $1M in total', icon: '💵', gems: 6, check: (s) => s.stats.totalEarned >= 1e6 },
  { id: 'billion', name: 'Billionaire', desc: 'Earn $1B in total', icon: '🏦', gems: 20, check: (s) => s.stats.totalEarned >= 1e9 },
  { id: 'speed', name: 'Speed Demon', desc: 'Reach 300 km/h', icon: '🔥', gems: 8, check: (s) => s.stats.topSpeed >= 300 },
  { id: 'lightspeed', name: 'Light Feet', desc: 'Reach 600 km/h', icon: '⚡', gems: 15, check: (s) => s.stats.topSpeed >= 600 },
  { id: 'coins', name: 'Coin Magnet', desc: 'Collect 1,000 coins', icon: '🪙', gems: 6, check: (s) => s.stats.coins >= 1000 },
  { id: 'rebirth', name: 'Born Again', desc: 'Rebirth for the first time', icon: '♻️', gems: 10, check: (s) => s.rebirth.count >= 1 },
];
