"use client";

import { JSX, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ============================================
// TYPES
// ============================================
interface FooterSection {
  title: string;
  links: { label: string; href: string }[];
}

interface SocialLink {
  platform: "twitter" | "github" | "linkedin" | "instagram" | "youtube";
  href: string;
}

interface MegaFooterProps {
  /** Brand or company name */
  brandName: string;
  /** Short tagline under brand */
  tagline?: string;
  /** Link sections for footer columns */
  sections?: FooterSection[];
  /** Social media links */
  socialLinks?: SocialLink[];
  /** Show newsletter signup form */
  showNewsletter?: boolean;
  /** Newsletter section title */
  newsletterTitle?: string;
  /** Newsletter input placeholder */
  newsletterPlaceholder?: string;
  /** Callback when newsletter form is submitted */
  onNewsletterSubmit?: (email: string) => void;
  /** Custom copyright text */
  copyright?: string;
  /** Brand name text color for light mode */
  brandColor?: string;
  /** Brand name text color for dark mode */
  brandColorDark?: string;
  /** Tagline text color for light mode */
  taglineColor?: string;
  /** Tagline text color for dark mode */
  taglineColorDark?: string;
  /** Section title text color for light mode */
  sectionTitleColor?: string;
  /** Section title text color for dark mode */
  sectionTitleColorDark?: string;
  /** Link text color for light mode */
  linkColor?: string;
  /** Link text color for dark mode */
  linkColorDark?: string;
  /** Link hover color for light mode */
  linkHoverColor?: string;
  /** Link hover color for dark mode */
  linkHoverColorDark?: string;
  /** Social icon color for light mode */
  socialColor?: string;
  /** Social icon color for dark mode */
  socialColorDark?: string;
  /** Social icon hover color for light mode */
  socialHoverColor?: string;
  /** Social icon hover color for dark mode */
  socialHoverColorDark?: string;
  /** Newsletter title text color for light mode */
  newsletterTitleColor?: string;
  /** Newsletter title text color for dark mode */
  newsletterTitleColorDark?: string;
  /** Input text color for light mode */
  inputTextColor?: string;
  /** Input text color for dark mode */
  inputTextColorDark?: string;
  /** Input placeholder color for light mode */
  inputPlaceholderColor?: string;
  /** Input placeholder color for dark mode */
  inputPlaceholderColorDark?: string;
  /** Button text color for light mode */
  buttonTextColor?: string;
  /** Button text color for dark mode */
  buttonTextColorDark?: string;
  /** Bottom bar text color for light mode */
  bottomTextColor?: string;
  /** Bottom bar text color for dark mode */
  bottomTextColorDark?: string;
  /** Bottom bar link color for light mode */
  bottomLinkColor?: string;
  /** Bottom bar link color for dark mode */
  bottomLinkColorDark?: string;
  /** Bottom bar link hover color for light mode */
  bottomLinkHoverColor?: string;
  /** Bottom bar link hover color for dark mode */
  bottomLinkHoverColorDark?: string;
}

// ============================================
// SOCIAL ICONS (inline SVGs for zero deps)
// ============================================
const SocialIcons: Record<SocialLink["platform"], JSX.Element> = {
  twitter: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  github: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  ),
  linkedin: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  instagram: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
    </svg>
  ),
  youtube: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
};

// ============================================
// COMPONENT
// ============================================
export function MegaFooter({
  brandName,
  tagline,
  sections = [],
  socialLinks = [],
  showNewsletter = true,
  newsletterTitle = "Stay updated",
  newsletterPlaceholder = "Enter your email",
  onNewsletterSubmit,
  copyright,
  brandColor = "#18181b", // zinc-900
  brandColorDark = "#ffffff", // white
  taglineColor = "#52525b", // zinc-600
  taglineColorDark = "#a1a1aa", // zinc-400
  sectionTitleColor = "#18181b", // zinc-900
  sectionTitleColorDark = "#ffffff", // white
  linkColor = "#52525b", // zinc-600
  linkColorDark = "#a1a1aa", // zinc-400
  linkHoverColor = "#18181b", // zinc-900
  linkHoverColorDark = "#ffffff", // white
  socialColor = "#71717a", // zinc-500
  socialColorDark = "#a1a1aa", // zinc-400
  socialHoverColor = "#18181b", // zinc-900
  socialHoverColorDark = "#ffffff", // white
  newsletterTitleColor = "#18181b", // zinc-900
  newsletterTitleColorDark = "#ffffff", // white
  inputTextColor = "#18181b", // zinc-900
  inputTextColorDark = "#ffffff", // white
  inputPlaceholderColor = "#71717a", // zinc-500
  inputPlaceholderColorDark = "#a1a1aa", // zinc-400
  buttonTextColor = "#ffffff", // white
  buttonTextColorDark = "#18181b", // zinc-900
  bottomTextColor = "#71717a", // zinc-500
  bottomTextColorDark = "#a1a1aa", // zinc-400
  bottomLinkColor = "#71717a", // zinc-500
  bottomLinkColorDark = "#a1a1aa", // zinc-400
  bottomLinkHoverColor = "#18181b", // zinc-900
  bottomLinkHoverColorDark = "#ffffff", // white
}: MegaFooterProps) {
  const footerRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 85%",
            toggleActions: "play none none none",
            once: true,
          },
        })
        .fromTo(
          ".mega-footer-section",
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.15,
            ease: "power3.out",
          }
        )
        .fromTo(
          ".mega-footer-bottom",
          { opacity: 0 },
          { opacity: 1, duration: 0.6 },
          "-=0.25"
        );
    }, footerRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && onNewsletterSubmit) {
      onNewsletterSubmit(email);
    }
    setIsSubmitted(true);
    setEmail("");
    setTimeout(() => setIsSubmitted(false), 3000);
  };

  const copyrightText =
    copyright || `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`;

  return (
    <footer
      ref={footerRef}
      className="w-full bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 mega-footer"
    >
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12">
          {/* Brand Column */}
          <div className="mega-footer-section lg:col-span-4">
            <h2
              className="text-2xl font-bold mb-3 mega-brand"
              style={{ color: `var(--brand-color, ${brandColor})` }}
            >
              {brandName}
            </h2>
            {tagline && (
              <p
                className="mb-6 max-w-xs mega-tagline"
                style={{ color: `var(--tagline-color, ${taglineColor})` }}
              >
                {tagline}
              </p>
            )}

            {/* Social Links */}
            {socialLinks.length > 0 && (
              <div className="flex gap-4">
                {socialLinks.map((social, index) => (
                  <a
                    key={index}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors duration-200 hover:scale-110 transform mega-social"
                    style={{ color: `var(--social-color, ${socialColor})` }}
                    aria-label={social.platform}
                  >
                    {SocialIcons[social.platform]}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Link Sections */}
          {sections.map((section, index) => (
            <div
              key={index}
              className="mega-footer-section lg:col-span-2"
            >
              <h3
                className="text-sm font-semibold uppercase tracking-wider mb-4 mega-section-title"
                style={{ color: `var(--section-title-color, ${sectionTitleColor})` }}
              >
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <a
                      href={link.href}
                      className="text-sm transition-colors duration-200 mega-link"
                      style={{ color: `var(--link-color, ${linkColor})` }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          {showNewsletter && (
            <div className="mega-footer-section lg:col-span-4">
              <h3
                className="text-sm font-semibold uppercase tracking-wider mb-4 mega-newsletter-title"
                style={{ color: `var(--newsletter-title-color, ${newsletterTitleColor})` }}
              >
                {newsletterTitle}
              </h3>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={newsletterPlaceholder}
                    required
                    className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-shadow mega-input"
                    style={{ color: `var(--input-text-color, ${inputTextColor})` }}
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-zinc-900 dark:bg-white text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors duration-200 active:scale-95 transform mega-button"
                    style={{ color: `var(--button-text-color, ${buttonTextColor})` }}
                  >
                    Subscribe
                  </button>
                </div>
                {isSubmitted && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Thanks for subscribing!
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="mega-footer-bottom border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p
            className="text-sm mega-bottom-text"
            style={{ color: `var(--bottom-text-color, ${bottomTextColor})` }}
          >
            {copyrightText}
          </p>
          <div className="flex gap-6">
            <a
              href="/privacy"
              className="text-sm transition-colors mega-bottom-link"
              style={{ color: `var(--bottom-link-color, ${bottomLinkColor})` }}
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="text-sm transition-colors mega-bottom-link"
              style={{ color: `var(--bottom-link-color, ${bottomLinkColor})` }}
            >
              Terms and Conditions
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.dark) .mega-brand {
          --brand-color: ${brandColorDark} !important;
        }
        :global(.dark) .mega-tagline {
          --tagline-color: ${taglineColorDark} !important;
        }
        :global(.dark) .mega-section-title {
          --section-title-color: ${sectionTitleColorDark} !important;
        }
        :global(.dark) .mega-link {
          --link-color: ${linkColorDark} !important;
          --link-hover-color: ${linkHoverColorDark} !important;
        }
        :global(.dark) .mega-social {
          --social-color: ${socialColorDark} !important;
          --social-hover-color: ${socialHoverColorDark} !important;
        }
        :global(.dark) .mega-newsletter-title {
          --newsletter-title-color: ${newsletterTitleColorDark} !important;
        }
        :global(.dark) .mega-input {
          --input-text-color: ${inputTextColorDark} !important;
          --input-placeholder-color: ${inputPlaceholderColorDark} !important;
        }
        :global(.dark) .mega-button {
          --button-text-color: ${buttonTextColorDark} !important;
        }
        :global(.dark) .mega-bottom-text {
          --bottom-text-color: ${bottomTextColorDark} !important;
        }
        :global(.dark) .mega-bottom-link {
          --bottom-link-color: ${bottomLinkColorDark} !important;
          --bottom-link-hover-color: ${bottomLinkHoverColorDark} !important;
        }
        .mega-link:hover {
          color: var(--link-hover-color, ${linkHoverColor}) !important;
        }
        .mega-social:hover {
          color: var(--social-hover-color, ${socialHoverColor}) !important;
        }
        .mega-bottom-link:hover {
          color: var(--bottom-link-hover-color, ${bottomLinkHoverColor}) !important;
        }
        .mega-input::placeholder {
          color: var(--input-placeholder-color, ${inputPlaceholderColor});
        }
      `}</style>
    </footer>
  );
}