// Place at: src/components/SocialLinks.tsx
//
// RoadVerdict's Facebook/Instagram/TikTok links, shown once in the
// shared site footer (see layout.tsx) so they appear on every public
// page. Uses react-icons' Font Awesome brand set rather than
// lucide-react (already used elsewhere in the app) - lucide has no
// TikTok glyph, and mixing icon families for the other two would look
// visually inconsistent with it.
import { FaFacebook, FaInstagram, FaTiktok } from 'react-icons/fa6';

const SOCIAL_LINKS = [
  { name: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61594142271284', Icon: FaFacebook },
  { name: 'Instagram', href: 'https://www.instagram.com/RoadVerdict.web', Icon: FaInstagram },
  { name: 'TikTok', href: 'https://www.tiktok.com/@roadverdict', Icon: FaTiktok },
] as const;

export function SocialLinks() {
  return (
    <div className="site-footer__social">
      {SOCIAL_LINKS.map(({ name, href, Icon }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`RoadVerdict on ${name}`}
          className="site-footer__social-link"
        >
          <Icon size={18} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
