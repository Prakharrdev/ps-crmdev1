const fs = require('fs');
const files = [
  'apps/web/app/citizen/profile/page.tsx',
  'apps/web/app/authority/profile/page.tsx',
  'apps/web/app/admin/profile/page.tsx',
  'apps/web/app/worker/profile/page.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Exact string replaces
  content = content.replace(/text-amber-700 dark:text-\[\#f59e0b\]/g, 'text-gray-800 dark:text-[#f59e0b]');
  content = content.replace(/text-amber-700\/70 dark:text-\[\#f59e0b\]\/70/g, 'text-gray-600 dark:text-[#f59e0b]/70');
  content = content.replace(/text-amber-700\/80 dark:text-\[\#f59e0b\]\/80/g, 'text-gray-700 dark:text-[#f59e0b]/80');
  content = content.replace(/text-amber-700\/60 dark:text-\[\#f59e0b\]\/60/g, 'text-gray-500 dark:text-[#f59e0b]/60');
  content = content.replace(/text-amber-700\/50 dark:text-\[\#f59e0b\]\/50/g, 'text-gray-400 dark:text-[#f59e0b]/50');

  content = content.replace(/bg-amber-600 dark:bg-\[\#f59e0b\]/g, 'bg-[#C9A84C] dark:bg-[#f59e0b]');
  content = content.replace(/bg-amber-600\/5 dark:bg-\[\#f59e0b\]\/5/g, 'bg-[#C9A84C]/5 dark:bg-[#f59e0b]/5');
  content = content.replace(/bg-amber-500\/10 dark:bg-\[\#f59e0b\]\/10/g, 'bg-[#C9A84C]/10 dark:bg-[#f59e0b]/10');
  content = content.replace(/bg-amber-500\/10 dark:hover:bg-\[\#f59e0b\]\/10/g, 'bg-[#C9A84C]/10 dark:hover:bg-[#f59e0b]/10');
  content = content.replace(/hover:bg-amber-500\/10 dark:hover:bg-\[\#f59e0b\]\/10/g, 'hover:bg-[#C9A84C]/10 dark:hover:bg-[#f59e0b]/10');
  content = content.replace(/focus:bg-amber-200 dark:focus:bg-\[\#f59e0b\]\/20/g, 'focus:bg-[#C9A84C]/20 dark:focus:bg-[#f59e0b]/20');

  content = content.replace(/border-amber-600\/10 dark:border-\[\#f59e0b\]\/20/g, 'border-gray-200 dark:border-[#f59e0b]/20');
  content = content.replace(/border-amber-600\/20 dark:border-\[\#f59e0b\]\/40/g, 'border-gray-200 dark:border-[#f59e0b]/40');
  content = content.replace(/border-amber-600 dark:border-\[\#f59e0b\]/g, 'border-[#C9A84C] dark:border-[#f59e0b]');

  content = content.replace(/shadow-\[0_0_8px_rgba\(217,119,6,0\.4\)\] dark:shadow-\[0_0_8px_\#f59e0b\]/g, 'shadow-none dark:shadow-[0_0_8px_#f59e0b]');
  content = content.replace(/shadow-\[0_0_10px_rgba\(217,119,6,0\.4\)\] dark:shadow-\[0_0_10px_\#f59e0b\]/g, 'shadow-none dark:shadow-[0_0_10px_#f59e0b]');

  content = content.replace(/bg-white\/60 dark:bg-black\/40/g, 'bg-white dark:bg-black/40');

  // Replace background
  content = content.replace(/bg-gray-50/g, 'bg-[#fcfbf9]');

  content = content.replace(/const styles \= `[\s\S]*?`/g, `const styles = \`
    .terminal-container {
      background-color: #fcfbf9;
      transition: background-color 0.3s ease;
    }
    .dark .terminal-container {
      background-color: #0c0c0c;
      background-image: radial-gradient(circle, #1a1200 0%, #000000 100%);
    }
    .scanlines {
      display: none;
    }
    .dark .scanlines {
      display: block;
      background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1));
      background-size: 100% 4px;
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 10;
    }
    .flicker {
      animation: flicker 0.15s infinite;
    }
    @keyframes flicker {
      0% { opacity: 0.98; }
      50% { opacity: 1; }
      100% { opacity: 0.98; }
    }
    .glow-amber {
      color: #1f2937;
    }
    .dark .glow-amber {
      color: #f59e0b;
      text-shadow: 0 0 5px rgba(245, 158, 11, 0.4), 0 0 10px rgba(245, 158, 11, 0.2);
    }
    .glow-border {
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
    }
    .dark .glow-border {
      border: 2px solid rgba(245, 158, 11, 0.6);
      box-shadow: inset 0 0 10px rgba(245, 158, 11, 0.1), 0 0 10px rgba(245, 158, 11, 0.2);
    }
    .amber-highlight {
      background-color: #e6ddc5;
      color: #1f2937;
    }
    .dark .amber-highlight {
      background-color: #f59e0b;
      color: #0c0c0c;
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.5);
    }
    .interactive-item {
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .dark .interactive-item {
      cursor: crosshair;
    }
    .interactive-item:hover {
      background-color: #f3f4f6;
    }
    .dark .interactive-item:hover {
      background-color: rgba(245, 158, 11, 0.1);
      box-shadow: inset 0 0 10px rgba(245, 158, 11, 0.2);
    }
    button {
      outline: none;
    }
    .emblem-mask {
      background-color: #374151;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
    }
    .dark .emblem-mask {
      background-color: #f59e0b;
      filter: drop-shadow(0 0 15px rgba(245, 158, 11, 0.8));
    }
  \``);

  content = content.replace(/className="w-full aspect-\[3\/4\] max-h-\[400px\] bg-\[\#C9A84C\] dark:bg-\[\#f59e0b\] hover:scale-105 transition-transform duration-500 cursor-crosshair"/, 'className="w-full aspect-[3/4] max-h-[400px] emblem-mask hover:scale-105 transition-transform duration-500 cursor-pointer dark:cursor-crosshair"');
  
  content = content.replace(/filter: 'drop-shadow\(0 0 15px rgba\(245, 158, 11, 0\.8\)\)'/g, '');
  content = content.replace(/maskPosition: 'center',\s*}}/g, "maskPosition: 'center'\n              }}");

  // Fix button styles
  content = content.replace(/className="amber-highlight px-5 py-2 font-bold tracking-widest text-sm sm:text-base uppercase hover:scale-\[1\.02\] transition-transform active:scale-95 rounded shadow-lg"/, 'className="amber-highlight px-5 py-2 font-bold tracking-widest text-sm sm:text-base uppercase hover:scale-[1.02] transition-transform active:scale-95 rounded shadow-sm dark:shadow-[0_0_15px_rgba(245,158,11,0.5)]"');

  // Input border fix
  content = content.replace(/border-b border-gray-200 dark:border-\[\#f59e0b\]/g, 'border-b border-[#C9A84C] dark:border-[#f59e0b]');

  fs.writeFileSync(file, content);
});

console.log('Fixed themes correctly!');
