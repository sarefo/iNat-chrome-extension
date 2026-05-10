// Shared annotation definitions used by background, content scripts, and HTML pages.
// Loaded as a classic script in all contexts (manifest content_scripts, importScripts in
// background, <script> in popup/custom-bulk/taxonomy). No imports/exports.

// Each entry: list of { a: controlled_attribute_id, v: controlled_value_id }
const INAT_ANNOTATION_CONFIGS = {
  'adult-alive':             [{a:1,v:2},{a:17,v:18},{a:22,v:24}],
  'adult-cannot':            [{a:1,v:2},{a:17,v:20},{a:22,v:24}],
  'adult-dead':              [{a:1,v:2},{a:17,v:19},{a:22,v:24}],
  'juvenile':                [{a:1,v:8},{a:17,v:18},{a:22,v:24}],
  'juvenile-cannot':         [{a:1,v:8},{a:17,v:20},{a:22,v:24}],
  'juvenile-dead':           [{a:1,v:8},{a:17,v:19},{a:22,v:24}],
  'dead-only':               [{a:17,v:19},{a:22,v:24}],
  'molt':                    [{a:17,v:19},{a:22,v:28}],
  'age-unknown':             [{a:17,v:18},{a:22,v:24}],
  'cannot-only':             [{a:17,v:20},{a:22,v:24}],
  'plant-flowers':           [{a:12,v:13},{a:36,v:38}],
  'plant-fruits':            [{a:12,v:14},{a:36,v:38}],
  'plant-no-flowers-fruits': [{a:12,v:21},{a:36,v:38}],
  'sex-female':              [{a:9,v:10}],
  'sex-male':                [{a:9,v:11}],
  'eop-construction':        [{a:22,v:35}],
  'eop-egg':                 [{a:22,v:30}],
  'eop-gall':                [{a:22,v:29}],
  'eop-molt':                [{a:22,v:28}],
  'eop-track':               [{a:22,v:26}],
  'life-pupa':               [{a:1,v:4}],
};

// Modes containing a juvenile Life Stage annotation that needs ancestry-based resolution
const INAT_JUVENILE_MODES = new Set(['juvenile', 'juvenile-cannot', 'juvenile-dead']);

// Display labels per mode. Includes synthetic modes ('sex-split', 'mating') used by UI
// flows that don't map 1:1 to a single annotation config.
const INAT_ANNOTATION_LABELS = {
  'adult-alive':             '🦆 Adult Alive',
  'adult-cannot':            '❓ Adult Cannot Be Determined',
  'adult-dead':              '💀 Adult Dead',
  'juvenile':                '🐛 Juvenile Alive',
  'juvenile-cannot':         '❓ Juvenile Cannot Be Determined',
  'juvenile-dead':           '💀 Juvenile Dead',
  'dead-only':               '💀 Dead',
  'molt':                    '💀 Molt',
  'age-unknown':             '🟢 Alive',
  'cannot-only':             '❓ Cannot Be Determined',
  'plant-flowers':           '🌼 Flowers',
  'plant-fruits':            '🍇 Fruits',
  'plant-no-flowers-fruits': '❌ No Flowers/Fruits',
  'sex-female':              '♀ Female',
  'sex-male':                '♂ Male',
  'sex-split':               '⚥ Sex (♀/♂)',
  'mating':                  '❤️ Mating',
  'eop-construction':        '🏗 Construction',
  'eop-egg':                 '🥚 Egg',
  'eop-gall':                '🌿 Gall',
  'eop-molt':                '🪲 Molt',
  'eop-track':               '👣 Track',
  'life-pupa':               '🐛 Pupa',
};
