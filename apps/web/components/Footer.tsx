'use client';

import { useTheme } from './ThemeProvider';

const footerLinks = {
    Company: ['About Us', 'Blog', 'Careers', 'Press'],
    Support: ['Documentation', 'Help Center', 'Contact', 'Status'],
    Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy'],
};

export default function Footer() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <footer className={`relative z-10 border-t transition-colors duration-500 ${isDark ? 'bg-gray-950/95 border-white/10' : 'bg-white/95 border-black/10'}`}>

            {/* Top section */}
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
                <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5">

                    {/* Brand column */}
                    <div className="sm:col-span-2">
                        <a href="#" className="inline-flex items-center gap-2 mb-4 group">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 shadow-md shadow-emerald-500/30 group-hover:bg-emerald-400 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                                    <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.177A7.547 7.547 0 0 1 6.648 6.61a.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.545 3.75 3.75 0 0 1 3.255 3.717Z" clipRule="evenodd" />
                                </svg>
                            </span>
                            <span className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                Leaf<span className="text-emerald-400">line</span>
                            </span>
                        </a>

                        <p className={`text-sm leading-relaxed mb-6 max-w-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            A centralized digital command center for transparent, efficient public service grievance resolution.
                        </p>

                        {/* Social icons */}
                        <div className="flex items-center gap-3">
                            {[
                                { label: 'Twitter', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
                                { label: 'GitHub', path: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z' },
                                { label: 'LinkedIn', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
                            ].map(({ label, path }) => (
                                <a key={label} href="#" aria-label={label}
                                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${isDark ? 'border-white/10 text-gray-400 hover:border-emerald-500 hover:text-emerald-400' : 'border-black/10 text-gray-500 hover:border-emerald-500 hover:text-emerald-600'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                        <path d={path} />
                                    </svg>
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Link columns */}
                    {Object.entries(footerLinks).map(([category, links]) => (
                        <div key={category}>
                            <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {category}
                            </h3>
                            <ul className="space-y-2.5">
                                {links.map(link => (
                                    <li key={link}>
                                        <a href="#" className={`text-sm transition-colors hover:text-emerald-500 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {link}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom bar */}
            <div className={`border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        © {new Date().getFullYear()} JanSamadhan · PS-CRM. All rights reserved.
                    </p>
                    <div className="flex items-center gap-1">
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Made with</span>
                        <span className="text-sm">❤️</span>
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>for better public service</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
