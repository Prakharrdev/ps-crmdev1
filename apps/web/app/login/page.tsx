'use client';

import { MegaFooter } from "@/components/MegaFooter";
import AnimatedAuth from "@/components/AnimatedAuth";

export default function LoginPage() {
  return (
    <div className="flex flex-col min-h-screen ">
        <main>
      <AnimatedAuth 
        themeColor="#b58d80" // Changes the primary accent to blue
        glowColor="rgba(59, 130, 246, 0.4)"
        transitionTintColor="#d2b48c"
        backgroundColor="#d2b48c"
        backdropClassName="bg-gradient-to-br from-#d2c6be"
        leftPanelTitle="STAY CONNECTED!"
        leftPanelImage = 'Image1.jpg'
        rightPanelImage = 'Image2.jpg'
      />
      </main>
      <MegaFooter
        brandName="Bits"
        tagline="Designing delightful digital experiences."
        socialLinks={[
          { platform: "twitter", href: "https://twitter.com" },
          { platform: "github", href: "https://github.com/Medhansh-741/ps-crm"},
          { platform: "linkedin", href: "https://linkedin.com" },
        ]}
        showNewsletter={true}
        newsletterTitle="Stay updated"
        newsletterPlaceholder="Enter your email"
      />
    </div>
  );
}