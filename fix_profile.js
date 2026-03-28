const fs = require('fs');
const file = 'c:/Users/shreyas/ps-crmdev1/apps/web/app/citizen/profile/page.tsx';
let data = fs.readFileSync(file, 'utf8');

// Global replaces for Tailwind classes to add light theme support
data = data.replace(/text-\[\#f59e0b\](?!\/)/g, 'text-amber-700 dark:text-[#f59e0b]');
data = data.replace(/text-\[\#f59e0b\]\/70/g, 'text-amber-700/70 dark:text-[#f59e0b]/70');
data = data.replace(/text-\[\#f59e0b\]\/80/g, 'text-amber-700/80 dark:text-[#f59e0b]/80');
data = data.replace(/text-\[\#f59e0b\]\/60/g, 'text-amber-700/60 dark:text-[#f59e0b]/60');
data = data.replace(/text-\[\#f59e0b\]\/50/g, 'text-amber-700/50 dark:text-[#f59e0b]/50');

data = data.replace(/bg-black\/40/g, 'bg-white/60 dark:bg-black/40');

data = data.replace(/border-\[\#f59e0b\]\/40/g, 'border-amber-600/20 dark:border-[#f59e0b]/40');
data = data.replace(/border-\[\#f59e0b\]\/20/g, 'border-amber-600/10 dark:border-[#f59e0b]/20');
data = data.replace(/border-\[\#f59e0b\](?!\/)/g, 'border-amber-600 dark:border-[#f59e0b]');

data = data.replace(/bg-\[\#f59e0b\]\/10/g, 'bg-amber-500/10 dark:bg-[#f59e0b]/10');
data = data.replace(/bg-\[\#f59e0b\]\/5/g, 'bg-amber-600/5 dark:bg-[#f59e0b]/5');
data = data.replace(/bg-\[\#f59e0b\]\/20/g, 'bg-amber-200 dark:bg-[#f59e0b]/20');
data = data.replace(/bg-\[\#f59e0b\](?!\/)/g, 'bg-amber-600 dark:bg-[#f59e0b]');

data = data.replace(/shadow-\[0_0_8px_\#f59e0b\]/g, 'shadow-[0_0_8px_rgba(217,119,6,0.4)] dark:shadow-[0_0_8px_#f59e0b]');
data = data.replace(/shadow-\[0_0_10px_\#f59e0b\]/g, 'shadow-[0_0_10px_rgba(217,119,6,0.4)] dark:shadow-[0_0_10px_#f59e0b]');

fs.writeFileSync(file, data);
console.log('Done replacing tailwind classes!');
